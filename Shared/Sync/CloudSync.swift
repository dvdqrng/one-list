import CloudKit
import Foundation
#if os(macOS)
import AppKit
import Security
#else
import UIKit
#endif

/// Realtime iCloud sync of the list between the user's Macs, iPhones and iPads.
///
/// Every item is one CloudKit record in a custom zone of the user's *private* database, driven by
/// `CKSyncEngine`: it subscribes to the zone, receives a push as soon as another device saves, batches
/// uploads and retries when offline. Local SQLite stays the source of truth for the UI; this class only
/// moves rows in and out. Conflicts resolve per item, last writer wins (by `Item.modifiedAt`). Titles,
/// notes and categories are stored as encrypted fields, so they are end-to-end encrypted in iCloud.
@Observable
final class CloudSync {
    enum Status: Equatable {
        /// Sync can't run: not set up in this build, or no iCloud account. The message explains why.
        case unavailable(String)
        case starting
        case syncing
        case upToDate
        case failed(String)

        var title: String {
            switch self {
            case .unavailable: "Off"
            case .starting: "Connecting…"
            case .syncing: "Syncing…"
            case .upToDate: "Up to Date"
            case .failed: "Sync Problem"
            }
        }

        var symbol: String {
            switch self {
            case .unavailable: "icloud.slash"
            case .starting, .syncing: "arrow.triangle.2.circlepath.icloud"
            case .upToDate: "checkmark.icloud"
            case .failed: "exclamationmark.icloud"
            }
        }

        var detail: String? {
            switch self {
            case .unavailable(let message), .failed(let message): message
            default: nil
            }
        }

        var isActive: Bool {
            switch self {
            case .starting, .syncing, .upToDate, .failed: true
            case .unavailable: false
            }
        }
    }

    private(set) var status: Status = .starting
    private(set) var lastSync: Date?

    /// Applies changes that came from iCloud: changed (or new) items and the ids of deleted ones.
    var onRemoteChanges: ((_ changed: [Item], _ deleted: [String]) -> Void)?
    /// The current local version of an item, for uploading.
    var localItem: ((String) -> Item?)?
    /// All local item ids (first upload, or after the iCloud data was reset).
    var allItemIDs: (() -> [String])?

    static let zoneID = CKRecordZone.ID(zoneName: "OneList", ownerName: CKCurrentUserDefaultName)
    static let recordType = "Item"
    private static let stateKey = "engineState"

    private let db: Database
    private var engine: CKSyncEngine?
    private var container: CKContainer?
    /// Local changes made before the engine started; handed to it once it runs.
    private var queuedSaves: Set<String> = []
    private var queuedDeletes: Set<String> = []
    private var sendTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?
    private var observers: [NSObjectProtocol] = []

    init(db: Database) {
        self.db = db
    }

    // MARK: - Configuration

    /// The CloudKit container from Info.plist (`OneListCloudKitContainer`), if this build may use it.
    /// Development runs against a scratch data folder (ONE_LIST_DATA_DIR) stay offline unless ONE_LIST_SYNC is set.
    static var containerIdentifier: String? {
        let env = ProcessInfo.processInfo.environment
        if env["ONE_LIST_DATA_DIR"] != nil && env["ONE_LIST_SYNC"] == nil { return nil }
        guard let id = Bundle.main.object(forInfoDictionaryKey: "OneListCloudKitContainer") as? String,
              !id.isEmpty, !id.hasPrefix("$(") else { return nil }
        #if os(macOS)
        // Builds signed without iCloud (e.g. ad-hoc CI builds) would crash on first CloudKit use.
        guard hasEntitlement(for: id) else { return nil }
        #endif
        return id
    }

    #if os(macOS)
    private static func hasEntitlement(for container: String) -> Bool {
        guard let task = SecTaskCreateFromSelf(nil),
              let value = SecTaskCopyValueForEntitlement(task, "com.apple.developer.icloud-container-identifiers" as CFString, nil)
        else { return false }
        return (value as? [String])?.contains(container) ?? false
    }
    #endif

    // MARK: - Lifecycle

