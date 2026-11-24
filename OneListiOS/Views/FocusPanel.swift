import SwiftUI

/// The focus screen's task side: a segmented Tasks / Notes header, then the "Now" tasks as a native
/// list (drag to reorder, tap to edit, swipe to remove) or the distraction notes.
struct FocusPanel: View {
    enum Tab: Hashable { case tasks, notes }

    @Environment(AppStore.self) private var store
    @Environment(FocusTimer.self) private var timer
    @Binding var tab: Tab
    /// A field has the keyboard (the iPhone layout folds the orb away meanwhile).
    @Binding var isEditing: Bool
    @State private var newTaskTitle = ""
    @FocusState private var focus: Field?

    private enum Field: Hashable { case task(String), newTask, notes }

    var body: some View {
        VStack(spacing: 0) {
            header
            switch tab {
            case .tasks: tasks
            case .notes: notes
            }
        }
        .onChange(of: focus) { _, field in isEditing = field != nil }
    }

    // MARK: Header

    private var header: some View {
        @Bindable var store = store
        return HStack(spacing: 12) {
            Picker("Show", selection: Binding(get: { tab }, set: select)) {
                Text(taskTabTitle).tag(Tab.tasks)
                Text(timer.notes.isEmpty ? "Notes" : "Notes •").tag(Tab.notes)
            }
            .pickerStyle(.segmented)

            Menu {
                Toggle("Show Earlier Completed Tasks", isOn: $store.focusShowCompleted)
                Toggle("Show Priority, Dates & Categories", isOn: $store.focusShowMetadata)
            } label: {
                Image(systemName: "line.3.horizontal.decrease.circle")
                    .font(.system(size: 20))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .foregroundStyle(.secondary)
            .accessibilityLabel("View Options")
        }
        .padding(.leading, 20)
        .padding(.trailing, 8)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }

    private var taskTabTitle: String {
        let open = store.focusTasks.filter { !$0.completed }.count
        return open > 0 ? "Tasks \(open)" : "Tasks"
    }

    private func select(_ value: Tab) {
        Haptics.select()
        tab = value
    }

    // MARK: Tasks

    private var tasks: some View {
        let tasks = store.focusTasks
        return List {
            ForEach(tasks) { item in
                row(item)
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            Haptics.warning()
                            store.delete([item.id])
                        } label: { Label("Delete", systemImage: "trash") }
                    }
                    .swipeActions(edge: .leading) {
                        Button {
                            Haptics.tap()
                            store.edit(item.id, "Remove from Now") { $0.isNow = false }
                        } label: { Label("Remove from Now", systemImage: "sun.max") }
                        .tint(.orange)
                    }
            }
            .onMove { source, destination in move(tasks, source, destination) }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 0, trailing: 20))

            addTaskRow
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 0, trailing: 20))
                .moveDisabled(true)

            if tasks.isEmpty {
                Text(store.nowTodos.isEmpty
                     ? "Add what you want to get done in this session."
                     : "Everything here is done. Earlier completed tasks are hidden.")
                    .font(.callout)
                    .foregroundStyle(.tertiary)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 4, leading: 20 + Metrics.checkbox + Metrics.checkboxGap,
                                              bottom: 4, trailing: 20))
                    .moveDisabled(true)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .animation(.snappy(duration: 0.2), value: tasks.map(\.id))
    }

    private func row(_ item: Item) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Metrics.checkboxGap) {
            StatusCheckbox(state: .init(item)) {
                let next = StatusCheckbox.State(item).next
                if next == .done { Haptics.success() } else { Haptics.select() }
                withAnimation(.snappy(duration: 0.2)) { store.setStatus(item.id, next) }
            }
            .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + Metrics.taskFont * 0.32 }

            VStack(alignment: .leading, spacing: 4) {
                TextField("New Task", text: Binding(get: { item.title }, set: { store.setTitle(item.id, $0) }),
                          axis: .vertical)
                    .font(.system(size: Metrics.taskFont))
                    .foregroundStyle(item.completed ? .secondary : .primary)
                    .strikethrough(item.completed && focus != .task(item.id))
                    .focused($focus, equals: .task(item.id))
                    .submitLabel(.next)
                    // Vertical text fields insert a newline on Return; treat it as "next" instead.
                    .onChange(of: item.title) { _, title in
                        guard title.contains("\n") else { return }
                        store.setTitle(item.id, title.replacingOccurrences(of: "\n", with: ""))
                        submit(item)
                    }
                if store.focusShowMetadata { MetadataLabels(item: item) }
            }
        }
        .padding(.vertical, 10)
        .frame(minHeight: Metrics.rowHeight)
    }

    /// Return moves on to the next task, or to "Add a task" after the last one. Empty tasks are removed.
    private func submit(_ item: Item) {
        let tasks = store.focusTasks
        let next = tasks.firstIndex { $0.id == item.id }.flatMap { $0 + 1 < tasks.count ? tasks[$0 + 1] : nil }
        if item.title.trimmingCharacters(in: .whitespaces).isEmpty { store.delete([item.id]) }
        focus = next.map { .task($0.id) } ?? .newTask
    }

    /// Adds tasks straight to "Now"; stays focused so several can be added in a row.
    private var addTaskRow: some View {
        HStack(spacing: Metrics.checkboxGap) {
            Image(systemName: "plus")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.tertiary)
                .frame(width: Metrics.checkbox, height: Metrics.checkbox)
            TextField("Add a task", text: $newTaskTitle)
                .font(.system(size: Metrics.taskFont))
                .focused($focus, equals: .newTask)
                .submitLabel(.next)
                .onSubmit(addTask)
        }
        .frame(minHeight: Metrics.rowHeight)
        .contentShape(Rectangle())
        .onTapGesture { focus = .newTask }
        .listRowSeparator(.hidden, edges: .bottom)
    }

    private func addTask() {
        let title = newTaskTitle.trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty else { focus = nil; return }
        Haptics.tap()
        _ = store.addItem { item in
            item.title = title
            item.isNow = true
        }
        newTaskTitle = ""
        focus = .newTask
    }

    /// List reordering → outline move: down lands after the row above the gap, up before the row below it.
    private func move(_ tasks: [Item], _ source: IndexSet, _ destination: Int) {
        guard let from = source.first else { return }
        let target = destination > from ? tasks[destination - 1] : destination < tasks.count ? tasks[destination] : nil
        guard let target, target.id != tasks[from].id else { return }
        Haptics.select()
        store.move(tasks[from].id, onto: target.id)
    }

    // MARK: Notes

    private var notes: some View {
        @Bindable var timer = timer
        return TextEditor(text: $timer.notes)
            .font(.body)
            .focused($focus, equals: .notes)
            .scrollContentBackground(.hidden)
            .padding(.horizontal, 15)
            .padding(.top, 8)
            .overlay(alignment: .topLeading) {
                if timer.notes.isEmpty {
                    Text("Jot down anything that pops into your head — it becomes tasks afterwards.")
                        .foregroundStyle(.tertiary)
                        .padding(.horizontal, 20).padding(.vertical, 16)
                        .allowsHitTesting(false)
                }
            }
    }
}
