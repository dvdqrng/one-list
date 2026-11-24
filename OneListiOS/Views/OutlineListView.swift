import SwiftUI

/// The list view: the outline of projects and tasks, or the tasks grouped by due date. Editing works
/// like the Mac's keyboard-first outliner — Return adds the next task, Backspace at the start joins or
/// outdents, the keyboard bar indents — with swipe actions, context menus and drag to reorder on top.
struct OutlineListView: View {
    @Environment(AppStore.self) private var store
    var searchText = ""

    var body: some View {
        let _ = store.currentDay // re-evaluated when the day changes
        let entries = store.outline
        ScrollViewReader { proxy in
        List {
            if !searchText.isEmpty {
                searchResults
            } else if store.listGroupBy == .dueDate {
                dueDateSections(entries)
            } else {
                projectRows(entries)
            }
        }
        .listStyle(.plain)
        .environment(\.defaultMinListRowHeight, Metrics.rowHeight)
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await store.sync.syncNow() }
        // New tasks are added at the end or below the current one: bring them into view, above the keyboard.
        .onChange(of: store.focusRequest?.id) { _, id in
            guard let id else { return }
            withAnimation(.snappy(duration: 0.25)) { proxy.scrollTo(id) }
        }
        .overlay {
            if searchText.isEmpty && store.listGroupBy == .project && !entries.contains(where: { $0.item != nil }) {
                ContentUnavailableView {
                    Label("All Done", systemImage: "checkmark.circle")
                } description: {
                    Text("Completed tasks from earlier days are hidden.")
                } actions: {
                    Button("New Task", systemImage: "plus") { store.focus(store.addItem()) }
                        .buttonStyle(.bordered)
                }
            }
        }
        }
    }

    // MARK: Project mode

    @ViewBuilder private func projectRows(_ entries: [OutlineEntry]) -> some View {
        let rows = entries.filter { $0.item != nil }
        ForEach(rows) { entry in
            if case .item(let item, _, let isParent, _) = entry {
                row(item, isParent: isParent, group: nil, entries: entries)
            }
        }
        .onMove { source, destination in move(source, to: destination, in: rows.map(\.id)) }
    }

    // MARK: Due-date mode

    private struct DateSection: Identifiable {
        let category: DueCategory
        var entries: [OutlineEntry] = []
        var id: String { category.rawValue }
    }

    private func sections(_ entries: [OutlineEntry]) -> [DateSection] {
        var result: [DateSection] = []
        for entry in entries {
            if case .header(let category, _) = entry {
                result.append(DateSection(category: category))
            } else if !result.isEmpty {
                result[result.count - 1].entries.append(entry)
            }
        }
        return result
    }

    @ViewBuilder private func dueDateSections(_ entries: [OutlineEntry]) -> some View {
        ForEach(sections(entries)) { section in
            Section {
                let rows = section.entries.filter { $0.item != nil }
                ForEach(rows) { entry in
                    if case .item(let item, let group, _, _) = entry {
                        row(item, isParent: false, group: group, entries: entries)
                    }
                }
                .onMove { source, destination in move(source, to: destination, in: rows.map(\.id)) }
                if section.entries.contains(where: { if case .placeholder = $0 { true } else { false } }) {
                    addToGroupRow(section.category)
                }
            } header: {
                groupHeader(section.category, count: section.entries.filter { $0.item != nil }.count)
            }
        }
    }

    private func groupHeader(_ category: DueCategory, count: Int) -> some View {
        let collapsed = store.collapsedGroups.contains(category)
        return Button {
            Haptics.select()
            withAnimation(.snappy(duration: 0.2)) { store.toggleGroupCollapsed(category) }
        } label: {
            HStack(spacing: Metrics.disclosureGap) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.tertiary)
                    .rotationEffect(.degrees(collapsed ? 0 : 90))
                    .frame(width: Metrics.disclosure)
                Text(category.label)
                    .font(.system(size: Metrics.headingFont, weight: .semibold))
                if count > 0 {
                    Text("\(count)")
                        .font(.system(size: Metrics.taskFont))
                        .monospacedDigit()
                        .foregroundStyle(.tertiary)
                        .padding(.leading, 4)
                }
                Spacer()
            }
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .textCase(nil)
        .accessibilityLabel("\(category.label), \(count) tasks")
        .accessibilityHint(collapsed ? "Expands the group" : "Collapses the group")
    }

    /// The "Add a task" row of an empty Now / Today / Tomorrow group.
    private func addToGroupRow(_ category: DueCategory) -> some View {
        Button {
            Haptics.tap()
            withAnimation(.snappy(duration: 0.2)) {
                store.focus(store.addItem { $0.assign(to: .due(category)) })
            }
        } label: {
            HStack(spacing: Metrics.checkboxGap) {
                Image(systemName: "plus")
                    .font(.system(size: 14, weight: .semibold))
                    .frame(width: Metrics.checkbox)
                Text("Add a task").font(.system(size: Metrics.taskFont))
            }
            .foregroundStyle(.tertiary)
            .padding(.leading, Metrics.disclosure + Metrics.disclosureGap)
            .frame(minHeight: Metrics.rowHeight)
        }
        .buttonStyle(.plain)
        .listRowSeparator(.hidden)
        .moveDisabled(true)
    }

    // MARK: Search

    @ViewBuilder private var searchResults: some View {
        let query = searchText.trimmingCharacters(in: .whitespaces)
        let matches = store.todos.filter {
            $0.title.localizedCaseInsensitiveContains(query) || ($0.details ?? "").localizedCaseInsensitiveContains(query)
                || ($0.category ?? "").localizedCaseInsensitiveContains(query)
        }
        if matches.isEmpty {
            ContentUnavailableView.search(text: query)
                .listRowSeparator(.hidden)
        } else {
            ForEach(matches) { item in
                TaskRowView(item: item, showsDisclosureColumn: false, showMetadata: true, editable: true)
                    .listRowSeparator(.hidden)
                    .modifier(TaskActions(item: item))
            }
        }
    }

    // MARK: Rows

    private func row(_ item: Item, isParent: Bool, group: DueCategory?, entries: [OutlineEntry]) -> some View {
        let isProjectHeader = isParent && item.indent == 0
        return TaskRowView(
            item: item,
            level: group == nil ? item.indent : 0, // date groups are flat
            disclosure: isParent
                ? (store.collapsed.contains(item.id), { withAnimation(.snappy(duration: 0.2)) { store.toggleCollapsed(item.id) } })
                : nil,
            showsDisclosureColumn: true,
            isHeading: isProjectHeader,
            weight: isParent ? .medium : .regular,
            showMetadata: store.showMetadata && !isProjectHeader,
            excludeMetadata: group != nil ? ["dueDate"] : [],
            editable: true,
            group: group,
            onKey: { key, caret, text in handleKey(key, caret: caret, text: text, item: item, group: group, entries: entries) },
            onPasteLines: { text in
                let lines = PastedLine.parse(text)
                guard let first = lines.first else { return nil }
                if lines.count > 1 { store.pasteLines(Array(lines.dropFirst()), after: item.id, group: group) }
                return first.text
            }
        )
        .listRowInsets(EdgeInsets(top: 0, leading: Metrics.rowPadding - Metrics.disclosureGap, bottom: 0, trailing: Metrics.rowPadding))
        .listRowSeparator(.hidden)
        .listRowBackground(rowBackground(item.id))
        .modifier(TaskActions(item: item))
        .padding(.top, isProjectHeader ? 8 : 0)
    }

    @ViewBuilder private func rowBackground(_ id: String) -> some View {
        if store.isSidebarOpen && store.activeItemID == id {
            RoundedRectangle(cornerRadius: Metrics.rowCornerRadius, style: .continuous)
                .fill(Color.accentColor.opacity(0.12))
                .padding(.horizontal, 8)
        } else {
            Color.clear
        }
    }

    // MARK: Reordering

    /// List drag-to-reorder: the task moves with its subtasks to the target row's place and level.
    private func move(_ source: IndexSet, to destination: Int, in ids: [String]) {
        guard let from = source.first, ids.indices.contains(from) else { return }
        let target = destination > from ? destination - 1 : destination
        guard target != from, ids.indices.contains(target) else { return }
        Haptics.tap()
        withAnimation(.snappy(duration: 0.2)) { store.move(ids[from], onto: ids[target]) }
    }

    // MARK: Keyboard (same behavior as the Mac outliner)

    private func neighbor(of id: String, offset: Int, in entries: [OutlineEntry]) -> String? {
        let ids = entries.compactMap(\.item?.id)
        guard let i = ids.firstIndex(of: id), ids.indices.contains(i + offset) else { return nil }
        return ids[i + offset]
    }

    private func handleKey(_ key: OutlineKey, caret: Int, text: String, item: Item, group: DueCategory?,
                           entries: [OutlineEntry]) -> Bool {
        switch key {
        case .tab:
            Haptics.tap()
            withAnimation(.snappy(duration: 0.16)) { store.indentSelection(by: 1) }
        case .backtab:
            Haptics.tap()
            withAnimation(.snappy(duration: 0.16)) { store.indentSelection(by: -1) }
        case .up, .down:
            let from = store.focusRequest?.id ?? item.id
            if let target = neighbor(of: from, offset: key == .up ? -1 : 1, in: entries) {
                store.focus(target, caret: .offset(caret))
            }
        case .enter:
            if text.isEmpty && item.indent > 0 {
                withAnimation(.snappy(duration: 0.16)) { store.indentSelection(by: -1) } // step out a level
            } else {
                store.splitTask(item.id, caret: caret, group: group)
            }
        case .backspaceAtStart:
            if text.isEmpty {
                if item.indent > 0 {
                    withAnimation(.snappy(duration: 0.16)) { store.indentSelection(by: -1) }
                } else {
                    let previous = neighbor(of: item.id, offset: -1, in: entries)
                    if let previous { store.focus(previous) }
                    withAnimation(.snappy(duration: 0.2)) { store.delete([item.id]) }
                }
            } else if let previous = neighbor(of: item.id, offset: -1, in: entries) {
                store.mergeTask(item.id, into: previous)
            } else if item.indent > 0 {
                withAnimation(.snappy(duration: 0.16)) { store.indentSelection(by: -1) }
            } else {
                return false
            }
        case .escape:
            store.focusRequest = nil
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        }
        return true
    }
}

