import SwiftUI

/// The iOS window: list or board, with the same toolbar vocabulary as the Mac (view options, AI composer,
/// focus, more) moved to where iOS puts it — navigation bar, bottom bar and the keyboard bar.
struct MainView: View {
    @Environment(AppStore.self) private var store
    @Environment(FocusTimer.self) private var timer
    @Environment(\.undoManager) private var undoManager
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.horizontalSizeClass) private var sizeClass
    @AppStorage("theme", store: Database.preferences) private var appearance = AppearancePreference.system.rawValue
    @State private var searchText = ""
    @State private var showSettings = false

    var body: some View {
        @Bindable var store = store
        NavigationStack {
            content
                .navigationTitle("One List")
                .modifier(Subtitle(text: subtitle))
                .toolbar { toolbar }
                // iPad: a side column like the Mac inspector; iPhone: a sheet.
                .inspector(isPresented: Binding(get: { store.isSidebarOpen && sizeClass == .regular },
                                                set: { store.isSidebarOpen = $0 })) {
                    TaskDetailView(showsDone: false)
                        .inspectorColumnWidth(min: 300, ideal: 340, max: 420)
                }
                .sheet(isPresented: Binding(get: { store.isSidebarOpen && sizeClass != .regular },
                                            set: { store.isSidebarOpen = $0 })) {
                    TaskDetailView()
                }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if store.showAIInput {
                AIInputBar().transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy(duration: 0.25), value: store.showAIInput)
        .sheet(item: $store.changelog) { ChangesSheet(session: $0) }
        .sheet(isPresented: $showSettings) { SettingsScreen() }
        .fullScreenCover(isPresented: Binding(get: { timer.isActive }, set: { if !$0 { timer.end() } })) {
            FocusView()
        }
        .preferredColorScheme(AppearancePreference(rawValue: appearance)?.colorScheme)
        .onChange(of: undoManager, initial: true) { store.undoManager = undoManager }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            store.currentDay = Calendar.current.startOfDay(for: .now)
            store.archiveOldDone()
            timer.refresh()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in
            store.currentDay = Calendar.current.startOfDay(for: .now)
        }
        #if DEBUG
        .onAppear { DebugScene.run(store: store, timer: timer, showSettings: $showSettings) }
        #endif
    }

    @ViewBuilder private var content: some View {
        switch store.viewMode {
        case .list:
            OutlineListView(searchText: searchText)
                .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Search Tasks")
        case .kanban:
            BoardView()
                .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var subtitle: String {
        let open = store.todos.filter { !$0.completed && !$0.title.isEmpty }.count
        let tasks = open == 1 ? "1 open task" : "\(open) open tasks"
        return store.sync.status == .syncing ? tasks + " · Syncing…" : tasks
    }

    // MARK: Toolbar

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        @Bindable var store = store
        ToolbarItemGroup(placement: .topBarTrailing) {
            Menu {
                Picker("View", selection: $store.viewMode) {
                    Label("List", systemImage: "list.bullet").tag(ViewMode.list)
                    Label("Board", systemImage: "rectangle.split.3x1").tag(ViewMode.kanban)
                }
                .pickerStyle(.inline)
                if store.viewMode == .list {
                    Picker("Group By", selection: $store.listGroupBy) {
                        Text("Projects").tag(ListGroupBy.project)
                        Text("Due Date").tag(ListGroupBy.dueDate)
                    }
                    .pickerStyle(.menu)
                } else {
                    Picker("Group By", selection: $store.kanbanGroupBy) {
                        ForEach(KanbanGroupBy.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.menu)
                }
                Section {
                    Toggle("Show Earlier Completed Tasks", isOn: $store.showCompleted)
                    Toggle("Show Priority, Dates & Categories", isOn: $store.showMetadata)
                }
            } label: {
                Label("View Options", systemImage: "line.3.horizontal.decrease.circle")
            }

            if sizeClass == .regular {
                Button { store.isSidebarOpen.toggle() } label: {
                    Label("Details", systemImage: "sidebar.right")
                }
            }

            Menu {
                Section {
                    Button("Undo", systemImage: "arrow.uturn.backward") { undoManager?.undo() }
                        .disabled(!(undoManager?.canUndo ?? false))
                    Button("Redo", systemImage: "arrow.uturn.forward") { undoManager?.redo() }
                        .disabled(!(undoManager?.canRedo ?? false))
                }
                Button("Find Similar Tasks", systemImage: "square.on.square") {
                    Task { await store.findSimilarTasks() }
                }
                .disabled(store.isFindingSimilar || store.todos.count < 2 || !store.settings.hasApiKey)
                Button("Sync Now", systemImage: "arrow.triangle.2.circlepath.icloud") {
                    Task { await store.sync.syncNow() }
                }
                .disabled(!store.sync.status.isActive)
                Divider()
                Button("Settings", systemImage: "gearshape") { showSettings = true }
            } label: {
                Label("More", systemImage: store.isFindingSimilar ? "hourglass" : "ellipsis.circle")
            }
        }

        ToolbarItemGroup(placement: .bottomBar) {
            Button {
                withAnimation(.snappy(duration: 0.2)) { store.focus(store.addItem()) }
            } label: {
                Label("New Task", systemImage: "plus.circle.fill")
                    .labelStyle(.titleAndIcon)
                    .font(.system(size: Metrics.taskFont, weight: .semibold))
            }
            Spacer()
            Toggle(isOn: $store.showAIInput) {
                Label("AI Composer", systemImage: "sparkles")
            }
            .toggleStyle(.button)
            Button { timer.start() } label: {
                Label("Start Focus Session", systemImage: "timer")
            }
        }

        ToolbarItemGroup(placement: .keyboard) {
            if let id = store.editingID, let item = store.item(id) {
                Button { withAnimation(.snappy(duration: 0.16)) { store.indentSelection(by: -1) } } label: {
                    Label("Outdent", systemImage: "decrease.indent")
                }
                .disabled(item.indent == 0)
                Button { withAnimation(.snappy(duration: 0.16)) { store.indentSelection(by: 1) } } label: {
                    Label("Indent", systemImage: "increase.indent")
                }
                Button { store.edit(id, item.isNow ? "Remove from Now" : "Add to Now") { $0.isNow.toggle() } } label: {
                    Label(item.isNow ? "Remove from Now" : "Add to Now", systemImage: item.isNow ? "sun.max.fill" : "sun.max")
                }
                Menu {
                    ForEach([DueCategory.today, .tomorrow, .thisWeek, .later], id: \.self) { category in
                        Button(category.label) { store.move(id, into: .due(category)) }
                    }
                    Divider()
                    Button("No Due Date") { store.edit(id, "Change Due Date") { $0.dueDate = nil } }
                } label: {
                    Label("Due Date", systemImage: item.dueDate == nil ? "calendar" : "calendar.badge.checkmark")
                }
                Button { store.isSidebarOpen = true } label: { Label("Details", systemImage: "info.circle") }
                Spacer()
                Button {
                    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                } label: {
                    Label("Done Editing", systemImage: "keyboard.chevron.compact.down")
                }
            }
        }
    }
}

/// Task count under the title where iOS supports subtitles (iOS 26).
private struct Subtitle: ViewModifier {
    let text: String

    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content.navigationSubtitle(text)
        } else {
            content
        }
    }
}
