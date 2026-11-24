import Foundation
import SwiftUI

/// Single source of truth: items (always sorted by position), selection, UI preferences and AI flows.
/// Every mutation is written straight to SQLite, so there is no debouncing or optimistic-rollback logic.
/// Local writes are uploaded to iCloud by `sync`; changes from other devices come back through `applyRemote`.
@Observable
final class AppStore {
    private(set) var items: [Item] = []

    /// The current task (cursor): shown in the detail sidebar, target of task commands.
    var activeItemID: String?
    /// A task text field that should take keyboard focus (with this caret) as soon as it is on screen.
    var focusRequest: FocusRequest?
    /// The task whose text field is being edited, if any.
    var editingID: String?
    /// Block selection (several tasks selected while not editing text). Empty = just the active task.
    var selection: Set<String> = []
    /// Fixed end of a shift-extended block selection.
    var selectionAnchor: String?

    // Collapsed projects / date groups in the list (persisted).
    var collapsed: Set<String> { didSet { defaults.set(Array(collapsed), forKey: "collapsedItems") } }
    var collapsedGroups: Set<DueCategory> {
        didSet { defaults.set(collapsedGroups.map(\.rawValue), forKey: "collapsedGroups") }
    }

    var isSidebarOpen = false
    var showAIInput = false
    var showUpdateDialog = false
    var changelog: ChangelogSession?
    /// Changes at midnight, so views that depend on "today" (completed today, Today/Tomorrow groups) refresh.
    var currentDay = Calendar.current.startOfDay(for: .now)
    var isFindingSimilar = false
    /// The window's undo manager (set by the root view). Structural edits register here, so ⌘Z
    /// interleaves naturally with text-field undo.
    weak var undoManager: UndoManager?

    // Persisted preferences
    var viewMode: ViewMode { didSet { defaults.set(viewMode.rawValue, forKey: "viewMode") } }
    var listGroupBy: ListGroupBy { didSet { defaults.set(listGroupBy.rawValue, forKey: "listGroupBy") } }
    var kanbanGroupBy: KanbanGroupBy { didSet { defaults.set(kanbanGroupBy.rawValue, forKey: "kanbanGroupBy") } }
    var showMetadata: Bool { didSet { defaults.set(showMetadata, forKey: "showMetadata") } }
    var showCompleted: Bool { didSet { defaults.set(showCompleted, forKey: "showCompleted") } }
    /// Focus mode has its own filters: by default it shows only open "Now" tasks and those done today.
    var focusShowCompleted: Bool { didSet { defaults.set(focusShowCompleted, forKey: "focusShowCompleted") } }
    var focusShowMetadata: Bool { didSet { defaults.set(focusShowMetadata, forKey: "focusShowMetadata") } }
    var focusTimerStyle: FocusTimerStyle { didSet { defaults.set(focusTimerStyle.rawValue, forKey: "focusTimerStyle") } }

    let settings = AISettings()

    private let db: Database
    /// iCloud sync with the user's other devices.
    let sync: CloudSync
    private let defaults = Database.preferences
    private var enrichmentQueue: [(id: String, retries: Int)] = []
    private var enrichmentTask: Task<Void, Never>?
    private var isEnriching = false
    private var undoGroupDepth = 0

