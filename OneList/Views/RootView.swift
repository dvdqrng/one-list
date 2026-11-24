import SwiftUI

struct RootView: View {
    @Environment(AppStore.self) private var store
    @Environment(FocusTimer.self) private var timer
    @Environment(\.undoManager) private var undoManager
    @Environment(\.openSettings) private var openSettings
    @AppStorage("theme", store: Database.preferences) private var appearance = AppearancePreference.system.rawValue

    var body: some View {
        @Bindable var store = store
        ZStack {
            Group {
                switch store.viewMode {
                case .list: TaskListView()
                case .kanban: KanbanView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .modifier(SnapshotFriendlyScrolling())
            .overlay(alignment: .bottom) {
                if store.showAIInput {
                    AIInputBar().transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }

            if timer.isActive {
                FocusOverlay().transition(.opacity)
            }
        }
        .animation(.snappy(duration: 0.25), value: store.showAIInput)
        .animation(.easeInOut(duration: 0.3), value: timer.isActive)
        .navigationTitle("One List")
        .navigationSubtitle(subtitle)
        .toolbar { toolbar }
        .modifier(HiddenWindowToolbar(hidden: timer.isActive)) // nothing in it applies to a focus session
        .inspector(isPresented: Binding(get: { store.isSidebarOpen && !timer.isActive },
                                        set: { store.isSidebarOpen = $0 })) {
            TaskInspector().inspectorColumnWidth(min: 260, ideal: 300, max: 420)
        }
        .sheet(item: $store.changelog) { ChangesSheet(session: $0) }
        .sheet(isPresented: $store.showUpdateDialog) { UpdateSheet() }
        .onChange(of: appearance, initial: true) { applyAppearance() }
        .onChange(of: timer.isActive) { applyAppearance() }
        .onChange(of: undoManager, initial: true) { store.undoManager = undoManager }
        #if DEBUG
        .onReceive(NotificationCenter.default.publisher(for: .debugOpenSettings)) { _ in openSettings() }
        #endif
        .onReceive(Timer.publish(every: 3600, on: .main, in: .common).autoconnect()) { _ in store.archiveOldDone() }
        .onReceive(NotificationCenter.default.publisher(for: .NSCalendarDayChanged).receive(on: RunLoop.main)) { _ in
            store.currentDay = Calendar.current.startOfDay(for: .now)
        }
    }

    private var subtitle: String {
        let open = store.todos.filter { !$0.completed && !$0.title.isEmpty }.count
        return open == 1 ? "1 open task" : "\(open) open tasks"
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        @Bindable var store = store
        ToolbarItem(placement: .principal) {
            Picker("View", selection: $store.viewMode) {
                Label("List", systemImage: "list.bullet").tag(ViewMode.list)
                Label("Board", systemImage: "rectangle.split.3x1").tag(ViewMode.kanban)
            }
            .pickerStyle(.segmented)
            .help("Switch between list and board (⌘1 / ⌘2)")
        }

        ToolbarItemGroup {
            Menu {
                if store.viewMode == .list {
                    Picker("Group By", selection: $store.listGroupBy) {
                        Text("Projects").tag(ListGroupBy.project)
                        Text("Due Date").tag(ListGroupBy.dueDate)
                    }
                    .pickerStyle(.inline)
                } else {
                    Picker("Group By", selection: $store.kanbanGroupBy) {
                        ForEach(KanbanGroupBy.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.inline)
                }
                Divider()
                Toggle("Show Earlier Completed Tasks", isOn: $store.showCompleted)
                Toggle("Show Priority, Dates & Categories", isOn: $store.showMetadata)
            } label: {
                Label("View Options", systemImage: "line.3.horizontal.decrease.circle")
            }
            .help("Grouping and what to show")

            Toggle(isOn: $store.showAIInput) {
                Label("AI Composer", systemImage: "sparkles")
            }
            .help("Add or update tasks in your own words (⌘J)")

            Menu {
                Button("Find Similar Tasks", systemImage: "square.on.square") {
                    Task { await store.findSimilarTasks() }
                }
                .disabled(store.isFindingSimilar || store.todos.count < 2 || !store.settings.hasApiKey)
                Button("Sync Now", systemImage: "arrow.triangle.2.circlepath.icloud") {
                    Task { await store.sync.syncNow() }
                }
                .disabled(!store.sync.status.isActive)
                Divider()
                SettingsLink { Label("Settings…", systemImage: "gearshape") }
                Button("Check for Updates…", systemImage: "arrow.triangle.2.circlepath") { store.showUpdateDialog = true }
                Button("GitHub Repository", systemImage: "link") { NSWorkspace.shared.open(UpdateChecker.repository) }
            } label: {
                Label("More", systemImage: store.isFindingSimilar ? "hourglass" : "ellipsis.circle")
            }
        }

        ToolbarItem {
            Button { store.isSidebarOpen.toggle() } label: {
                Label("Inspector", systemImage: "sidebar.right")
            }
            .help(store.isSidebarOpen ? "Hide inspector (⌥⌘I)" : "Show inspector (⌥⌘I)")
        }
    }

    /// Focus mode is always dark; otherwise the Appearance setting (or the system).
    private func applyAppearance() {
        let preference = timer.isActive ? .dark : AppearancePreference(rawValue: appearance) ?? .system
        NSApp.appearance = preference.nsAppearance
    }
}

/// Hides the window's toolbar (and title) while `hidden`, e.g. during a focus session.
private struct HiddenWindowToolbar: ViewModifier {
    let hidden: Bool

    func body(content: Content) -> some View {
        if #available(macOS 15, *) {
            content.toolbar(hidden ? .hidden : .visible, for: .windowToolbar)
        } else {
            content.onChange(of: hidden, initial: true) {
                for window in NSApp.windows where window.toolbar != nil { window.toolbar?.isVisible = !hidden }
            }
        }
    }
}
