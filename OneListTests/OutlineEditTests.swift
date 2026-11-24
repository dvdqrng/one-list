import Foundation
import Testing
@testable import One_List

/// Outline fixtures are written as indented text: two spaces per level, "x " marks a completed task.
@MainActor
private func outline(_ text: String) -> [Item] {
    text.split(separator: "\n").enumerated().map { index, line in
        var item = Item()
        let trimmed = line.drop { $0 == " " }
        item.indent = (line.count - trimmed.count) / 2
        if trimmed.hasPrefix("x ") {
            item.title = String(trimmed.dropFirst(2))
            item.setStatus(.done)
        } else {
            item.title = String(trimmed)
        }
        item.id = item.title
        item.position = index
        return item
    }
}

/// The inverse of `outline(_:)` (without completion marks).
@MainActor
private func render(_ items: [Item]) -> String {
    items.map { String(repeating: "  ", count: $0.indent) + $0.title }.joined(separator: "\n")
}

@MainActor
struct OutlineEditTests {
    private let all: (Item) -> Bool = { _ in true }

    // MARK: Indent

    @Test func indentMovesTheWholeSubtree() {
        let items = outline("A\nB\n  b1\n    b2\nC")
        #expect(render(OutlineEdit.indent(items, roots: ["B"], by: 1)) == "A\n  B\n    b1\n      b2\nC")
    }

    @Test func cannotIndentMoreThanOneLevelBelowTheTaskAbove() {
        let items = outline("A\n  a1\nB")
        #expect(render(OutlineEdit.indent(items, roots: ["a1"], by: 1)) == "A\n  a1\nB") // already child of A
        #expect(render(OutlineEdit.indent(items, roots: ["A"], by: 1)) == "A\n  a1\nB")  // first task
    }

    @Test func outdentStopsAtTopLevel() {
        let items = outline("A\n  a1\n    a2")
        #expect(render(OutlineEdit.indent(items, roots: ["a1"], by: -1)) == "A\na1\n  a2")
        #expect(render(OutlineEdit.indent(items, roots: ["A"], by: -1)) == "A\n  a1\n    a2")
    }

    // MARK: Move

    @Test func moveSwapsWithSiblingBlocks() {
        let items = outline("A\n  a1\nB\n  b1\nC")
        #expect(render(OutlineEdit.move(items, roots: ["B"], up: true, isListed: all)!) == "B\n  b1\nA\n  a1\nC")
        #expect(render(OutlineEdit.move(items, roots: ["A"], up: false, isListed: all)!) == "B\n  b1\nA\n  a1\nC")
    }

    @Test func moveStopsAtTheEdges() {
        let items = outline("A\nB")
        #expect(OutlineEdit.move(items, roots: ["A"], up: true, isListed: all) == nil)
        #expect(OutlineEdit.move(items, roots: ["B"], up: false, isListed: all) == nil)
    }

    @Test func movingDownPastTheLastChildEntersTheNextParent() {
        let items = outline("A\n  a1\nB\n  b1")
        #expect(render(OutlineEdit.move(items, roots: ["a1"], up: false, isListed: all)!) == "A\nB\n  a1\n  b1")
    }

    @Test func movingUpPastTheFirstChildLeavesTheParent() {
        let items = outline("A\nB\n  b1")
        #expect(render(OutlineEdit.move(items, roots: ["b1"], up: true, isListed: all)!) == "A\n  b1\nB")
    }

    @Test func moveSkipsHiddenTasks() {
        let items = outline("A\nx done\nB")
        let visible: (Item) -> Bool = { !$0.completed }
        #expect(render(OutlineEdit.move(items, roots: ["B"], up: true, isListed: visible)!) == "B\nA\ndone")
    }

    @Test func movingSeveralBlocksKeepsTheirOrder() {
        let items = outline("A\nB\nC\nD")
        #expect(render(OutlineEdit.move(items, roots: ["B", "C"], up: true, isListed: all)!) == "B\nC\nA\nD")
        #expect(render(OutlineEdit.move(items, roots: ["B", "C"], up: false, isListed: all)!) == "A\nD\nB\nC")
    }

    // MARK: Delete / duplicate

    @Test func deleteRemovesSubtrees() {
        let items = outline("A\n  a1\nB")
        #expect(render(OutlineEdit.delete(items, roots: ["A"])) == "B")
    }

    @Test func duplicateCopiesTheSubtreeBelow() {
        let items = outline("A\n  a1\nB")
        let result = OutlineEdit.duplicate(items, roots: ["A"])
        #expect(render(result.items) == "A\n  a1\nA\n  a1\nB")
        #expect(Set(result.items.map(\.id)).count == 5)
        #expect(result.copies.count == 1 && result.copies[0] != "A")
    }

