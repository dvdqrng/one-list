import Foundation

/// Structural edits on the outline as pure functions: they take the items (position order) and return the
/// new order. Indentation always moves a task together with its subtree, and never skips a level.
enum OutlineEdit {
    private static func index(_ items: [Item], _ id: String) -> Int? { items.firstIndex { $0.id == id } }

    // MARK: Indent

    /// Indents (`delta` = 1) or outdents (`delta` = -1) each root with its subtree. A task can be at most one
    /// level deeper than the task above it.
    static func indent(_ items: [Item], roots: [String], by delta: Int) -> [Item] {
        var items = items
        for id in roots {
            guard let i = index(items, id) else { continue }
            let newIndent = items[i].indent + delta
            guard newIndent >= 0 else { continue }
            if delta > 0 { guard i > 0, newIndent <= items[i - 1].indent + 1 else { continue } }
            for k in i..<Outline.subtreeEnd(items, i) { items[k].indent += delta }
        }
        return items
    }

    // MARK: Move

    /// Moves each root (with its subtree) past the previous/next visible block. Returns nil when the
    /// first block can't move any further. Moving out of the first/last position of a parent crosses into
    /// the neighbouring parent, like in other outliners.
    static func move(_ items: [Item], roots: [String], up: Bool, isListed: (Item) -> Bool) -> [Item]? {
        var items = items
        for id in up ? roots : roots.reversed() {
            guard let i = index(items, id) else { continue }
            let end = Outline.subtreeEnd(items, i)
            let block = Array(items[i..<end])
            if up {
                var k = i - 1
                while k >= 0 && (items[k].indent > items[i].indent || !isListed(items[k])) { k -= 1 }
                guard k >= 0 else { return nil }
                items.removeSubrange(i..<end)
                items.insert(contentsOf: block, at: k)
            } else {
                var n = end
                while n < items.count && !isListed(items[n]) { n = Outline.subtreeEnd(items, n) }
                guard n < items.count else { return nil }
                // Past a sibling (and its subtree), or into a shallower task as its first child.
                let target = items[n].indent >= items[i].indent ? Outline.subtreeEnd(items, n) : n + 1
                items.removeSubrange(i..<end)
                items.insert(contentsOf: block, at: target - block.count)
            }
        }
        return items
    }

    /// Drag and drop: moves `id` with its subtree to `targetID`'s place, at the target's level. Dragging down
    /// lands below the target (and its subtasks), dragging up lands above it. Nil for a drop onto itself or
    /// into its own subtree.
    static func drop(_ items: [Item], id: String, onto targetID: String) -> [Item]? {
        guard id != targetID, let i = index(items, id), let t = index(items, targetID) else { return nil }
        let end = Outline.subtreeEnd(items, i)
        guard !(i..<end).contains(t) else { return nil }
        let delta = items[t].indent - items[i].indent
        var block = Array(items[i..<end])
        for k in block.indices { block[k].indent += delta }
        var result = items
        let insertAt = t > i ? Outline.subtreeEnd(items, t) - block.count : t
        result.removeSubrange(i..<end)
        result.insert(contentsOf: block, at: insertAt)
        return result
    }

    // MARK: Delete / duplicate

    static func delete(_ items: [Item], roots: [String]) -> [Item] {
        var items = items
        for id in roots {
            guard let i = index(items, id) else { continue }
            items.removeSubrange(i..<Outline.subtreeEnd(items, i))
        }
        return items
    }

    /// Copies each root with its subtree right below it. Returns the ids of the copied roots.
    static func duplicate(_ items: [Item], roots: [String]) -> (items: [Item], copies: [String]) {
        var items = items
        var copies: [String] = []
        for id in roots {
            guard let i = index(items, id) else { continue }
            let end = Outline.subtreeEnd(items, i)
            let block = items[i..<end].map { original -> Item in
                var copy = original
                copy.id = Item().id
                copy.createdAt = .now
                return copy
            }
            items.insert(contentsOf: block, at: end)
            copies.append(block[0].id)
        }
        return (items, copies)
    }

    // MARK: Text editing

    /// Return at `caret` (UTF-16 offset): at the start of a non-empty task inserts an empty task above;
    /// otherwise the text after the caret moves to a new task below. Below an expanded parent the new task
    /// becomes its first child. Returns the task that should get the cursor and where.
    static func split(_ items: [Item], id: String, caret: Int, collapsed: Bool,
                      configure: (inout Item) -> Void) -> (items: [Item], focus: FocusRequest)? {
        guard let i = index(items, id) else { return nil }
        var items = items
        let title = items[i].title as NSString
        let caret = min(max(caret, 0), title.length)
        var new = Item()
        new.indent = items[i].indent
        configure(&new)

        if caret == 0 && title.length > 0 {
            items.insert(new, at: i)
            return (items, FocusRequest(id: id, caret: .start))
        }

        items[i].title = title.substring(to: caret)
        new.title = title.substring(from: caret)
        let end = Outline.subtreeEnd(items, i)
        if end > i + 1 && !collapsed {
            new.indent = items[i].indent + 1
            items.insert(new, at: i + 1)
        } else {
            items.insert(new, at: end)
        }
        return (items, FocusRequest(id: new.id, caret: .start))
    }

    /// Appends `id`'s text to `intoID` and removes `id` (its subtasks stay where they are).
    /// Returns the caret position at the join.
    static func merge(_ items: [Item], id: String, into intoID: String) -> (items: [Item], focus: FocusRequest)? {
        guard id != intoID, let from = index(items, id), let to = index(items, intoID) else { return nil }
        var items = items
        let join = (items[to].title as NSString).length
        items[to].title += items[from].title
        if items[to].details == nil { items[to].details = items[from].details }
        items.remove(at: from)
        return (items, FocusRequest(id: intoID, caret: .offset(join)))
    }

    /// Inserts pasted lines as tasks below `id`'s subtree, nested relative to `id`.
    static func paste(_ items: [Item], lines: [PastedLine], after id: String,
                      configure: (inout Item) -> Void) -> (items: [Item], last: String)? {
        guard let i = index(items, id), !lines.isEmpty else { return nil }
        var items = items
        var at = Outline.subtreeEnd(items, i)
        let base = items[i].indent
        var last = id
        for line in lines {
            var item = Item()
            item.title = line.text
            item.indent = min(max(0, base + line.level), items[at - 1].indent + 1)
            configure(&item)
            if line.done { item.setStatus(.done) }
            items.insert(item, at: at)
            last = item.id
            at += 1
        }
        return (items, last)
    }
}
