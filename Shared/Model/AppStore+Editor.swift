import Foundation

/// Keyboard-first editing of the list: selection, block commands (used by the Task menu and selection mode)
/// and the text-level operations behind Return / Backspace / Delete / paste in a task.
extension AppStore {
    // MARK: Outline

    var outline: [OutlineEntry] {
        _ = currentDay // re-evaluated when the day changes
        return Outline.entries(items, groupBy: listGroupBy, showCompleted: showCompleted,
                        collapsed: collapsed, collapsedGroups: collapsedGroups)
    }

    /// Visible tasks in list order (what ↑/↓ walk through in selection mode).
    var visibleTaskIDs: [String] {
        viewMode == .list ? outline.compactMap(\.item?.id)
            : Grouping.kanbanColumns(items, groupBy: kanbanGroupBy, showCompleted: showCompleted).flatMap { $0.items.map(\.id) }
    }

    /// The tasks commands act on: the block selection, or the active task.
    var targetIDs: [String] {
        if !selection.isEmpty { return items.map(\.id).filter(selection.contains) }
        return activeItemID.flatMap { item($0) == nil ? nil : [$0] } ?? []
    }

    private var targetRoots: [String] { Outline.blockRoots(items, Set(targetIDs)) }

    private func isListed(_ item: Item) -> Bool { item.isVisible(showCompleted: showCompleted) }

    /// Expands collapsed ancestors so the tasks are visible.
    func reveal(_ ids: [String]) {
        for id in ids {
            guard let i = index(of: id) else { continue }
            for a in Outline.ancestorIndices(items, i) where collapsed.contains(items[a].id) {
                collapsed.remove(items[a].id)
            }
        }
    }

    // MARK: Editing state

    func beginEditing(_ id: String) {
        editingID = id
        select(id)
    }

    func endEditing(_ id: String) {
        if editingID == id { editingID = nil }
    }

    // MARK: Selection mode

    /// Moves the cursor in selection mode (↑/↓), or extends the block selection (⇧↑/⇧↓).
    func moveSelection(by offset: Int, extending: Bool) {
        let order = visibleTaskIDs
        guard !order.isEmpty else { return }
        let current = activeItemID.flatMap { order.firstIndex(of: $0) }
        let next = current.map { min(max($0 + offset, 0), order.count - 1) } ?? (offset > 0 ? 0 : order.count - 1)
        if extending, let current {
            let anchor = selectionAnchor ?? order[current]
            activeItemID = order[next]
            selectRange(from: anchor, to: order[next], in: order)
        } else {
            select(order[next])
        }
    }

    func selectRange(from anchor: String, to id: String, in order: [String]? = nil) {
        let order = order ?? visibleTaskIDs
        guard let a = order.firstIndex(of: anchor), let b = order.firstIndex(of: id) else { return }
        selection = Set(order[min(a, b)...max(a, b)])
        selectionAnchor = anchor
        activeItemID = id
    }

    func toggleInSelection(_ id: String) {
        if selection.isEmpty, let active = activeItemID { selection = [active] }
        if selection.contains(id) { selection.remove(id) } else { selection.insert(id) }
        selectionAnchor = id
        activeItemID = id
    }

    func selectAllVisible() {
        let order = visibleTaskIDs
        guard let first = order.first, let last = order.last else { return }
        selectRange(from: first, to: last, in: order)
    }

    // MARK: Block commands

    func newTask() {
        guard let active = activeItem, let i = index(of: active.id) else {
            focus(addItem())
            return
        }
        let end = Outline.subtreeEnd(items, i)
        let group = listGroupBy == .dueDate && viewMode == .list ? DueDate.category(for: active) : nil
        let id = addItem(after: items[end - 1].id) { item in
            item.indent = active.indent
            if let group { item.assign(to: .due(group)) }
        }
        focus(id)
    }

    func indentSelection(by delta: Int) {
        let roots = targetRoots
        guard !roots.isEmpty else { return }
        undoable(delta > 0 ? "Indent" : "Outdent") { commit(OutlineEdit.indent(items, roots: roots, by: delta)) }
        reveal(roots)
    }

    /// ⌥⌘↑/↓. In due-date grouping this moves tasks to the previous/next date group instead.
    func moveSelection(up: Bool) {
        let roots = targetRoots
        guard !roots.isEmpty else { return }
        if listGroupBy == .dueDate && viewMode == .list {
            let order = DueCategory.allCases
            undoable("Move Task") {
                for id in roots {
                    guard let item = item(id), let i = order.firstIndex(of: DueDate.category(for: item)) else { continue }
                    let target = i + (up ? -1 : 1)
                    if order.indices.contains(target) { update(id) { $0.assign(to: .due(order[target])) } }
                }
            }
            return
        }
        guard let moved = OutlineEdit.move(items, roots: roots, up: up, isListed: isListed) else { return }
        undoable("Move Task") { commit(moved) }
        reveal(roots)
    }

