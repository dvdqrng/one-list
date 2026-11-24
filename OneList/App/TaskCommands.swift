import SwiftUI

/// The Task menu: every editor command with a shortcut. Commands act on the block selection, or on the
/// current task — also while its text is being edited.
struct TaskCommands: Commands {
    let store: AppStore

    var body: some Commands {
        CommandMenu("Task") {
            Button("New Task") { animate { store.newTask() } }
                .keyboardShortcut("n")

            Divider()

            Button("Complete / Reopen") { animate { store.toggleDoneSelection() } }
                .keyboardShortcut("k")
            Button("Mark as In Progress") { animate { store.toggleInProgressSelection() } }
                .keyboardShortcut("k", modifiers: [.command, .option])
            Button("Add to / Remove from Now") { animate { store.toggleNowSelection() } }
                .keyboardShortcut("n", modifiers: [.command, .option])

            Divider()

            Button("Indent") { listOnly { store.indentSelection(by: 1) } }
                .keyboardShortcut("]")
            Button("Outdent") { listOnly { store.indentSelection(by: -1) } }
                .keyboardShortcut("[")
            Button("Move Up") { listOnly { store.moveSelection(up: true) } }
                .keyboardShortcut(.upArrow, modifiers: [.command, .option])
            Button("Move Down") { listOnly { store.moveSelection(up: false) } }
                .keyboardShortcut(.downArrow, modifiers: [.command, .option])
            Button("Collapse") { listOnly { store.setCollapsed(true) } }
                .keyboardShortcut(.leftArrow, modifiers: [.command, .option])
            Button("Expand") { listOnly { store.setCollapsed(false) } }
                .keyboardShortcut(.rightArrow, modifiers: [.command, .option])

            Divider()

            Button("Duplicate") { animate { store.duplicateSelection() } }
                .keyboardShortcut("d")
            Button("Delete") { animate { store.deleteSelection() } }
                .keyboardShortcut(.delete, modifiers: [.command, .shift])

            Divider()

            Button("Show Details") { if store.activeItem != nil { store.isSidebarOpen = true } }
                .keyboardShortcut("i")
        }
    }

    // Items stay enabled: SwiftUI doesn't re-evaluate menu state when the store changes. Commands do
    // nothing when there is no task to act on, and the structure ones only apply to the list view.
    private func animate(_ change: () -> Void) {
        guard store.changelog == nil else { return }
        withAnimation(.snappy(duration: 0.18), change)
    }

    private func listOnly(_ change: () -> Void) {
        guard store.viewMode == .list else { return }
        animate(change)
    }
}