    func start() {
        guard engine == nil else { return }
        guard let id = Self.containerIdentifier else {
            status = .unavailable("iCloud sync isn’t enabled in this build of One List.")
            return
        }
        let container = CKContainer(identifier: id)
        self.container = container

        let saved = db.syncValue(Self.stateKey)
            .flatMap { try? JSONDecoder().decode(CKSyncEngine.State.Serialization.self, from: $0) }
        var configuration = CKSyncEngine.Configuration(database: container.privateCloudDatabase,
                                                       stateSerialization: saved, delegate: self)
        configuration.automaticallySync = true
        let engine = CKSyncEngine(configuration)
        self.engine = engine

        if saved == nil {
            uploadEverything()
        }
        flushQueued()
        observeApp()
        Task { await refreshAccountStatus() }
        startPolling()
    }

    /// Fetches and sends right away (pull to refresh, "Sync Now", app activation).
    func syncNow() async {
        guard let engine else { return }
        do {
            try await engine.fetchChanges()
            try await engine.sendChanges()
        } catch {
            handle(error)
        }
    }

    private func refreshAccountStatus() async {
        guard let container else { return }
        let accountStatus = (try? await container.accountStatus()) ?? .couldNotDetermine
        switch accountStatus {
        case .available:
            if case .unavailable = status { status = .starting }
            if status == .starting { status = .syncing }
        case .noAccount:
            status = .unavailable("Sign in to iCloud to sync your list across devices.")
        case .restricted:
            status = .unavailable("iCloud is restricted on this device.")
        case .temporarilyUnavailable:
            status = .unavailable("iCloud is temporarily unavailable. Your changes are kept and sync later.")
        default:
            status = .unavailable("iCloud couldn’t be reached. Your changes are kept and sync later.")
        }
    }

    // MARK: - Local changes

    /// Called for every local write; uploads follow within a fraction of a second.
    func enqueue(saved: [String], deleted: [String]) {
        guard engine != nil else {
            queuedSaves.formUnion(saved)
            queuedSaves.subtract(deleted)
            queuedDeletes.formUnion(deleted)
            return
        }
        add(saves: saved, deletes: deleted)
        scheduleSend()
    }

    private func flushQueued() {
        guard !queuedSaves.isEmpty || !queuedDeletes.isEmpty else { return }
        add(saves: Array(queuedSaves), deletes: Array(queuedDeletes))
        queuedSaves = []
        queuedDeletes = []
        scheduleSend()
    }

    private func add(saves: [String], deletes: [String]) {
        guard let engine else { return }
        var changes = saves.map { CKSyncEngine.PendingRecordZoneChange.saveRecord(Self.recordID($0)) }
        for id in deletes {
            let recordID = Self.recordID(id)
            // Never uploaded: there is nothing to delete in iCloud, just drop a pending upload.
            if db.systemFields(for: id) == nil {
                engine.state.remove(pendingRecordZoneChanges: [.saveRecord(recordID)])
            } else {
                changes.append(.deleteRecord(recordID))
            }
        }
        if !changes.isEmpty { engine.state.add(pendingRecordZoneChanges: changes) }
    }

    /// (Re)creates the zone and uploads every item: the first sync on this device, a new iCloud account,
    /// or after the iCloud data was deleted.
    private func uploadEverything() {
        guard let engine else { return }
        engine.state.add(pendingDatabaseChanges: [.saveZone(CKRecordZone(zoneID: Self.zoneID))])
        let ids = allItemIDs?() ?? []
        engine.state.add(pendingRecordZoneChanges: ids.map { .saveRecord(Self.recordID($0)) })
    }

    /// Typing produces a burst of writes; send shortly after it settles so other devices update almost live.
    private func scheduleSend() {
        sendTask?.cancel()
        sendTask = Task {
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled, let engine else { return }
            do { try await engine.sendChanges() } catch { handle(error) }
        }
    }

