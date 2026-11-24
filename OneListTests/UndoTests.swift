import Foundation
import Testing
@testable import One_List

/// Runs against the scheme's scratch data directory (ONE_LIST_DATA_DIR), never real data.
@MainActor
struct UndoTests {
    private func makeStore() -> (AppStore, UndoManager) {
        let store = AppStore()
        let undo = UndoManager()
        undo.groupsByEvent = false
        store.undoManager = undo
        return (store, undo)
    }

    private func step(_ undo: UndoManager, _ body: () -> Void) {
        undo.beginUndoGrouping()
        body()
        undo.endUndoGrouping()
    }

    @Test func deleteCanBeUndoneAndRedone() {
        let (store, undo) = makeStore()
        var id = ""
        step(undo) { id = store.addItem { $0.title = "Undo me" } }
        step(undo) { store.delete([id]) }
        #expect(store.item(id) == nil)
        #expect(undo.undoActionName == "Delete Task")

        undo.undo()
        #expect(store.item(id)?.title == "Undo me")
        undo.redo()
        #expect(store.item(id) == nil)
        undo.undo()
        step(undo) { store.delete([id]) } // leave the scratch store tidy
    }

    @Test func applyingAIChangesIsOneUndoStep() {
        let (store, undo) = makeStore()
        var a = Item(); a.title = "First"
        var b = Item(); b.title = "Second"
        let before = store.items.count
        step(undo) { store.apply([ProposedChange(kind: .add(a)), ProposedChange(kind: .add(b))]) }
        #expect(store.items.count == before + 2)

        undo.undo()
        #expect(store.items.count == before)
        #expect(store.item(a.id) == nil && store.item(b.id) == nil)
    }

    @Test func pickerEditsAreUndoableButTypingIsNot() {
        let (store, undo) = makeStore()
        var id = ""
        step(undo) { id = store.addItem() }
        step(undo) { store.setTitle(id, "typed") }   // text fields keep their own undo
        step(undo) { store.edit(id, "Change Priority") { $0.priority = .high } }

        undo.undo()
        #expect(store.item(id)?.priority == nil)
        #expect(store.item(id)?.title == "typed")
        step(undo) { store.delete([id]) }
    }
}
