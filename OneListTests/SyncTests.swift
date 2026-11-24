import CloudKit
import Foundation
import Testing
@testable import One_List

/// iCloud sync: the item ↔ record mapping and how changes from other devices are merged.
/// Runs against the scheme's scratch data directory (ONE_LIST_DATA_DIR), where sync itself stays off.
@MainActor
struct SyncTests {
    @Test func syncIsOffInDevelopmentRuns() {
        #expect(CloudSync.containerIdentifier == nil)
        #expect(!AppStore().sync.status.isActive)
    }

    @Test func itemSurvivesRecordRoundTrip() {
        var item = Item()
        item.title = "Ship the iPhone app"
        item.details = "Notes"
        item.priority = .high
        item.dueDate = "2026-11-24"
        item.category = "Work"
        item.indent = 2
        item.position = 7
        item.isNow = true
        item.setStatus(.done)
        item.aiStatus = .enhanced
        item.updatedAt = Date(timeIntervalSince1970: 1_800_000_000)

        let record = CKRecord(recordType: CloudSync.recordType, recordID: CloudSync.recordID(item.id))
        CloudSync.fill(record, from: item)
        let back = CloudSync.item(from: record)

        #expect(back?.id == item.id)
        #expect(back?.title == item.title)
        #expect(back?.details == item.details)
        #expect(back?.priority == .high)
        #expect(back?.dueDate == "2026-11-24")
        #expect(back?.category == "Work")
        #expect(back?.indent == 2)
        #expect(back?.position == 7)
        #expect(back?.isNow == true)
        #expect(back?.status == .done)
        #expect(back?.completed == true)
        #expect(back?.aiStatus == .enhanced)
        #expect(back?.updatedAt == item.updatedAt)
    }

    @Test func queueStatesStayOnTheDevice() {
        var item = Item()
        item.aiStatus = .processing
        let record = CKRecord(recordType: CloudSync.recordType, recordID: CloudSync.recordID(item.id))
        CloudSync.fill(record, from: item)
        #expect(CloudSync.item(from: record)?.aiStatus == nil)
    }

    @Test func newerRemoteEditWins() {
        let store = AppStore()
        let id = store.addItem { $0.title = "Local" }
        var remote = store.item(id)!
        remote.title = "From iPhone"
        remote.updatedAt = .now.addingTimeInterval(60)
        store.applyRemote([remote], deleted: [])
        #expect(store.item(id)?.title == "From iPhone")
    }

    @Test func newerLocalEditIsKept() {
        let store = AppStore()
        let id = store.addItem { $0.title = "Local" }
        store.setTitle(id, "Edited here")
        var remote = store.item(id)!
        remote.title = "Stale"
        remote.updatedAt = .now.addingTimeInterval(-60)
        store.applyRemote([remote], deleted: [])
        #expect(store.item(id)?.title == "Edited here")
    }

    @Test func remoteInsertsAndDeletesKeepOrder() {
        let store = AppStore()
        let a = store.addItem { $0.title = "A" }
        let b = store.addItem(after: a) { $0.title = "B" }
        var inserted = Item()
        inserted.title = "Between"
        inserted.position = store.item(b)!.position // same slot: tie broken by id
        inserted.updatedAt = .now.addingTimeInterval(1)
        let before = store.items.filter { $0.id != a }.map { ($0.id, $0.updatedAt) }
        store.applyRemote([inserted], deleted: [a])

        #expect(store.item(a) == nil)
        #expect(store.item(inserted.id) != nil)
        // Sorted by position, and nothing renumbered: remote batches are partial and unordered, so
        // renumbering them would upload a scrambled order.
        #expect(store.items.map(\.position) == store.items.map(\.position).sorted())
        for (id, updatedAt) in before { #expect(store.item(id)?.updatedAt == updatedAt) }
    }

    @Test func partialUnorderedBatchKeepsPositions() {
        let store = AppStore()
        var batch: [Item] = []
        for position in [40, 3, 17] {
            var item = Item()
            item.title = "Remote \(position)"
            item.position = 1_000 + position
            item.updatedAt = .now.addingTimeInterval(1)
            batch.append(item)
        }
        store.applyRemote(batch, deleted: [])
        let ids = Set(batch.map(\.id)) // the scratch database is shared between runs
        let remote = store.items.filter { ids.contains($0.id) }
        #expect(remote.map(\.position) == [1_003, 1_017, 1_040])
    }
}
