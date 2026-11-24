import Foundation

/// What a group/column represents; used both to fill it and to apply drops or new items into it.
enum GroupKey: Hashable, Sendable {
    case due(DueCategory)
    case priority(Priority?)
    case status(TodoStatus)
    case category(String?)
    case project(String?)

    var id: String {
        switch self {
        case .due(let c): "due-\(c.rawValue)"
        case .priority(let p): "priority-\(p?.rawValue ?? "none")"
        case .status(let s): "status-\(s.rawValue)"
        case .category(let c): "category-\(c ?? "")"
        case .project(let p): "project-\(p ?? "")"
        }
    }
}

struct ItemGroup: Identifiable {
    var key: GroupKey
    var title: String
    var items: [Item]
    var id: String { key.id }
}

enum Grouping {
    /// Listed items in position order (see `Item.isVisible`).
    static func visible(_ items: [Item], showCompleted: Bool) -> [Item] {
        items.filter { $0.isVisible(showCompleted: showCompleted) }
    }

    /// Indent-0 items that are followed by deeper-indented items.
    static func projectRootIDs(_ items: [Item]) -> Set<String> {
        var roots = Set<String>()
        var currentRoot: String?
        for item in items {
            if item.indent == 0 { currentRoot = item.id } else if let currentRoot { roots.insert(currentRoot) }
        }
        return roots
    }

    /// Due-date groups for the list view: non-empty groups plus Now/Today/Tomorrow.
    static func dueDateGroups(_ items: [Item], showCompleted: Bool) -> [ItemGroup] {
        let todos = visible(items, showCompleted: showCompleted)
        return DueCategory.allCases.compactMap { category in
            let members = todos.filter { DueDate.category(for: $0) == category }
            guard !members.isEmpty || category.alwaysShown else { return nil }
            return ItemGroup(key: .due(category), title: category.label, items: members)
        }
    }

    static func kanbanColumns(_ items: [Item], groupBy: KanbanGroupBy, showCompleted: Bool) -> [ItemGroup] {
        if groupBy == .project { return projectGroups(items, showCompleted: showCompleted) }

        let roots = projectRootIDs(items.filter { !$0.isArchived })
        let todos = visible(items, showCompleted: showCompleted).filter { !roots.contains($0.id) }

        switch groupBy {
        case .dueDate:
            return DueCategory.allCases.map { c in
                ItemGroup(key: .due(c), title: c.label, items: todos.filter { DueDate.category(for: $0) == c })
            }
        case .priority:
            let columns: [(Priority?, String)] = [(.high, "High"), (.medium, "Medium"), (.low, "Low"), (nil, "No Priority")]
            return columns.map { p, title in ItemGroup(key: .priority(p), title: title, items: todos.filter { $0.priority == p }) }
        case .status:
            let columns: [(TodoStatus, String)] = [(.due, "To Do"), (.inProgress, "In Progress"), (.done, "Done")]
            return columns.map { s, title in ItemGroup(key: .status(s), title: title, items: todos.filter { $0.effectiveStatus == s }) }
        case .category:
            let names = Set(todos.compactMap(\.category)).sorted()
            var groups = names.map { name in ItemGroup(key: .category(name), title: name, items: todos.filter { $0.category == name }) }
            let uncategorized = todos.filter { $0.category == nil }
            if !uncategorized.isEmpty { groups.append(ItemGroup(key: .category(nil), title: "Uncategorized", items: uncategorized)) }
            return groups
        case .project:
            return []
        }
    }

    /// One group per root item that has (visible) children; everything else goes to "No Project".
    static func projectGroups(_ items: [Item], showCompleted: Bool) -> [ItemGroup] {
        var groups: [ItemGroup] = []
        var ungrouped: [Item] = []
        var root: Item?
        var children: [Item] = []
        let include = { (item: Item) in item.isVisible(showCompleted: showCompleted) }

        func flush() {
            guard let r = root else { return }
            if children.isEmpty {
                ungrouped.append(r)
            } else {
                groups.append(ItemGroup(key: .project(r.id), title: r.title.isEmpty ? "Untitled Project" : r.title, items: children))
            }
            root = nil
            children = []
        }

        for item in items where !item.isArchived {
            if item.indent == 0 {
                flush()
                root = include(item) ? item : nil
            } else if root != nil {
                if include(item) { children.append(item) }
            } else if include(item) {
                ungrouped.append(item)
            }
        }
        flush()
        if !ungrouped.isEmpty { groups.append(ItemGroup(key: .project(nil), title: "No Project", items: ungrouped)) }
        return groups
    }
}
