#if DEBUG
import SwiftUI

/// Development hook for visual checks in the simulator: `ONE_LIST_SCENE` opens a given state on launch,
/// e.g. `SIMCTL_CHILD_ONE_LIST_SCENE="board,meta"`. Combine with `ONE_LIST_DATA_DIR` (a scratch folder)
/// so real data is never touched. Keys: board, due, meta, detail=<title prefix>, focus, ai, settings,
/// dark, edit=<title prefix>.
enum DebugScene {
    static func run(store: AppStore, timer: FocusTimer, showSettings: Binding<Bool>) {
        guard let scene = ProcessInfo.processInfo.environment["ONE_LIST_SCENE"] else { return }
        let keys = scene.split(separator: ",").map(String.init)
        func value(_ key: String) -> String? {
            keys.first { $0.hasPrefix(key + "=") }.map { String($0.dropFirst(key.count + 1)) }
        }
        func find(_ prefix: String) -> Item? { store.items.first { $0.title.hasPrefix(prefix) } }

        store.viewMode = keys.contains("board") ? .kanban : .list
        store.listGroupBy = keys.contains("due") ? .dueDate : .project
        store.showMetadata = keys.contains("meta")
        store.showAIInput = keys.contains("ai")
        Database.preferences.set(keys.contains("dark") ? "dark" : "system", forKey: "theme")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            if let prefix = value("detail"), let item = find(prefix) {
                store.select(item.id)
                store.isSidebarOpen = true
            }
            if let prefix = value("edit"), let item = find(prefix) { store.focus(item.id) }
            if keys.contains("focus") { timer.start() }
            if keys.contains("settings") { showSettings.wrappedValue = true }
        }
    }
}
#endif
