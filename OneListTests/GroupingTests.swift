import Foundation
import Testing
@testable import One_List

@MainActor
struct GroupingTests {
    /// Builds items in position order from (title, indent) pairs.
    private func outline(_ rows: [(String, Int)]) -> [Item] {
        rows.enumerated().map { index, row in
            var item = Item()
            item.id = row.0
            item.title = row.0
            item.indent = row.1
            item.position = index
            return item
        }
    }

    @Test func projectRootsAreTopLevelItemsWithChildren() {
        let items = outline([("A", 0), ("a1", 1), ("a2", 2), ("B", 0), ("C", 0), ("c1", 1)])
        #expect(Grouping.projectRootIDs(items) == ["A", "C"])
    }

    @Test func projectGroups() {
        let items = outline([("orphan", 1), ("A", 0), ("a1", 1), ("B", 0), ("C", 0), ("c1", 1)])
        let groups = Grouping.projectGroups(items, showCompleted: true)
        #expect(groups.map(\.title) == ["A", "C", "No Project"])
        #expect(groups[0].items.map(\.id) == ["a1"])
        #expect(groups[2].items.map(\.id) == ["orphan", "B"])
    }

    @Test func hiddenCompletedRootSendsChildrenToNoProject() {
        var items = outline([("A", 0), ("a1", 1)])
        items[0].setStatus(.done)
        items[0].completedAt = Calendar.current.date(byAdding: .day, value: -2, to: .now) // completed before today, so it is hidden
        let groups = Grouping.projectGroups(items, showCompleted: false)
        #expect(groups.map(\.title) == ["No Project"])
        #expect(groups[0].items.map(\.id) == ["a1"])
    }

    @Test func dueDateGroupsAlwaysShowNowTodayTomorrow() {
        let groups = Grouping.dueDateGroups([], showCompleted: true)
        #expect(groups.map(\.title) == ["Now", "Today", "Tomorrow"])
    }

    @Test func dueDateGroupsHideCompletedAndArchived() {
        var items = outline([("done", 0), ("archived", 0), ("open", 0)])
        items[0].setStatus(.done)
        items[0].completedAt = Calendar.current.date(byAdding: .day, value: -2, to: .now) // completed before today, so it is hidden
        items[1].setStatus(.archived)
        let visible = Grouping.dueDateGroups(items, showCompleted: false).flatMap(\.items).map(\.id)
        #expect(visible == ["open"])
        let withCompleted = Grouping.dueDateGroups(items, showCompleted: true).flatMap(\.items).map(\.id)
        #expect(withCompleted == ["done", "open"])
    }

    @Test func kanbanColumnsExcludeProjectRoots() {
        let items = outline([("A", 0), ("a1", 1), ("B", 0)])
        let columns = Grouping.kanbanColumns(items, groupBy: .priority, showCompleted: true)
        #expect(columns.map(\.title) == ["High", "Medium", "Low", "No Priority"])
        #expect(columns[3].items.map(\.id) == ["a1", "B"])
    }

    @Test func categoryColumnsAreSortedWithUncategorizedLast() {
        var items = outline([("x", 0), ("y", 0), ("z", 0)])
        items[0].category = "work"
        items[1].category = "home"
        let columns = Grouping.kanbanColumns(items, groupBy: .category, showCompleted: true)
        #expect(columns.map(\.title) == ["home", "work", "Uncategorized"])
    }

    @Test func statusColumnsUseEffectiveStatus() {
        var items = outline([("a", 0), ("b", 0), ("c", 0)])
        items[1].setStatus(.inProgress)
        items[2].completed = true // legacy row without a status
        let columns = Grouping.kanbanColumns(items, groupBy: .status, showCompleted: true)
        #expect(columns.map { $0.items.map(\.id) } == [["a"], ["b"], ["c"]])
    }
}

