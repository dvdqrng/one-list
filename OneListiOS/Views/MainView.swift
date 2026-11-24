import SwiftUI

/// The iOS window: list or board, with the same vocabulary as the Mac toolbar (view options, AI composer,
/// focus, more) placed where iOS puts it. Top: focus (leading), view options and more (trailing).
/// Bottom: search, AI composer, New Task — on iOS 26 search lives in the bottom bar, as in the system apps.
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
                .toolbar { topBar }
                .toolbar { keyboardBar }
                .modifier(SearchAndBottomBar(searchText: $searchText, bottomBar: bottomBar, hidden: store.showAIInput))
                // The composer takes the bottom bar's place while open (like Messages), above the keyboard.
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    if store.showAIInput {
                        AIInputBar().transition(.move(edge: .bottom).combined(with: .opacity))
                    } else if timer.isActive && timer.isMinimized {
                        FocusPill().transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
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
        .animation(.snappy(duration: 0.25), value: store.showAIInput)
        .animation(.snappy(duration: 0.3), value: timer.isMinimized)
        .sheet(item: $store.changelog) { ChangesSheet(session: $0) }
        .sheet(isPresented: $showSettings) { SettingsScreen() }
        // Minimizing keeps the session running (pill, Live Activity); only End ends it.
        .fullScreenCover(isPresented: Binding(get: { timer.isActive && !timer.isMinimized },
                                              set: { if !$0 && timer.isActive { timer.isMinimized = true } })) {
            FocusView()
        }
        .onChange(of: appearance, initial: true) { applyAppearance() }
        .onChange(of: timer.isActive) { applyAppearance() }
        .onChange(of: undoManager, initial: true) { store.undoManager = undoManager }
        .onChange(of: store.focusTasks) { if timer.isActive { AppDelegate.focusActivity?.update() } }
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
        if !searchText.isEmpty {
            // Search covers all tasks, from the list or the board.
            OutlineListView(searchText: searchText)
        } else {
            switch store.viewMode {
            case .list:
                OutlineListView()
            case .kanban:
                BoardView()
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
    }

    private var subtitle: String {
        let open = store.todos.filter { !$0.completed && !$0.title.isEmpty }.count
        return open == 1 ? "1 open task" : "\(open) open tasks"
    }

    /// Appearance is set on the window: `preferredColorScheme(nil)` doesn't switch back to the system
    /// setting on iOS. Focus mode is always dark, as on the Mac.
    private func applyAppearance() {
        let preference = timer.isActive ? .dark : AppearancePreference(rawValue: appearance) ?? .system
        let style: UIUserInterfaceStyle = switch preference {
        case .system: .unspecified
        case .light: .light
        case .dark: .dark
        }
        for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
            for window in scene.windows { window.overrideUserInterfaceStyle = style }
        }
    }

    // MARK: Toolbars

    @ToolbarContentBuilder private var topBar: some ToolbarContent {
        @Bindable var store = store
        ToolbarItem(placement: .topBarLeading) {
            Button {
                Haptics.thud()
                if timer.isActive { timer.isMinimized = false } else { timer.start() }
            } label: {
                Label(timer.isActive ? "Show Focus Session" : "Start Focus Session", systemImage: "timer")
            }
        }

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
    }

    /// AI composer and New Task; search joins them on iOS 26 (see `SearchAndBottomBar`).
    private var bottomBar: some View {
        HStack {
            Button { Haptics.tap(); store.showAIInput = true } label: {
                Label("AI Composer", systemImage: "sparkles")
            }
            Button {
                searchText = ""
                Haptics.tap()
                withAnimation(.snappy(duration: 0.2)) { store.focus(store.addItem()) }
            } label: {
                Label("New Task", systemImage: "plus")
            }
        }
        .labelStyle(.iconOnly)
    }

    @ToolbarContentBuilder private var keyboardBar: some ToolbarContent {
        ToolbarItemGroup(placement: .keyboard) {
            if let id = store.editingID, let item = store.item(id) {
                Button { Haptics.tap(); withAnimation(.snappy(duration: 0.16)) { store.indentSelection(by: -1) } } label: {
                    Label("Outdent", systemImage: "decrease.indent")
                }
                .disabled(item.indent == 0)
                Button { Haptics.tap(); withAnimation(.snappy(duration: 0.16)) { store.indentSelection(by: 1) } } label: {
                    Label("Indent", systemImage: "increase.indent")
                }
                Button { Haptics.tap(); store.edit(id, item.isNow ? "Remove from Now" : "Add to Now") { $0.isNow.toggle() } } label: {
                    Label(item.isNow ? "Remove from Now" : "Add to Now", systemImage: item.isNow ? "sun.max.fill" : "sun.max")
                }
                Menu {
                    ForEach([DueCategory.today, .tomorrow, .thisWeek, .later], id: \.self) { category in
                        Button(category.label) { Haptics.select(); store.move(id, into: .due(category)) }
                    }
                    Divider()
                    Button("No Due Date") { Haptics.select(); store.edit(id, "Change Due Date") { $0.dueDate = nil } }
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

/// iOS 26+: search is a (minimized) field in the bottom bar next to the actions, as in Mail or Notes, so it
/// never fights the large title or pull to refresh. Earlier iOS: the classic search field under the title.
private struct SearchAndBottomBar<Bar: View>: ViewModifier {
    @Binding var searchText: String
    let bottomBar: Bar
    /// While the AI composer is open it replaces the bottom bar.
    let hidden: Bool

    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content
                .searchable(text: $searchText, prompt: "Search Tasks")
                .searchToolbarBehavior(.minimize)
                .toolbar {
                    if !hidden {
                        DefaultToolbarItem(kind: .search, placement: .bottomBar)
                        ToolbarSpacer(.flexible, placement: .bottomBar)
                        ToolbarItem(placement: .bottomBar) { bottomBar }
                    }
                }
        } else {
            content
                .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Search Tasks")
                .toolbar {
                    if !hidden {
                        ToolbarItemGroup(placement: .bottomBar) {
                            Spacer()
                            bottomBar
                        }
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
