import SwiftUI

/// Details of the selected task — the Mac inspector's fields in the same order. Shown as a sheet on
/// iPhone and as a side column on iPad.
struct TaskDetailView: View {
    @Environment(AppStore.self) private var store
    /// Sheets (iPhone) get a Done button; the iPad side column is closed from the toolbar.
    var showsDone = true

    var body: some View {
        NavigationStack {
            Group {
                if let item = store.activeItem {
                    TaskDetailForm(item: item).id(item.id)
                } else {
                    ContentUnavailableView("No Task Selected", systemImage: "checklist",
                                           description: Text("Choose Details on a task to see it here."))
                }
            }
            .navigationTitle("Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if showsDone {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { store.isSidebarOpen = false }
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

private struct TaskDetailForm: View {
    @Environment(AppStore.self) private var store
    let item: Item

    @State private var categoryPrompt: CategoryPrompt?
    @State private var categoryName = ""

    private enum CategoryPrompt: Identifiable {
        case new, rename(String)
        var id: String { if case .rename(let n) = self { "rename-\(n)" } else { "new" } }
    }

    private static let newCategoryTag = "\u{1}new"

    var body: some View {
        let current = store.item(item.id) ?? item
        let subtasks = store.children(of: item.id)
        Form {
            Section {
                TextField("Title", text: text(\.title), axis: .vertical)
                    .font(.system(size: Metrics.headingFont, weight: .semibold))
                    .strikethrough(current.completed)
                TextField("Notes", text: notes, axis: .vertical)
                    .lineLimit(3...12)
            }

            Section {
                Picker("Status", selection: status) {
                    Text("To Do").tag(TodoStatus.due)
                    Text("In Progress").tag(TodoStatus.inProgress)
                    Text("Done").tag(TodoStatus.done)
                    if current.effectiveStatus == .archived { Text("Archived").tag(TodoStatus.archived) }
                }
                Picker("Priority", selection: priority) {
                    Text("None").tag(Priority?.none)
                    ForEach([Priority.high, .medium, .low], id: \.self) { p in
                        Text(p.title).tag(Priority?.some(p))
                    }
                }
                Toggle("Due Date", isOn: hasDueDate)
                if current.dueDate != nil {
                    DatePicker("Date", selection: dueDate, displayedComponents: .date)
                }
                Toggle("In “Now”", isOn: isNow)
            }

            Section {
                Picker("Category", selection: category) {
                    Text("None").tag(String?.none)
                    ForEach(store.categories, id: \.self) { Text($0).tag(String?.some($0)) }
                    Text("New Category…").tag(String?.some(Self.newCategoryTag))
                }
                if let name = current.category {
                    Button("Rename “\(name)” Everywhere…") { prompt(.rename(name)) }
                }
                LabeledContent("Project", value: store.parent(of: item.id)?.title ?? "None")
            }

            Section {
                if !subtasks.isEmpty {
                    let done = subtasks.filter(\.completed).count
                    ProgressView(value: Double(done), total: Double(subtasks.count)) {
                        Text("\(done) of \(subtasks.count) completed")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(subtasks) { subtask in
                        TaskRowView(item: subtask, onTap: { store.select(subtask.id) })
                    }
                }
                Button("Add Subtask", systemImage: "plus", action: addSubtask)
            } header: {
                Text("Subtasks")
            }

            Section {
                Button("Suggest Details", systemImage: "sparkles") { store.reenrich(item.id) }
                    .disabled(!store.settings.hasApiKey || current.title.isEmpty || current.isAIBusy)
            } footer: {
                VStack(alignment: .leading, spacing: 4) {
                    if !store.settings.hasApiKey {
                        Text("Add a Jev API key in Settings to get suggestions for priority, due date and category.")
                    }
                    Text("Created \(item.createdAt.formatted(date: .abbreviated, time: .shortened))")
                        .foregroundStyle(.tertiary)
                }
            }

            Section {
                Button("Delete Task", role: .destructive) {
                    store.isSidebarOpen = false
                    store.select(item.id)
                    store.deleteSelection()
                }
            }
        }
        .alert(categoryPrompt.map { if case .rename = $0 { "Rename Category" } else { "New Category" } } ?? "",
               isPresented: Binding(get: { categoryPrompt != nil }, set: { if !$0 { categoryPrompt = nil } })) {
            TextField("Name", text: $categoryName)
            Button("Cancel", role: .cancel) {}
            Button(categoryPrompt.map { if case .rename = $0 { "Rename" } else { "Add" } } ?? "OK", action: commitCategory)
        } message: {
            if case .rename(let old) = categoryPrompt { Text("Renames “\(old)” on every task.") }
        }
    }

    // MARK: Bindings (pickers go through the undoable `edit`; typing through `update`)

    private func text(_ keyPath: WritableKeyPath<Item, String>) -> Binding<String> {
        Binding(get: { store.item(item.id)?[keyPath: keyPath] ?? "" },
                set: { value in store.update(item.id) { $0[keyPath: keyPath] = value } })
    }

    private var notes: Binding<String> {
        Binding(get: { store.item(item.id)?.details ?? "" },
                set: { value in store.update(item.id) { $0.details = value.isEmpty ? nil : value } })
    }

    private var status: Binding<TodoStatus> {
        Binding(get: { store.item(item.id)?.effectiveStatus ?? .due }, set: { store.setStatus(item.id, $0) })
    }

    private var priority: Binding<Priority?> {
        Binding(get: { store.item(item.id)?.priority },
                set: { value in store.edit(item.id, "Change Priority") { $0.priority = value } })
    }

    private var hasDueDate: Binding<Bool> {
        Binding(get: { store.item(item.id)?.dueDate != nil },
                set: { on in store.edit(item.id, "Change Due Date") { $0.dueDate = on ? DueDate.today : nil } })
    }

    private var dueDate: Binding<Date> {
        Binding(get: { store.item(item.id)?.dueDate.flatMap(DueDate.date(from:)) ?? .now },
                set: { date in store.edit(item.id, "Change Due Date") { $0.dueDate = DueDate.string(from: date) } })
    }

    private var isNow: Binding<Bool> {
        Binding(get: { store.item(item.id)?.isNow ?? false },
                set: { on in store.edit(item.id, on ? "Add to Now" : "Remove from Now") { $0.isNow = on } })
    }

    private var category: Binding<String?> {
        Binding(get: { store.item(item.id)?.category }, set: { value in
            if value == Self.newCategoryTag {
                prompt(.new)
            } else {
                store.edit(item.id, "Change Category") { $0.category = value }
            }
        })
    }

    private func prompt(_ kind: CategoryPrompt) {
        if case .rename(let old) = kind { categoryName = old } else { categoryName = "" }
        categoryPrompt = kind
    }

    private func commitCategory() {
        let name = categoryName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, let prompt = categoryPrompt else { return }
        switch prompt {
        case .new: store.edit(item.id, "Change Category") { $0.category = name }
        case .rename(let old): if name != old { store.renameCategory(old, to: name) }
        }
    }

    private func addSubtask() {
        guard let index = store.index(of: item.id) else { return }
        let last = store.items[(index + 1)...].prefix { $0.indent > item.indent }.last?.id ?? item.id
        let id = store.addItem(after: last) { $0.indent = item.indent + 1 }
        store.collapsed.remove(item.id)
        store.isSidebarOpen = false
        store.focus(id)
    }
}
