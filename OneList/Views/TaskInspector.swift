import SwiftUI

/// The inspector (right side) for the selected task.
struct TaskInspector: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        if let item = store.activeItem {
            TaskInspectorForm(item: item).id(item.id)
        } else {
            ContentUnavailableView("No Task Selected", systemImage: "checklist",
                                   description: Text("Select a task to see its details."))
        }
    }
}

private struct TaskInspectorForm: View {
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
        let subtasks = store.children(of: item.id)
        Form {
            Section {
                TextField("", text: text(\.title), prompt: Text("Title"), axis: .vertical)
                    .font(.system(size: 17, weight: .semibold))
                    .strikethrough(item.completed)
                TextField("", text: notes, prompt: Text("Notes"), axis: .vertical)
                    .lineLimit(3...12)
            }
            .textFieldStyle(.plain)
            .labelsHidden()

            Section {
                Picker("Status", selection: status) {
                    ForEach(TodoStatus.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                Picker("Priority", selection: priority) {
                    Text("None").tag(Priority?.none)
                    Divider()
                    ForEach(Priority.allCases, id: \.self) { p in
                        Label(p.title, systemImage: "flag.fill").tag(Priority?.some(p))
                    }
                }
                Toggle("Due Date", isOn: hasDueDate)
                if item.dueDate != nil {
                    DatePicker("Date", selection: dueDate, displayedComponents: .date)
                        .datePickerStyle(.compact)
                }
                Toggle("In “Now”", isOn: isNow)
            }

            Section {
                LabeledContent("Category") {
                    HStack(spacing: 6) {
                        Picker("Category", selection: category) {
                            Text("None").tag(String?.none)
                            if !store.categories.isEmpty { Divider() }
                            ForEach(store.categories, id: \.self) { Text($0).tag(String?.some($0)) }
                            Divider()
                            Text("New Category…").tag(String?.some(Self.newCategoryTag))
                        }
                        .labelsHidden()
                        if let current = item.category {
                            Button { prompt(.rename(current)) } label: { Image(systemName: "pencil") }
                                .buttonStyle(.borderless)
                                .help("Rename “\(current)” everywhere")
                        }
                    }
                }
                LabeledContent("Project", value: store.parent(of: item.id)?.title ?? "None")
            }

            Section("Subtasks") {
                if !subtasks.isEmpty {
                    let done = subtasks.filter(\.completed).count
                    ProgressView(value: Double(done), total: Double(subtasks.count)) {
                        Text("\(done) of \(subtasks.count) completed").font(.caption).foregroundStyle(.secondary)
                    }
                    ForEach(subtasks) { subtask in
                        TaskRow(item: subtask, editing: .readonly, onSelect: { store.select(subtask.id) })
                            .padding(.horizontal, -8)
                    }
                }
                Button("Add Subtask", systemImage: "plus", action: addSubtask)
                    .buttonStyle(.borderless)
            }

            Section {
                Button("Suggest Details", systemImage: "sparkles") { store.reenrich(item.id) }
                    .buttonStyle(.borderless)
                    .disabled(!store.settings.hasApiKey || item.title.isEmpty || item.isAIBusy)
                    .help(store.settings.hasApiKey ? "Suggest priority, due date and category from the title and notes"
                                                   : "Add a Jev API key in Settings")
            } footer: {
                Text("Created \(item.createdAt.formatted(date: .abbreviated, time: .shortened))")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .formStyle(.grouped)
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
        store.focus(id)
    }
}