    /// Pushes do the realtime work; while the app is in front, a slow poll covers missed or delayed pushes.
    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                guard !Task.isCancelled, let engine else { return }
                try? await engine.fetchChanges()
            }
        }
    }

    private func observeApp() {
        let center = NotificationCenter.default
        #if os(macOS)
        let active = NSApplication.didBecomeActiveNotification
        let inactive = NSApplication.didResignActiveNotification
        #else
        let active = UIApplication.didBecomeActiveNotification
        let inactive = UIApplication.didEnterBackgroundNotification
        #endif
        observers.append(center.addObserver(forName: active, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.startPolling()
                Task { await self.syncNow() }
            }
        })
        observers.append(center.addObserver(forName: inactive, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.pollTask?.cancel()
                // Don't leave edits behind when the app goes away.
                guard let engine = self.engine else { return }
                #if os(iOS)
                // iOS suspends the app right away; ask for time to finish the upload.
                let background = UIApplication.shared.beginBackgroundTask(withName: "Sync")
                Task {
                    try? await engine.sendChanges()
                    UIApplication.shared.endBackgroundTask(background)
                }
                #else
                Task { try? await engine.sendChanges() }
                #endif
            }
        })
        observers.append(center.addObserver(forName: .CKAccountChanged, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                Task { await self.refreshAccountStatus() }
            }
        })
    }

    private func handle(_ error: Error) {
        guard let error = error as? CKError else { return }
        switch error.code {
        case .networkFailure, .networkUnavailable, .serviceUnavailable, .requestRateLimited, .zoneBusy, .operationCancelled:
            break // the engine retries on its own
        case .notAuthenticated:
            status = .unavailable("Sign in to iCloud to sync your list across devices.")
        case .quotaExceeded:
            status = .failed("Your iCloud storage is full.")
        default:
            status = .failed(error.localizedDescription)
        }
    }

    // MARK: - Records

    static func recordID(_ itemID: String) -> CKRecord.ID { CKRecord.ID(recordName: itemID, zoneID: zoneID) }

    private func record(for recordID: CKRecord.ID) -> CKRecord? {
        let id = recordID.recordName
        let systemFields = db.systemFields(for: id)
        // A blank task that never left this device stays local until it gets text.
        guard let item = localItem?(id), !(systemFields == nil && item.title.isEmpty && item.details == nil) else {
            engine?.state.remove(pendingRecordZoneChanges: [.saveRecord(recordID)])
            return nil
        }
        let record = systemFields.flatMap(Self.decodeSystemFields) ?? CKRecord(recordType: Self.recordType, recordID: recordID)
        Self.fill(record, from: item)
        return record
    }

    static func fill(_ record: CKRecord, from item: Item) {
        record.encryptedValues["title"] = item.title
        record.encryptedValues["details"] = item.details
        record.encryptedValues["category"] = item.category
        record["completed"] = item.completed
        record["status"] = item.status?.rawValue
        record["priority"] = item.priority?.rawValue
        record["dueDate"] = item.dueDate
        record["indent"] = item.indent
        record["position"] = item.position
        record["isNow"] = item.isNow
        // Queue states (pending / processing) belong to the device doing the work.
        record["aiStatus"] = item.aiStatus == .enhanced || item.aiStatus == .failed ? item.aiStatus?.rawValue : nil
        record["createdAt"] = item.createdAt
        record["updatedAt"] = item.updatedAt
        record["completedAt"] = item.completedAt
    }

    static func item(from record: CKRecord) -> Item? {
        guard record.recordType == recordType else { return nil }
        var item = Item()
        item.id = record.recordID.recordName
        item.title = record.encryptedValues["title"] ?? ""
        item.details = record.encryptedValues["details"]
        item.category = record.encryptedValues["category"]
        item.completed = record["completed"] ?? false
        item.status = (record["status"] as String?).flatMap(TodoStatus.init(rawValue:))
        item.priority = (record["priority"] as String?).flatMap(Priority.init(rawValue:))
        item.dueDate = DueDate.normalize(record["dueDate"])
        item.indent = record["indent"] ?? 0
        item.position = record["position"] ?? 0
        item.isNow = record["isNow"] ?? false
        item.aiStatus = (record["aiStatus"] as String?).flatMap(AIStatus.init(rawValue:))
        item.createdAt = record["createdAt"] ?? record.creationDate ?? .now
        item.updatedAt = record["updatedAt"]
        item.completedAt = record["completedAt"]
        return item
    }

    private static func encodeSystemFields(_ record: CKRecord) -> Data {
        let coder = NSKeyedArchiver(requiringSecureCoding: true)
        record.encodeSystemFields(with: coder)
        coder.finishEncoding()
        return coder.encodedData
    }

    private static func decodeSystemFields(_ data: Data) -> CKRecord? {
        guard let coder = try? NSKeyedUnarchiver(forReadingFrom: data) else { return nil }
        coder.requiresSecureCoding = true
        defer { coder.finishDecoding() }
        return CKRecord(coder: coder)
    }
}

// MARK: - CKSyncEngineDelegate