    init() {
        let db = Database()
        let sync = CloudSync(db: db)
        db.onLocalChange = { [sync] saved, deleted in sync.enqueue(saved: saved, deleted: deleted) }
        self.db = db
        self.sync = sync
        viewMode = ViewMode(rawValue: defaults.string(forKey: "viewMode") ?? "") ?? .list
        listGroupBy = ListGroupBy(rawValue: defaults.string(forKey: "listGroupBy") ?? "") ?? .project
        kanbanGroupBy = KanbanGroupBy(rawValue: defaults.string(forKey: "kanbanGroupBy") ?? "") ?? .dueDate
        showMetadata = defaults.object(forKey: "showMetadata") as? Bool ?? false
        showCompleted = defaults.object(forKey: "showCompleted") as? Bool ?? true
        focusShowCompleted = defaults.object(forKey: "focusShowCompleted") as? Bool ?? false
        focusShowMetadata = defaults.object(forKey: "focusShowMetadata") as? Bool ?? false
        focusTimerStyle = FocusTimerStyle(rawValue: defaults.string(forKey: "focusTimerStyle") ?? "") ?? .digits
        collapsed = Set(defaults.stringArray(forKey: "collapsedItems") ?? [])
        collapsedGroups = Set((defaults.stringArray(forKey: "collapsedGroups") ?? []).compactMap(DueCategory.init(rawValue:)))

        items = db.loadItems()
        // Jobs don't survive a restart; let interrupted items be picked up again.
        var interrupted: [Item] = []
        for i in items.indices where items[i].isAIBusy {
            items[i].aiStatus = nil
            interrupted.append(items[i])
        }
        db.save(interrupted, notify: false)
        renumber()
        if items.isEmpty { addItem() }
        archiveOldDone()

        sync.localItem = { [weak self] id in self?.item(id) }
        sync.allItemIDs = { [weak self] in self?.items.map(\.id) ?? [] }
        sync.onRemoteChanges = { [weak self] changed, deleted in self?.applyRemote(changed, deleted: deleted) }
        sync.start()
        scheduleEnrichment()
    }

    // MARK: - Derived

    /// Non-archived items, used as AI context and for the sidebar.
    var todos: [Item] { items.filter { !$0.isArchived } }
    var nowTodos: [Item] { todos.filter(\.isNow) }
    /// The "Now" tasks shown in focus mode, open ones first.
    var focusTasks: [Item] {
        _ = currentDay // re-evaluated when the day changes
        let visible = nowTodos.filter { $0.isVisible(showCompleted: focusShowCompleted) }
        return visible.filter { !$0.completed } + visible.filter(\.completed)
    }
    var activeItem: Item? { activeItemID.flatMap(item) }
    var categories: [String] { Set(todos.compactMap(\.category)).sorted() }

    func item(_ id: String) -> Item? { items.first { $0.id == id } }
    func index(of id: String) -> Int? { items.firstIndex { $0.id == id } }

    /// Whether the next item (in position order) is nested under this one.
    func isParent(_ id: String) -> Bool {
        guard let i = index(of: id), i + 1 < items.count else { return false }
        return items[i + 1].indent > items[i].indent
    }

    /// Nearest preceding item with a smaller indent.
    func parent(of id: String) -> Item? {
        guard let i = index(of: id), items[i].indent > 0 else { return nil }
        return items[..<i].last { $0.indent < items[i].indent }
    }

    /// Direct children of an item.
    func children(of id: String) -> [Item] {
        guard let i = index(of: id) else { return [] }
        let base = items[i].indent
        return items[(i + 1)...].prefix { $0.indent > base }.filter { $0.indent == base + 1 && !$0.isArchived }
    }

    // MARK: - Selection & focus

    func select(_ id: String?) {
        selection = []
        selectionAnchor = nil
        guard activeItemID != id else { return }
        activeItemID = id
        scheduleEnrichment()
    }

    /// Selects a task and puts the text cursor into it.
    func focus(_ id: String, caret: FocusRequest.Caret = .end) {
        select(id)
        focusRequest = FocusRequest(id: id, caret: caret)
    }

    // MARK: - Mutations

    /// Inserts a new item after `afterID` (inheriting its indent), or at the end.
    @discardableResult
    func addItem(after afterID: String? = nil, configure: (inout Item) -> Void = { _ in }) -> String {
        var id = ""
        undoable("Add Task") { id = insertItem(after: afterID, configure: configure) }
        return id
    }

    private func insertItem(after afterID: String?, configure: (inout Item) -> Void) -> String {
        var item = Item()
        var insertAt = items.count
        if let afterID, let i = index(of: afterID) {
            insertAt = i + 1
            item.indent = items[i].indent
        }
        configure(&item)
        items.insert(item, at: insertAt)
        db.save([item])
        renumber()
        return item.id
    }

    /// Appends a new, empty item to a kanban column and focuses it.
    func addItem(in key: GroupKey) {
        focus(addItem { $0.assign(to: key) })
    }