@MainActor
struct ItemTests {
    @Test func setStatusKeepsCompletionConsistent() {
        var item = Item()
        item.setStatus(.done)
        #expect(item.completed && item.completedAt != nil)
        let completedAt = item.completedAt
        item.setStatus(.archived)
        #expect(item.completedAt == completedAt) // archiving keeps the original completion time
        item.setStatus(.inProgress)
        #expect(!item.completed && item.completedAt == nil)
    }

    @Test func assignToGroup() {
        var item = Item()
        item.assign(to: .due(.now))
        #expect(item.isNow)
        item.assign(to: .due(.tomorrow))
        #expect(!item.isNow && DueDate.category(for: item) == .tomorrow)
        item.assign(to: .priority(.high))
        #expect(item.priority == .high)
        item.assign(to: .category(nil))
        #expect(item.category == nil)
        item.assign(to: .status(.done))
        #expect(item.completed)
    }

    @Test func updatesApplyOnlyGivenFields() {
        var item = Item()
        item.title = "Buy eggs"
        item.priority = .low
        var updates = ItemUpdates()
        updates.priority = .high
        updates.completed = true
        updates.apply(to: &item)
        #expect(item.title == "Buy eggs" && item.priority == .high && item.completed)
        #expect(updates.fieldChanges(from: Item()).map(\.0) == ["priority"])
    }
}

@MainActor
struct CompletedVisibilityTests {
    private func done(daysAgo: Int?) -> Item {
        var item = Item()
        item.title = "x"
        item.completed = true
        item.status = .done
        item.completedAt = daysAgo.map { Calendar.current.date(byAdding: .day, value: -$0, to: .now)! }
        return item
    }

    @Test func hidingCompletedKeepsTodaysCompletions() {
        #expect(done(daysAgo: 0).isVisible(showCompleted: false))
        #expect(!done(daysAgo: 1).isVisible(showCompleted: false))
        #expect(!done(daysAgo: nil).isVisible(showCompleted: false)) // legacy rows without a completion time
        #expect(done(daysAgo: 1).isVisible(showCompleted: true))
        #expect(Item().isVisible(showCompleted: false))
    }

    @Test func todaysCompletionsJustAfterMidnightCount() {
        let calendar = Calendar.current
        let now = calendar.date(bySettingHour: 0, minute: 5, second: 0, of: .now)!
        var item = done(daysAgo: 0)
        item.completedAt = calendar.date(byAdding: .minute, value: -10, to: now) // 23:55 yesterday
        #expect(!item.isVisible(showCompleted: false, now: now))
        item.completedAt = calendar.date(byAdding: .minute, value: -2, to: now) // 00:03 today
        #expect(item.isVisible(showCompleted: false, now: now))
    }

    @Test func listAndBoardUseTheSameRule() {
        var old = done(daysAgo: 2); old.id = "old"
        var today = done(daysAgo: 0); today.id = "today"
        var open = Item(); open.id = "open"
        let items = [old, today, open]
        let listed = Outline.entries(items, groupBy: .project, showCompleted: false, collapsed: [], collapsedGroups: [])
        #expect(listed.map(\.id) == ["today", "open"])
        let board = Grouping.kanbanColumns(items, groupBy: .status, showCompleted: false).flatMap(\.items).map(\.id)
        #expect(Set(board) == ["today", "open"])
    }
}

@MainActor
struct HiddenSubtaskTests {
    @Test func aProjectWhoseSubtasksAreAllHiddenIsAPlainTask() {
        var root = Item(); root.id = "root"
        var child = Item(); child.id = "child"; child.indent = 1
        child.setStatus(.done)
        child.completedAt = Calendar.current.date(byAdding: .day, value: -3, to: .now)
        let hidden = Outline.entries([root, child], groupBy: .project, showCompleted: false, collapsed: [], collapsedGroups: [])
        #expect(hidden.count == 1)
        if case .item(_, _, let isParent, _) = hidden[0] { #expect(!isParent) }
        let shown = Outline.entries([root, child], groupBy: .project, showCompleted: true, collapsed: [], collapsedGroups: [])
        if case .item(_, _, let isParent, _) = shown[0] { #expect(isParent) }
    }
}
