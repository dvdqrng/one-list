import Foundation

enum TodoStatus: String, Codable, CaseIterable, Sendable {
    case due, inProgress = "in-progress", done, archived

    var label: String {
        switch self {
        case .due: "Due"
        case .inProgress: "In Progress"
        case .done: "Done"
        case .archived: "Archived"
        }
    }
}

enum Priority: String, Codable, CaseIterable, Sendable {
    case low, medium, high
}

enum AIStatus: String, Codable, Sendable {
    case pending, processing, enhanced, failed
}

/// The single entity of the app. Hierarchy is expressed purely through `position` + `indent`:
/// an item at indent 0 followed by deeper-indented items is a "project".
struct Item: Identifiable, Hashable, Sendable {
    var id: String = UUID().uuidString.lowercased()
    var position: Int = 0
    var title: String = ""
    var details: String?
    var completed: Bool = false
    var status: TodoStatus?
    var priority: Priority?
    /// Local calendar day, always `yyyy-MM-dd`.
    var dueDate: String?
    var category: String?
    var indent: Int = 0
    var isNow: Bool = false
    var aiStatus: AIStatus?
    var createdAt: Date = .now
    var updatedAt: Date?
    var completedAt: Date?

    /// Status shown in the UI. Older rows may have no explicit status.
    var effectiveStatus: TodoStatus { status ?? (completed ? .done : .due) }
    var isArchived: Bool { status == .archived }
    /// Whether the task is listed. With completed tasks hidden, those completed today stay visible —
    /// so today's progress remains on screen — and everything finished earlier is hidden.
    func isVisible(showCompleted: Bool, now: Date = .now) -> Bool {
        guard !isArchived else { return false }
        guard completed, !showCompleted else { return true }
        return completedAt.map { Calendar.current.isDate($0, inSameDayAs: now) } ?? false
    }

    /// When the item last changed; decides which side wins when two devices edited it (last writer wins).
    var modifiedAt: Date { updatedAt ?? createdAt }

    var hasMetadata: Bool { priority != nil || dueDate != nil || category != nil }
    var isAIBusy: Bool { aiStatus == .pending || aiStatus == .processing }

    /// Gives the item the property a group/column stands for (used for drops and for new items).
    mutating func assign(to key: GroupKey) {
        switch key {
        case .due(.now): isNow = true
        case .due(let c): isNow = false; dueDate = DueDate.representative(for: c)
        case .priority(let p): priority = p
        case .status(let s): setStatus(s)
        case .category(let c): category = c
        case .project: break
        }
    }

    /// Sets status and keeps `completed` / `completedAt` consistent (completedAt drives auto-archiving).
    mutating func setStatus(_ newStatus: TodoStatus) {
        let isDone = newStatus == .done || newStatus == .archived
        if isDone && !completed { completedAt = .now }
        if !isDone { completedAt = nil }
        status = newStatus
        completed = isDone
    }
}

/// Partial changes proposed by the AI for an existing item.
struct ItemUpdates: Sendable, Equatable {
    var title: String?
    var details: String?
    var completed: Bool?
    var priority: Priority?
    var dueDate: String?
    var category: String?

    var isEmpty: Bool { self == ItemUpdates() }

    func apply(to item: inout Item) {
        if let title { item.title = title }
        if let details { item.details = details }
        if let priority { item.priority = priority }
        if let dueDate { item.dueDate = dueDate }
        if let category { item.category = category }
        if let completed { item.setStatus(completed ? .done : .due) }
    }

    /// Field-by-field (label, old, new) rows for the review dialog. `completed` is shown as a status change instead.
    func fieldChanges(from item: Item) -> [(String, String, String)] {
        var rows: [(String, String, String)] = []
        func add(_ key: String, _ old: String?, _ new: String?) {
            guard let new else { return }
            rows.append((key, old ?? "none", new))
        }
        add("title", item.title, title)
        add("details", item.details, details)
        add("priority", item.priority?.rawValue, priority?.rawValue)
        add("dueDate", item.dueDate.map(DueDate.format), dueDate.map(DueDate.format))
        add("category", item.category, category)
        return rows
    }
}

enum ChangeKind: Sendable {
    case add(Item)
    case update(Item, ItemUpdates)
    /// An update whose `completed` flag changes.
    case setCompleted(Item, ItemUpdates)
    case merge(sources: [Item], merged: Item, reason: String, confidence: Int)
}

struct ProposedChange: Identifiable, Sendable {
    let id = UUID()
    var kind: ChangeKind
    /// Why the change is proposed (for notes: the sentence it came from).
    var reason: String?
    /// How sure the model is (0…1); uncertain proposals start unchecked in the review sheet.
    var confidence: Double? = nil

    var isConfident: Bool { (confidence ?? 1) >= 0.6 }
}

struct ChangelogSession: Identifiable {
    enum Source { case aiInput, mergeButton }
    let id = UUID()
    var source: Source
    var inputText: String?
    var changes: [ProposedChange]
    /// Set when the AI request failed; the dialog then explains why instead of listing changes.
    var error: String?
}

/// Ask a task's text field to take keyboard focus and place the caret.
struct FocusRequest: Equatable {
    enum Caret: Equatable { case start, end, offset(Int) }
    var id: String
    var caret: Caret = .end
}

enum ViewMode: String { case list, kanban }
enum ListGroupBy: String { case project, dueDate }
enum KanbanGroupBy: String, CaseIterable {
    case dueDate, priority, status, category, project

    var label: String {
        switch self {
        case .dueDate: "Due Date"
        case .priority: "Priority"
        case .status: "Status"
        case .category: "Category"
        case .project: "Project"
        }
    }
}