    func update(_ id: String, _ change: (inout Item) -> Void) {
        guard let i = index(of: id) else { return }
        var item = items[i]
        change(&item)
        guard item != items[i] else { return }
        // Suggestion queue states are bookkeeping of this device: they neither count as an edit (which
        // would win over a newer edit from another device) nor get uploaded.
        var withoutAIStatus = item
        withoutAIStatus.aiStatus = items[i].aiStatus
        let isBookkeeping = withoutAIStatus == items[i] && item.aiStatus != .enhanced && item.aiStatus != .failed
        if !isBookkeeping { item.updatedAt = .now }
        items[i] = item
        db.save([item], notify: !isBookkeeping)
    }

    func setTitle(_ id: String, _ title: String) { update(id) { $0.title = title } }

    func setStatus(_ id: String, _ status: TodoStatus) { edit(id, "Change Status") { $0.setStatus(status) } }

    /// An undoable property change (sidebar pickers, drops, …). Typing goes through `update`,
    /// since text fields keep their own undo history.
    func edit(_ id: String, _ actionName: String, _ change: (inout Item) -> Void) {
        undoable(actionName) { update(id, change) }
    }

    func delete(_ ids: [String]) {
        undoable(ids.count == 1 ? "Delete Task" : "Delete Tasks") { remove(ids) }
    }

    private func remove(_ ids: [String]) {
        let set = Set(ids)
        items.removeAll { set.contains($0.id) }
        if let active = activeItemID, set.contains(active) { activeItemID = nil }
        db.delete(ids: ids)
        renumber()
        if items.isEmpty { _ = insertItem(after: nil) { _ in } }
    }

    /// Drag and drop in the outline: moves the task with its subtasks to `targetID`'s place.
    func move(_ id: String, onto targetID: String) {
        guard let moved = OutlineEdit.drop(items, id: id, onto: targetID) else { return }
        undoable("Move Task") { commit(moved) }
        reveal([id])
    }

    /// Drag into a column / date group.
    func move(_ id: String, into key: GroupKey) { edit(id, "Move Task") { $0.assign(to: key) } }

    func renameCategory(_ old: String, to new: String) {
        undoable("Rename Category") {
            for item in items where item.category == old { update(item.id) { $0.category = new } }
        }
    }

    /// Completed tasks are archived 24 hours after completion.
    func archiveOldDone() {
        let cutoff = Date.now.addingTimeInterval(-24 * 60 * 60)
        for item in items where item.completed && !item.isArchived && (item.completedAt ?? .distantFuture) < cutoff {
            update(item.id) { $0.status = .archived }
        }
    }