/// Swipe actions and the context menu of a task, shared by the list, search results and the board.
struct TaskActions: ViewModifier {
    @Environment(AppStore.self) private var store
    let item: Item
    var swipes = true

    func body(content: Content) -> some View {
        if swipes {
            content
                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                    Button {
                        if item.completed { Haptics.tap() } else { Haptics.success() }
                        withAnimation(.snappy(duration: 0.2)) { store.setStatus(item.id, item.completed ? .due : .done) }
                    } label: {
                        Label(item.completed ? "Reopen" : "Done", systemImage: item.completed ? "arrow.uturn.backward" : "checkmark")
                    }
                    .tint(.accentColor)
                    Button {
                        Haptics.tap()
                        store.edit(item.id, item.isNow ? "Remove from Now" : "Add to Now") { $0.isNow.toggle() }
                    } label: {
                        Label(item.isNow ? "Not Now" : "Now", systemImage: item.isNow ? "sun.min" : "sun.max.fill")
                    }
                    .tint(.orange)
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    Button(role: .destructive) {
                        Haptics.thud()
                        withAnimation(.snappy(duration: 0.2)) { store.delete(subtreeIDs) }
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                    Button { showDetails() } label: { Label("Details", systemImage: "info.circle") }
                        .tint(.gray)
                }
                .contextMenu { menu }
        } else {
            content.contextMenu { menu }
        }
    }

