import Foundation
import SQLite3

/// SQLite persistence. Uses the same `items` schema as the former Electron app, so its `notes.db`
/// is imported as-is on first launch. Next to it, `sync_meta` and `item_records` hold the iCloud sync
/// engine's state and each item's CloudKit system fields (see `CloudSync`).
final class Database {
    private var db: OpaquePointer?

    /// Called after local writes (not after applying changes that came from iCloud), so they can be uploaded.
    var onLocalChange: ((_ saved: [String], _ deleted: [String]) -> Void)?

    static var supportDirectory: URL {
        // Development override, e.g. to test against a scratch copy of the data.
        if let custom = ProcessInfo.processInfo.environment["ONE_LIST_DATA_DIR"] { return URL(fileURLWithPath: custom) }
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("One List", isDirectory: true)
    }

    /// Preferences. A development data directory (ONE_LIST_DATA_DIR) gets its own preferences too, so test
    /// runs never change the installed app's settings.
    nonisolated(unsafe) static let preferences: UserDefaults =
        ProcessInfo.processInfo.environment["ONE_LIST_DATA_DIR"] == nil ? .standard : UserDefaults(suiteName: "com.onelist.app.dev")!

    /// Where the Electron build kept its data.
    static var legacyDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("one-list", isDirectory: true)
    }

    init() {
        let fm = FileManager.default
        try? fm.createDirectory(at: Self.supportDirectory, withIntermediateDirectories: true)
        let url = Self.supportDirectory.appendingPathComponent("notes.db")
        let legacy = Self.legacyDirectory.appendingPathComponent("notes.db")
        if !fm.fileExists(atPath: url.path), fm.fileExists(atPath: legacy.path) {
            try? fm.copyItem(at: legacy, to: url)
        }

        guard sqlite3_open(url.path, &db) == SQLITE_OK else {
            fatalError("Unable to open database at \(url.path)")
        }
        exec("PRAGMA journal_mode = WAL")
        exec("""
            CREATE TABLE IF NOT EXISTS items (
              id TEXT PRIMARY KEY, type TEXT NOT NULL, position INTEGER NOT NULL,
              title TEXT, details TEXT, completed INTEGER DEFAULT 0, status TEXT, priority TEXT,
              due_date TEXT, category TEXT, indent INTEGER DEFAULT 0, ai_processing_status TEXT,
              text TEXT, created_at TEXT NOT NULL, updated_at TEXT, completed_at TEXT,
              parent_id TEXT, is_now INTEGER DEFAULT 0
            )
            """)
        // Legacy "title" rows were headings stored in `text`; they are plain items now.
        exec("UPDATE items SET type = 'todo', title = COALESCE(title, text) WHERE type = 'title'")
        exec("CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, value BLOB)")
        exec("CREATE TABLE IF NOT EXISTS item_records (id TEXT PRIMARY KEY, system_fields BLOB NOT NULL)")
    }

    func loadItems() -> [Item] {
        let sql = """
            SELECT id, position, title, details, completed, status, priority, due_date, category,
                   indent, is_now, ai_processing_status, created_at, updated_at, completed_at
            FROM items WHERE type = 'todo' ORDER BY position ASC
            """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return [] }
        defer { sqlite3_finalize(stmt) }

        var items: [Item] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            func text(_ i: Int32) -> String? {
                guard let c = sqlite3_column_text(stmt, i) else { return nil }
                let s = String(cString: c)
                return s.isEmpty ? nil : s
            }
            var item = Item()
            item.id = text(0) ?? UUID().uuidString
            item.position = Int(sqlite3_column_int64(stmt, 1))
            item.title = text(2) ?? ""
            item.details = text(3)
            item.completed = sqlite3_column_int(stmt, 4) != 0
            item.status = text(5).flatMap(TodoStatus.init(rawValue:))
            item.priority = text(6).flatMap(Priority.init(rawValue:))
            item.dueDate = DueDate.normalize(text(7))
            item.category = text(8)
            item.indent = Int(sqlite3_column_int(stmt, 9))
            item.isNow = sqlite3_column_int(stmt, 10) != 0
            item.aiStatus = text(11).flatMap(AIStatus.init(rawValue:))
            item.createdAt = text(12).flatMap(Self.parseDate) ?? .now
            item.updatedAt = text(13).flatMap(Self.parseDate)
            item.completedAt = text(14).flatMap(Self.parseDate)
            items.append(item)
        }
        return items
    }

    func save(_ items: [Item], notify: Bool = true) {
        guard !items.isEmpty else { return }
        let sql = """
            INSERT OR REPLACE INTO items (id, type, position, title, details, completed, status, priority,
              due_date, category, indent, is_now, ai_processing_status, created_at, updated_at, completed_at)
            VALUES (?, 'todo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return }
        defer { sqlite3_finalize(stmt) }

        exec("BEGIN")
        for item in items {
            bind(stmt, 1, item.id)
            sqlite3_bind_int64(stmt, 2, Int64(item.position))
            bind(stmt, 3, item.title)
            bind(stmt, 4, item.details)
            sqlite3_bind_int(stmt, 5, item.completed ? 1 : 0)
            bind(stmt, 6, item.status?.rawValue)
            bind(stmt, 7, item.priority?.rawValue)
            bind(stmt, 8, item.dueDate)
            bind(stmt, 9, item.category)
            sqlite3_bind_int(stmt, 10, Int32(item.indent))
            sqlite3_bind_int(stmt, 11, item.isNow ? 1 : 0)
            bind(stmt, 12, item.aiStatus?.rawValue)
            bind(stmt, 13, Self.formatDate(item.createdAt))
            bind(stmt, 14, item.updatedAt.map(Self.formatDate))
            bind(stmt, 15, item.completedAt.map(Self.formatDate))
            sqlite3_step(stmt)
            sqlite3_reset(stmt)
        }
        exec("COMMIT")
        if notify { onLocalChange?(items.map(\.id), []) }
    }

    func delete(ids: [String], notify: Bool = true) {
        guard !ids.isEmpty else { return }
        exec("BEGIN")
        for id in ids {
            run("DELETE FROM items WHERE id = ?", id)
        }
        exec("COMMIT")
        if notify { onLocalChange?([], ids) }
    }

    // MARK: - Sync metadata

    func syncValue(_ key: String) -> Data? {
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, "SELECT value FROM sync_meta WHERE key = ?", -1, &stmt, nil) == SQLITE_OK else { return nil }
        defer { sqlite3_finalize(stmt) }
        bind(stmt, 1, key)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return nil }
        return blob(stmt, 0)
    }

    func setSyncValue(_ value: Data?, for key: String) {
        if let value {
            var stmt: OpaquePointer?
            guard sqlite3_prepare_v2(db, "INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", -1, &stmt, nil) == SQLITE_OK else { return }
            defer { sqlite3_finalize(stmt) }
            bind(stmt, 1, key)
            bind(stmt, 2, value)
            sqlite3_step(stmt)
        } else {
            run("DELETE FROM sync_meta WHERE key = ?", key)
        }
    }

    /// CloudKit system fields (record ID, change tag) of an uploaded item; nil if it was never uploaded.
    func systemFields(for id: String) -> Data? {
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, "SELECT system_fields FROM item_records WHERE id = ?", -1, &stmt, nil) == SQLITE_OK else { return nil }
        defer { sqlite3_finalize(stmt) }
        bind(stmt, 1, id)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return nil }
        return blob(stmt, 0)
    }

    func setSystemFields(_ data: Data?, for id: String) {
        if let data {
            var stmt: OpaquePointer?
            guard sqlite3_prepare_v2(db, "INSERT OR REPLACE INTO item_records (id, system_fields) VALUES (?, ?)", -1, &stmt, nil) == SQLITE_OK else { return }
            defer { sqlite3_finalize(stmt) }
            bind(stmt, 1, id)
            bind(stmt, 2, data)
            sqlite3_step(stmt)
        } else {
            run("DELETE FROM item_records WHERE id = ?", id)
        }
    }

    /// Forgets all sync state (signed out of iCloud, or the cloud data was deleted). Local items stay.
    func resetSyncMetadata() {
        exec("DELETE FROM item_records")
        exec("DELETE FROM sync_meta")
    }

    // MARK: - Helpers

    private func exec(_ sql: String) {
        sqlite3_exec(db, sql, nil, nil, nil)
    }

    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    private func bind(_ stmt: OpaquePointer?, _ index: Int32, _ value: String?) {
        if let value { sqlite3_bind_text(stmt, index, value, -1, Self.transient) } else { sqlite3_bind_null(stmt, index) }
    }

    private func bind(_ stmt: OpaquePointer?, _ index: Int32, _ value: Data) {
        _ = value.withUnsafeBytes { sqlite3_bind_blob(stmt, index, $0.baseAddress, Int32(value.count), Self.transient) }
    }

    private func blob(_ stmt: OpaquePointer?, _ column: Int32) -> Data? {
        guard let bytes = sqlite3_column_blob(stmt, column) else { return nil }
        return Data(bytes: bytes, count: Int(sqlite3_column_bytes(stmt, column)))
    }

    /// Runs a statement with one text parameter.
    private func run(_ sql: String, _ value: String) {
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return }
        bind(stmt, 1, value)
        sqlite3_step(stmt)
        sqlite3_finalize(stmt)
    }

    private static func formatDate(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }

    private static func parseDate(_ string: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: string) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: string)
    }
}