    func deleteSelection() {
        let roots = targetRoots
        guard !roots.isEmpty else { return }
        // Keep the cursor nearby: the next visible task after the deleted ones, else the previous one.
        let order = visibleTaskIDs
        let removed = Set(OutlineEdit.delete(items, roots: roots).map(\.id)).symmetricDifference(items.map(\.id))
        let firstIndex = order.firstIndex { removed.contains($0) } ?? 0
        let survivor = order[firstIndex...].first { !removed.contains($0) } ?? order[..<firstIndex].last
        undoable(removed.count == 1 ? "Delete Task" : "Delete Tasks") {
            commit(OutlineEdit.delete(items, roots: roots))
            if items.isEmpty { addItem() }
        }
        select(survivor ?? items.first?.id)
    }

    func duplicateSelection() {
        let roots = targetRoots
        guard !roots.isEmpty else { return }
        let result = OutlineEdit.duplicate(items, roots: roots)
        undoable("Duplicate") { commit(result.items) }
        if result.copies.count == 1, let copy = result.copies.first { select(copy) }
    }

    /// ⌘K: completes the targets, or reopens them if they are all done already.
    func toggleDoneSelection() {
        let ids = targetIDs
        guard !ids.isEmpty else { return }
        let allDone = ids.allSatisfy { item($0)?.completed == true }
        undoable(allDone ? "Reopen" : "Complete") { for id in ids { update(id) { $0.setStatus(allDone ? .due : .done) } } }
    }

    func toggleInProgressSelection() {
        let ids = targetIDs
        guard !ids.isEmpty else { return }
        let all = ids.allSatisfy { item($0)?.effectiveStatus == .inProgress }
        undoable("Change Status") { for id in ids { update(id) { $0.setStatus(all ? .due : .inProgress) } } }
    }

    func toggleNowSelection() {
        let ids = targetIDs
        guard !ids.isEmpty else { return }
        let all = ids.allSatisfy { item($0)?.isNow == true }
        undoable(all ? "Remove from Now" : "Add to Now") { for id in ids { update(id) { $0.isNow = !all } } }
    }

    /// ⌘↑: collapse the targets (or, on a task without subtasks, its parent). ⌘↓: expand.
    func setCollapsed(_ collapse: Bool) {
        let parents = targetIDs.filter(isParent)
        if !collapse {
            collapsed.subtract(parents)
            return
        }
        if !parents.isEmpty {
            collapsed.formUnion(parents)
        } else if let active = activeItemID, let parent = parent(of: active) {
            collapsed.insert(parent.id)
            select(parent.id)
        }
    }

    func toggleCollapsed(_ id: String) {
        if collapsed.contains(id) { collapsed.remove(id) } else { collapsed.insert(id) }
    }

    func toggleGroupCollapsed(_ category: DueCategory) {
        if collapsedGroups.contains(category) { collapsedGroups.remove(category) } else { collapsedGroups.insert(category) }
    }

    // MARK: Text-level editing (from a focused task field)

    /// Return in a task. `group` is the due-date group it is shown in (new tasks join that group).
    func splitTask(_ id: String, caret: Int, group: DueCategory?) {
        guard let result = OutlineEdit.split(items, id: id, caret: caret, collapsed: collapsed.contains(id),
                                             configure: { if let group { $0.assign(to: .due(group)) } }) else { return }
        undoable("New Task") { commit(result.items) }
        focus(result.focus.id, caret: result.focus.caret)
    }

    /// Backspace at the start of a task: joins it onto the previous task.
    func mergeTask(_ id: String, into previousID: String) {
        guard let result = OutlineEdit.merge(items, id: id, into: previousID) else { return }
        undoable("Join Tasks") { commit(result.items) }
        focus(result.focus.id, caret: result.focus.caret)
    }

    /// Multi-line paste: the lines become tasks below `id`.
    func pasteLines(_ lines: [PastedLine], after id: String, group: DueCategory?) {
        guard let result = OutlineEdit.paste(items, lines: lines, after: id,
                                             configure: { if let group { $0.assign(to: .due(group)) } }) else { return }
        undoable("Paste Tasks") { commit(result.items) }
        reveal([result.last])
        focus(result.last)
    }
}