    /// The task and its subtasks (deleting a project deletes what is in it, as on the Mac).
    private var subtreeIDs: [String] {
        guard let i = store.index(of: item.id) else { return [item.id] }
        return store.items[i..<Outline.subtreeEnd(store.items, i)].map(\.id)
    }

    private func showDetails() {
        Haptics.tap()
        store.select(item.id)
        store.isSidebarOpen = true
    }

    @ViewBuilder private var menu: some View {
        Section {
            Button("Details", systemImage: "info.circle", action: showDetails)
            Button(item.isNow ? "Remove from Now" : "Add to Now", systemImage: item.isNow ? "sun.min" : "sun.max") {
                store.edit(item.id, item.isNow ? "Remove from Now" : "Add to Now") { $0.isNow.toggle() }
            }
        }
        Section {
            Picker("Status", selection: Binding(get: { item.effectiveStatus }, set: { store.setStatus(item.id, $0) })) {
                Label("To Do", systemImage: "circle").tag(TodoStatus.due)
                Label("In Progress", systemImage: "circle.lefthalf.filled").tag(TodoStatus.inProgress)
                Label("Done", systemImage: "checkmark.circle").tag(TodoStatus.done)
            }
            .pickerStyle(.menu)
            Menu("Due Date", systemImage: "calendar") {
                ForEach([DueCategory.today, .tomorrow, .thisWeek, .later], id: \.self) { category in
                    Button(category.label) { store.move(item.id, into: .due(category)) }
                }
                Divider()
                Button("No Due Date") { store.edit(item.id, "Change Due Date") { $0.dueDate = nil } }
            }
            Menu("Priority", systemImage: "flag") {
                ForEach([Priority.high, .medium, .low], id: \.self) { p in
                    Button(p.title) { store.edit(item.id, "Change Priority") { $0.priority = p } }
                }
                Divider()
                Button("None") { store.edit(item.id, "Change Priority") { $0.priority = nil } }
            }
        }
        Section {
            Button("Indent", systemImage: "increase.indent") { store.select(item.id); store.indentSelection(by: 1) }
            Button("Outdent", systemImage: "decrease.indent") { store.select(item.id); store.indentSelection(by: -1) }
            Button("Duplicate", systemImage: "plus.square.on.square") { store.select(item.id); store.duplicateSelection() }
        }
        Button("Delete", systemImage: "trash", role: .destructive) {
            withAnimation(.snappy(duration: 0.2)) { store.delete(subtreeIDs) }
        }
    }
}