    /// Replaces the whole list (in display order) and persists only rows that were added, changed or removed.
    func commit(_ newItems: [Item]) {
        var next = newItems
        for i in next.indices where next[i].position != i { next[i].position = i }
        let previous = Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0) })
        let kept = Set(next.map(\.id))
        var changed: [Item] = []
        for i in next.indices where previous[next[i].id] != next[i] {
            next[i].updatedAt = .now
            changed.append(next[i])
        }
        db.delete(ids: items.map(\.id).filter { !kept.contains($0) })
        db.save(changed)
        items = next
        if let active = activeItemID, !kept.contains(active) { activeItemID = nil }
        selection.formIntersection(kept)
    }

    /// Makes positions match array order and persists only the rows that moved.
    private func renumber() {
        var changed: [Item] = []
        for i in items.indices where items[i].position != i {
            items[i].position = i
            items[i].updatedAt = .now
            changed.append(items[i])
        }
        db.save(changed)
    }

    // MARK: - Sync

    /// Merges changes from another device. Per item the newer edit wins; local edits that are newer stay
    /// (and are uploaded). Not undoable: undo only steps through this device's own edits.
    func applyRemote(_ changed: [Item], deleted: [String]) {
        var byID = Dictionary(items.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        var saved: [Item] = []
        for var remote in changed {
            if let local = byID[remote.id] {
                if local.modifiedAt > remote.modifiedAt { continue }
                // Suggestion jobs are per device; don't cancel one running here.
                if remote.aiStatus == nil, local.isAIBusy { remote.aiStatus = local.aiStatus }
                if remote == local { continue }
            }
            byID[remote.id] = remote
            saved.append(remote)
        }
        let removed = deleted.filter { byID[$0] != nil }
        for id in removed { byID[id] = nil }
        guard !saved.isEmpty || !removed.isEmpty else { return }

        // The blank starter task of a fresh install is dropped once real tasks arrive.
        var blank: [String] = []
        if !saved.isEmpty {
            blank = byID.values.filter {
                $0.title.isEmpty && $0.details == nil && $0.id != editingID
                    && db.systemFields(for: $0.id) == nil && !saved.map(\.id).contains($0.id)
            }.map(\.id)
            for id in blank { byID[id] = nil }
        }

        db.save(saved, notify: false)
        db.delete(ids: removed, notify: false)
        db.delete(ids: blank, notify: false)
        items = byID.values.sorted { ($0.position, $0.id) < ($1.position, $1.id) }
        renumber()

        let gone = Set(removed + blank)
        if let active = activeItemID, gone.contains(active) { activeItemID = nil }
        if let editing = editingID, gone.contains(editing) { editingID = nil }
        selection.subtract(gone)
        if items.isEmpty { _ = insertItem(after: nil) { _ in } }
        scheduleEnrichment()
    }

    // MARK: - AI changes

    func propose(_ changes: [ProposedChange], source: ChangelogSession.Source, input: String? = nil) {
        changelog = ChangelogSession(source: source, inputText: input, changes: changes)
    }

    func apply(_ changes: [ProposedChange]) {
        changelog = nil
        undoable("Apply AI Changes") {
        for change in changes {
            switch change.kind {
            case .add(let new):
                append(new)
            case .update(let existing, let updates), .setCompleted(let existing, let updates):
                update(existing.id) { updates.apply(to: &$0) }
            case .merge(let sources, let merged, _, _):
                remove(sources.map(\.id))
                append(merged)
            }
        }
        }
    }

    private func append(_ new: Item) {
        var item = new
        item.indent = 0
        item.position = items.count
        items.append(item)
        db.save([item])
    }

    /// Turns free text into proposed changes (new tasks, completions, reschedules) for review. Returns false
    /// when nothing actionable was found. Focus-session notes are matched against the "Now" tasks.
    func processText(_ text: String, fromFocusNotes: Bool = false) async throws -> Bool {
        guard let intelligence else { throw JevClient.Failure(message: Self.missingKeyMessage) }
        var changes = try await intelligence.interpret(text, existing: fromFocusNotes ? nowTodos : todos, categories: categories)
        if fromFocusNotes {
            for i in changes.indices where changes[i].reason == nil { changes[i].reason = "From your focus session notes" }
        }
        guard !changes.isEmpty else { return false }
        propose(changes, source: .aiInput, input: text)
        return true
    }

    func findSimilarTasks() async {
        guard let intelligence else { return }
        isFindingSimilar = true
        defer { isFindingSimilar = false }
        let todos = self.todos
        let groups: [SimilarGroup]
        do {
            groups = try await intelligence.findDuplicates(todos)
        } catch {
            changelog = ChangelogSession(source: .mergeButton, changes: [], error: error.localizedDescription)
            return
        }
        let changes = groups.map { group in
            ProposedChange(kind: .merge(sources: group.taskIDs.compactMap { id in todos.first { $0.id == id } },
                                        merged: group.merged, reason: group.reason, confidence: group.confidence),
                           confidence: Double(group.confidence) / 100)
        }
        propose(changes, source: .mergeButton)
    }

    // MARK: - Suggestions
    //
    // A new task gets a priority, due date and category suggestion once the user moves on to another task.
    // Only empty fields are filled, and only with confident answers; titles are never changed. Jev answers
    // in well under a second, so jobs run almost right away (a short delay batches bursts like a paste).

    static let missingKeyMessage = "Add your Jev API key in Settings to use AI features."

    var intelligence: TaskIntelligence? {
        settings.hasApiKey ? TaskIntelligence(client: JevClient(apiKey: settings.apiKey)) : nil
    }

    func scheduleEnrichment() {
        guard settings.hasApiKey, settings.autoSuggest else { return }
        let queued = Set(enrichmentQueue.map(\.id))
        let candidates = items.filter {
            $0.aiStatus == nil && !$0.title.trimmingCharacters(in: .whitespaces).isEmpty
                && $0.id != activeItemID && !queued.contains($0.id)
        }
        guard !candidates.isEmpty else { return }
        for item in candidates {
            enrichmentQueue.append((item.id, 0))
            update(item.id) { $0.aiStatus = .pending }
        }
        startEnrichmentTimer()
    }

    /// "Suggest Details" in the inspector: asks right away and replaces fields with confident answers.
    func reenrich(_ id: String) {
        guard let intelligence, let item = item(id) else { return }
        let categories = self.categories
        update(id) { $0.aiStatus = .processing }
        Task {
            do {
                let suggestion = try await intelligence.suggest(for: item, categories: categories)
                applySuggestion(suggestion, to: id, overwrite: true)
            } catch {
                update(id) { $0.aiStatus = .failed }
            }
        }
    }

    private func startEnrichmentTimer() {
        enrichmentTask?.cancel()
        enrichmentTask = Task {
            try? await Task.sleep(for: .milliseconds(800))
            guard !Task.isCancelled else { return }
            await runEnrichmentBatch()
        }
    }

    private func runEnrichmentBatch() async {
        guard !isEnriching, !enrichmentQueue.isEmpty, let intelligence else { return }
        isEnriching = true
        let batch = Array(enrichmentQueue.prefix(8))
        enrichmentQueue.removeFirst(batch.count)

        let jobs = batch.compactMap { job in item(job.id).map { (id: job.id, item: $0) } }
        for job in jobs { update(job.id) { $0.aiStatus = .processing } }
        let categories = self.categories
        // All requests start at once and are awaited afterwards.
        let requests = jobs.map { job in Task { try? await intelligence.suggest(for: job.item, categories: categories) } }
        var results: [String: TaskIntelligence.Suggestion] = [:]
        for (job, request) in zip(jobs, requests) { if let suggestion = await request.value { results[job.id] = suggestion } }

        for job in batch where item(job.id) != nil {
            if job.id == activeItemID {
                // The user is on this task (maybe typing); retry once they move on.
                update(job.id) { $0.aiStatus = nil }
            } else if let suggestion = results[job.id] {
                applySuggestion(suggestion, to: job.id, overwrite: false)
            } else if job.retries < 3 {
                enrichmentQueue.append((job.id, job.retries + 1))
                update(job.id) { $0.aiStatus = .pending }
            } else {
                update(job.id) { $0.aiStatus = .failed }
            }
        }
        isEnriching = false
        if !enrichmentQueue.isEmpty { startEnrichmentTimer() }
    }

    private func applySuggestion(_ suggestion: TaskIntelligence.Suggestion, to id: String, overwrite: Bool) {
        update(id) { item in
            if let priority = suggestion.priority, overwrite || item.priority == nil { item.priority = priority }
            if let category = suggestion.category, overwrite || item.category == nil { item.category = category }
            if let dueDate = suggestion.dueDate, overwrite || item.dueDate == nil { item.dueDate = dueDate }
            item.aiStatus = .enhanced
        }
    }

    // MARK: - Undo

    /// Runs `body`; if it changed the items, registers one undo step restoring the previous state.
    /// Nested calls collapse into the outermost step.
    func undoable(_ actionName: String, _ body: () -> Void) {
        undoGroupDepth += 1
        let before = UndoState(items: items, activeID: activeItemID, wasEditing: editingID != nil)
        body()
        undoGroupDepth -= 1
        guard undoGroupDepth == 0, before.items != items, let undoManager else { return }
        undoManager.registerUndo(withTarget: self) { $0.restore(before, actionName: actionName) }
        undoManager.setActionName(actionName)
    }

    /// The list plus where the cursor was, so undo/redo put it back.
    struct UndoState {
        var items: [Item]
        var activeID: String?
        var wasEditing: Bool
    }

    /// Restores a snapshot and registers the inverse (so redo works).
    private func restore(_ state: UndoState, actionName: String) {
        let current = UndoState(items: items, activeID: activeItemID, wasEditing: editingID != nil)
        undoManager?.registerUndo(withTarget: self) { $0.restore(current, actionName: actionName) }
        undoManager?.setActionName(actionName)
        commit(state.items)
        guard let id = state.activeID, item(id) != nil else { return }
        if state.wasEditing { focus(id) } else { select(id) }
    }
}
