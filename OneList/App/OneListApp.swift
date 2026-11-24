import AppKit
import SwiftUI

@main
struct OneListApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var store: AppStore
    @State private var timer: FocusTimer

    init() {
        _store = State(initialValue: AppStore())
        _timer = State(initialValue: FocusTimer())
    }

    var body: some Scene {
        Window("One List", id: "main") {
            RootView()
                .environment(store)
                .environment(timer)
                .frame(minWidth: 560, minHeight: 400)
                .onAppear {
                    #if DEBUG
                    DebugSnapshot.run(store: store, timer: timer)
                    #endif
                }
        }
        .defaultSize(width: 1100, height: 760)
        .windowToolbarStyle(.unified)
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandGroup(after: .appInfo) {
                Button("Check for Updates…") { store.showUpdateDialog = true }
            }
            TaskCommands(store: store)
            CommandGroup(before: .toolbar) {
                Button("List") { store.viewMode = .list }.keyboardShortcut("1")
                Button("Board") { store.viewMode = .kanban }.keyboardShortcut("2")
                Divider()
                Button(store.showCompleted ? "Hide Earlier Completed Tasks" : "Show All Completed Tasks") { store.showCompleted.toggle() }
                Button(store.showMetadata ? "Hide Task Details" : "Show Task Details") { store.showMetadata.toggle() }
                Button(store.showAIInput ? "Hide AI Composer" : "Show AI Composer") { store.showAIInput.toggle() }
                    .keyboardShortcut("j")
                Button(store.isSidebarOpen ? "Hide Inspector" : "Show Inspector") { store.isSidebarOpen.toggle() }
                    .keyboardShortcut("i", modifiers: [.command, .option])
                Divider()
                // Always enabled (SwiftUI doesn't refresh menu state from the timer); they act only when it makes sense.
                Button("Start Focus Session") { if !timer.isActive { timer.start() } }
                Button("Repeat Focus Session") { if timer.isComplete { timer.start(duration: timer.duration) } }
                    .keyboardShortcut("r")
                Divider()
            }
        }

        Settings {
            SettingsView()
                .environment(store)
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    /// Brings the main window back (used by the menu bar timer).
    static func showMainWindow() {
        if let window = NSApp.windows.first(where: { $0.identifier?.rawValue == "main" || $0.title == "One List" }) {
            window.makeKeyAndOrderFront(nil)
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Lets iCloud push changes from the user's other devices (handled by CKSyncEngine).
        NSApp.registerForRemoteNotifications()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool { true }
}
