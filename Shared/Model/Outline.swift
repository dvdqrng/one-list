import Foundation

/// One line of the list view.
enum OutlineEntry: Identifiable, Equatable {
    case header(DueCategory, isFirst: Bool)
    /// "Type to add a task..." row of an empty Now/Today/Tomorrow group.
    case placeholder(DueCategory)
    case item(Item, group: DueCategory?, isParent: Bool, isFirstHeader: Bool)

    var id: String {
        switch self {
        case .header(let c, _): "header-\(c.rawValue)"
        case .placeholder(let c): Self.placeholderID(c)
        case .item(let item, _, _, _): item.id
        }
    }

    /// Rows that can hold the text cursor (everything except group headers).
    var isFocusable: Bool { if case .header = self { false } else { true } }

    var item: Item? { if case .item(let item, _, _, _) = self { item } else { nil } }

    static func placeholderID(_ category: DueCategory) -> String { "placeholder-\(category.rawValue)" }
}

/// Pure functions describing the outline structure (`items` are always in position order).
enum Outline {
    /// What the list shows, in order.
    static func entries(_ items: [Item], groupBy: ListGroupBy, showCompleted: Bool,
                        collapsed: Set<String>, collapsedGroups: Set<DueCategory>) -> [OutlineEntry] {
        if groupBy == .dueDate {
            var result: [OutlineEntry] = []
            for (index, group) in Grouping.dueDateGroups(items, showCompleted: showCompleted).enumerated() {
                guard case .due(let category) = group.key else { continue }
                result.append(.header(category, isFirst: index == 0))
                guard !collapsedGroups.contains(category) else { continue }
                if group.items.isEmpty {
                    if category.alwaysShown { result.append(.placeholder(category)) }
                } else {
                    result += group.items.map { .item($0, group: category, isParent: false, isFirstHeader: false) }
                }
            }
            return result
        }

        // Project mode: position order, collapsed subtrees hidden.
        var result: [OutlineEntry] = []
        var skipDeeperThan: Int?
        var seenHeader = false
        let all = items.filter { !$0.isArchived }
        for (i, item) in all.enumerated() {
            if !item.isVisible(showCompleted: showCompleted) { continue }
            if let level = skipDeeperThan {
                if item.indent > level { continue }
                skipDeeperThan = nil
            }
            // A parent has at least one subtask that is visible right now (hidden completed ones don't count).
            let isParent = all[(i + 1)...].prefix { $0.indent > item.indent }
                .contains { $0.isVisible(showCompleted: showCompleted) }
            let isHeader = item.indent == 0 && isParent
            result.append(.item(item, group: nil, isParent: isParent, isFirstHeader: isHeader && !seenHeader))
            if isHeader { seenHeader = true }
            if collapsed.contains(item.id) && isParent { skipDeeperThan = item.indent }
        }
        return result
    }

    /// End (exclusive) of the subtree rooted at `index`: the item plus everything nested below it.
    static func subtreeEnd(_ items: [Item], _ index: Int) -> Int {
        var end = index + 1
        while end < items.count && items[end].indent > items[index].indent { end += 1 }
        return end
    }

    /// Whether `id` lies inside `ancestorID`'s subtree.
    static func isDescendant(_ items: [Item], _ id: String, of ancestorID: String) -> Bool {
        guard let a = items.firstIndex(where: { $0.id == ancestorID }),
              let i = items.firstIndex(where: { $0.id == id }) else { return false }
        return i > a && i < subtreeEnd(items, a)
    }

    /// Ancestors of the item at `index`, nearest first.
    static func ancestorIndices(_ items: [Item], _ index: Int) -> [Int] {
        var result: [Int] = []
        var level = items[index].indent
        var i = index - 1
        while i >= 0 && level > 0 {
            if items[i].indent < level {
                result.append(i)
                level = items[i].indent
            }
            i -= 1
        }
        return result
    }

    /// The given ids reduced to the topmost ones (dropping any whose ancestor is also given), in position order.
    static func blockRoots(_ items: [Item], _ ids: Set<String>) -> [String] {
        var roots: [String] = []
        var coveredUntil = -1
        for (i, item) in items.enumerated() where ids.contains(item.id) {
            if i < coveredUntil { continue }
            roots.append(item.id)
            coveredUntil = subtreeEnd(items, i)
        }
        return roots
    }
}

/// A line of pasted text, turned into a task.
struct PastedLine: Equatable {
    var text: String
    /// Nesting relative to the shallowest pasted line.
    var level: Int
    var done = false

    /// Splits multi-line text into tasks. Understands tab/space indentation, bullets (`-`, `*`, `•`, `+`, `1.`)
    /// and Markdown checkboxes (`[ ]`, `[x]`). Blank lines are skipped.
    static func parse(_ text: String) -> [PastedLine] {
        let rawLines = text.replacingOccurrences(of: "\r\n", with: "\n").split(separator: "\n", omittingEmptySubsequences: false)
        var lines: [(indent: Int, text: String)] = []
        for raw in rawLines {
            let line = String(raw)
            guard !line.trimmingCharacters(in: .whitespaces).isEmpty else { continue }
            var width = 0
            for ch in line {
                if ch == "\t" { width += 4 } else if ch == " " { width += 1 } else { break }
            }
            lines.append((width, line.trimmingCharacters(in: .whitespaces)))
        }
        guard !lines.isEmpty else { return [] }

        // Indent unit: the smallest step between distinct widths (so 2- and 4-space indents both work).
        let widths = Set(lines.map(\.indent)).sorted()
        let base = widths[0]
        let unit = zip(widths, widths.dropFirst()).map { $1 - $0 }.min() ?? 4

        return lines.map { indent, text in
            var body = Substring(text)
            if let match = body.firstMatch(of: /^(?:[-*•+]|\d+[.)])\s+/) { body = body[match.range.upperBound...] }
            var done = false
            if let match = body.firstMatch(of: /^\[( |x|X)\]\s*/) {
                done = match.output.1 != " "
                body = body[match.range.upperBound...]
            }
            return PastedLine(text: String(body), level: (indent - base) / max(unit, 1), done: done)
        }
    }
}