extension CloudSync: CKSyncEngineDelegate {
    func handleEvent(_ event: CKSyncEngine.Event, syncEngine: CKSyncEngine) async {
        switch event {
        case .stateUpdate(let update):
            db.setSyncValue(try? JSONEncoder().encode(update.stateSerialization), for: Self.stateKey)

        case .accountChange(let change):
            switch change.changeType {
            case .signIn:
                status = .syncing
                uploadEverything()
            case .switchAccounts:
                // The list stays on this device and moves to the new account.
                db.resetSyncMetadata()
                uploadEverything()
            case .signOut:
                db.resetSyncMetadata()
                status = .unavailable("Sign in to iCloud to sync your list across devices.")
            @unknown default:
                break
            }

        case .fetchedDatabaseChanges(let changes):
            // The zone was deleted elsewhere (e.g. "Delete data from iCloud"): start over from this device.
            if changes.deletions.contains(where: { $0.zoneID == Self.zoneID }) {
                db.resetSyncMetadata()
                uploadEverything()
            }

        case .fetchedRecordZoneChanges(let changes):
            var changed: [Item] = []
            for modification in changes.modifications {
                let record = modification.record
                guard let item = Self.item(from: record) else { continue }
                db.setSystemFields(Self.encodeSystemFields(record), for: item.id)
                changed.append(item)
            }
            let deleted = changes.deletions.map(\.recordID.recordName)
            for id in deleted { db.setSystemFields(nil, for: id) }
            if !changed.isEmpty || !deleted.isEmpty { onRemoteChanges?(changed, deleted) }

        case .sentRecordZoneChanges(let sent):
            handleSent(sent, engine: syncEngine)

        case .willFetchChanges, .willSendChanges:
            if status.isActive { status = .syncing }

        case .didFetchChanges, .didSendChanges:
            if status.isActive {
                status = .upToDate
                lastSync = .now
            }

        case .sentDatabaseChanges, .willFetchRecordZoneChanges, .didFetchRecordZoneChanges:
            break

        @unknown default:
            break
        }
    }

    func nextRecordZoneChangeBatch(_ context: CKSyncEngine.SendChangesContext,
                                   syncEngine: CKSyncEngine) async -> CKSyncEngine.RecordZoneChangeBatch? {
        let scope = context.options.scope
        let changes = syncEngine.state.pendingRecordZoneChanges.filter { scope.contains($0) }
        guard !changes.isEmpty else { return nil }
        return await CKSyncEngine.RecordZoneChangeBatch(pendingChanges: changes) { recordID in
            await self.record(for: recordID)
        }
    }

    private func handleSent(_ sent: CKSyncEngine.Event.SentRecordZoneChanges, engine: CKSyncEngine) {
        for record in sent.savedRecords {
            db.setSystemFields(Self.encodeSystemFields(record), for: record.recordID.recordName)
        }
        for recordID in sent.deletedRecordIDs { db.setSystemFields(nil, for: recordID.recordName) }

        var resend: [CKSyncEngine.PendingRecordZoneChange] = []
        var serverWins: [Item] = []
        var needsZone = false
        for failure in sent.failedRecordSaves {
            let recordID = failure.record.recordID
            switch failure.error.code {
            case .serverRecordChanged:
                // Someone else saved this item first. Keep whichever change is newer.
                guard let server = failure.error.serverRecord, let remote = Self.item(from: server) else {
                    resend.append(.saveRecord(recordID))
                    continue
                }
                db.setSystemFields(Self.encodeSystemFields(server), for: recordID.recordName)
                if let local = localItem?(recordID.recordName), local.modifiedAt > remote.modifiedAt {
                    resend.append(.saveRecord(recordID))
                } else {
                    serverWins.append(remote)
                }
            case .zoneNotFound:
                needsZone = true
                resend.append(.saveRecord(recordID))
            case .unknownItem:
                // Deleted on the server meanwhile; upload it as a new record.
                db.setSystemFields(nil, for: recordID.recordName)
                resend.append(.saveRecord(recordID))
            case .networkFailure, .networkUnavailable, .zoneBusy, .serviceUnavailable, .notAuthenticated,
                 .operationCancelled, .requestRateLimited:
                break // retried by the engine
            default:
                status = .failed(failure.error.localizedDescription)
            }
        }
        if needsZone { engine.state.add(pendingDatabaseChanges: [.saveZone(CKRecordZone(zoneID: Self.zoneID))]) }
        if !resend.isEmpty { engine.state.add(pendingRecordZoneChanges: resend) }
        if !serverWins.isEmpty { onRemoteChanges?(serverWins, []) }
    }
}