    // MARK: Split / merge

    @Test func returnSplitsAtTheCaret() {
        let items = outline("Hello world")
        let result = OutlineEdit.split(items, id: "Hello world", caret: 5, collapsed: false) { _ in }!
        #expect(render(result.items) == "Hello\n world")
        #expect(result.focus.caret == .start && result.focus.id != "Hello world")
    }

    @Test func returnAtTheStartInsertsAbove() {
        let items = outline("Task")
        let result = OutlineEdit.split(items, id: "Task", caret: 0, collapsed: false) { _ in }!
        #expect(render(result.items) == "\nTask")
        #expect(result.focus == FocusRequest(id: "Task", caret: .start))
    }

    @Test func returnOnAnExpandedParentCreatesItsFirstChild() {
        let items = outline("A\n  a1")
        let expanded = OutlineEdit.split(items, id: "A", caret: 1, collapsed: false) { _ in }!
        #expect(render(expanded.items) == "A\n  \n  a1")
        let collapsed = OutlineEdit.split(items, id: "A", caret: 1, collapsed: true) { _ in }!
        #expect(render(collapsed.items) == "A\n  a1\n")
    }

    @Test func splitCountsUTF16LikeTheTextField() {
        let items = outline("Café 👍 done")
        let result = OutlineEdit.split(items, id: "Café 👍 done", caret: ("Café 👍" as NSString).length, collapsed: false) { _ in }!
        #expect(render(result.items) == "Café 👍\n done")
    }

    @Test func mergeJoinsTextAndPlacesTheCaretAtTheSeam() {
        let items = outline("Buy \n  sub\nmilk")
        let result = OutlineEdit.merge(items, id: "milk", into: "Buy ")!
        #expect(render(result.items) == "Buy milk\n  sub")
        #expect(result.focus == FocusRequest(id: "Buy ", caret: .offset(4)))
    }

    // MARK: Paste

    @Test func pasteParsesBulletsCheckboxesAndIndentation() {
        let lines = PastedLine.parse("""
            - Groceries
              - [x] Milk
              - [ ] Eggs
            1. Call mom

            * Plan trip
            \tBook flights
            """)
        #expect(lines.map(\.text) == ["Groceries", "Milk", "Eggs", "Call mom", "Plan trip", "Book flights"])
        #expect(lines.map(\.level) == [0, 1, 1, 0, 0, 2])
        #expect(lines.map(\.done) == [false, true, false, false, false, false])
    }

    @Test func pastedTasksNestUnderTheCurrentTaskAndNeverSkipLevels() {
        let items = outline("A\n  a1\nB")
        let lines = [PastedLine(text: "x", level: 0), PastedLine(text: "y", level: 3)]
        let result = OutlineEdit.paste(items, lines: lines, after: "A") { _ in }!
        #expect(render(result.items) == "A\n  a1\nx\n  y\nB")
        #expect(result.items.first { $0.id == result.last }?.title == "y")
    }

    // MARK: Outline helpers

    @Test func blockRootsDropSelectedDescendants() {
        let items = outline("A\n  a1\nB")
        #expect(Outline.blockRoots(items, ["a1", "A", "B"]) == ["A", "B"])
    }

    @Test func entriesHideCollapsedSubtrees() {
        let items = outline("A\n  a1\n    a2\nB")
        let entries = Outline.entries(items, groupBy: .project, showCompleted: true, collapsed: ["A"], collapsedGroups: [])
        #expect(entries.map(\.id) == ["A", "B"])
    }
}

@MainActor
struct DropTests {
    @Test func dragDownLandsBelowTargetWithSubtree() {
        let items = outline("A\n  a1\nB\n  b1\nC")
        #expect(render(OutlineEdit.drop(items, id: "A", onto: "B")!) == "B\n  b1\nA\n  a1\nC")
    }

    @Test func dragUpLandsAboveTargetAtItsLevel() {
        let items = outline("A\n  a1\nB\n  b1\n    b2")
        #expect(render(OutlineEdit.drop(items, id: "b1", onto: "a1")!) == "A\n  b1\n    b2\n  a1\nB")
        #expect(render(OutlineEdit.drop(items, id: "b1", onto: "A")!) == "b1\n  b2\nA\n  a1\nB")
    }

    @Test func cannotDropIntoItself() {
        let items = outline("A\n  a1\nB")
        #expect(OutlineEdit.drop(items, id: "A", onto: "a1") == nil)
        #expect(OutlineEdit.drop(items, id: "A", onto: "A") == nil)
    }
}
