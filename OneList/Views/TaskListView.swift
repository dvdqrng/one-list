import AppKit
import SwiftUI

/// The document-like list (the editor). Grouped either by project (indent hierarchy) or by due date.
///
/// Keyboard model:
/// - Editing a task: ↑/↓ move between tasks keeping the caret column, Return splits at the caret,
///   Backspace at the start / Delete at the end join tasks, Tab/⇧Tab indent with subtasks,
///   ⇧↑/⇧↓ switch to block selection, Esc stops editing.
/// - Selection mode (no text cursor): ↑/↓ move, ⇧↑/⇧↓ extend, Return edits, ⌫ deletes, Tab indents,
///   ⌘A selects all, Esc clears, typing starts editing.
/// - The Task menu (⌘K, ⌘], ⌥⌘↑, …) works in both modes; see `TaskCommands`.
struct TaskListView: View {
    @Environment(AppStore.self) private var store
    @Environment(FocusTimer.self) private var timer

    @State private var placeholderTitles: [DueCategory: String] = [:]
    /// The task being dragged by its handle. Dragging is handled here rather than with system drag and drop:
    /// AppKit hands drops over a task's text to the text field, which would swallow them.
    @State private var drag: ListDrag?
    /// Row frames in the list, collected only while dragging.
    @State private var rowFrames: [String: CGRect] = [:]

    var body: some View {
        let entries = store.outline
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(entries) { entry in
                        row(for: entry, in: entries)
                            .padding(.leading, entry.item == nil ? Metrics.handleGutter : 0) // task rows hold their handle there
                            .background {
                                if drag != nil {
                                    GeometryReader { geometry in
                                        Color.clear.preference(key: RowFramesKey.self,
                                                               value: [entry.id: geometry.frame(in: .named(Self.space))])
                                    }
                                }
                            }
                    }
                }
                .coordinateSpace(name: Self.space)
                .onPreferenceChange(RowFramesKey.self) { frames in
                    MainActor.assumeIsolated { rowFrames = frames }
                }
                .overlay(alignment: .topLeading) { dragPreview }
                // Rows are built differently per grouping; rebuild rather than reuse when it changes.
                .id(store.listGroupBy)
                // The drag-handle gutter sits inside the left margin.
                .padding(.leading, Metrics.listMargin - Metrics.handleGutter)
                .padding(.trailing, Metrics.listMargin)
                .padding(.top, 20)
                .padding(.bottom, store.showAIInput ? 96 : 32) // keep the last tasks clear of the composer
                .frame(maxWidth: Metrics.listWidth + 2 * Metrics.listMargin, alignment: .leading)
                .frame(maxWidth: .infinity)

                // Clicking below the list ends editing and clears the selection.
                Color.clear
                    .frame(height: 120)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        endTextEditing()
                        store.select(nil)
                    }
            }
            .scrollIndicators(.automatic)
            .onChange(of: store.activeItemID) { _, id in
                // Instant, so key repeat never waits for a scroll animation.
                if let id { proxy.scrollTo(id) }
            }
        }
        .background(KeyEventMonitor { handleSelectionModeKey($0) })
    }

    private static let space = "taskList"

    @ViewBuilder private func row(for entry: OutlineEntry, in entries: [OutlineEntry]) -> some View {
        switch entry {
        case .header(let category, let isFirst):
            groupHeader(category, topPadding: isFirst ? 0 : Metrics.groupSpacing)
        case .placeholder(let category):
            placeholderRow(category, entries: entries)
        case .item(let item, let group, let isParent, let isFirstHeader):
            if let group {
                taskRow(item, group: group, entries: entries)
            } else {
                let isProjectHeader = isParent && item.indent == 0
                taskRow(item, isParent: isParent, entries: entries)
                    .padding(.top, isProjectHeader && !isFirstHeader ? Metrics.groupSpacing : 0)
            }
        }
    }

    // MARK: - Navigation

    /// The focusable row `offset` steps away (tasks and placeholders).
    private func neighbor(of id: String, offset: Int, in entries: [OutlineEntry], tasksOnly: Bool = false) -> String? {
        let order = entries.filter { tasksOnly ? $0.item != nil : $0.isFocusable }.map(\.id)
        guard let i = order.firstIndex(of: id), order.indices.contains(i + offset) else { return nil }
        return order[i + offset]
    }

    private func isSelected(_ id: String) -> Bool {
        guard store.editingID == nil else { return false }
        return store.selection.isEmpty ? store.activeItemID == id : store.selection.contains(id)
    }

    // MARK: - Rows

    /// Parents (project mode only) get a collapse chevron; a top-level parent is a project header.
    private func taskRow(_ item: Item, isParent: Bool = false, group: DueCategory? = nil, entries: [OutlineEntry]) -> some View {
        let isProjectHeader = isParent && item.indent == 0
        return DraggableRow(
            isDragged: drag?.id == item.id,
            isDropTarget: drag?.target == item.id,
            dropHighlight: group != nil ? .fill : .line(below: isBelowDragSource(item.id)),
            // Right before the checkbox: in the empty disclosure column, or left of the collapse chevron.
            handleOffset: Metrics.handleGutter + Metrics.rowPadding + CGFloat(item.indent) * Metrics.indent
                - (isParent ? Metrics.disclosure : 0),
            space: Self.space,
            onDrag: { location in dragChanged(item, to: location, entries: entries) },
            onDrop: { dragEnded(entries: entries) }
        ) {
            TaskRow(
                item: item,
                level: group == nil ? item.indent : 0, // date groups are flat
                disclosure: isParent
                    ? (store.collapsed.contains(item.id), { animate { store.toggleCollapsed(item.id) } })
                    : nil,
                showsDisclosureColumn: true, // checkboxes line up under group and project headings
                isHeading: isProjectHeader,
                weight: isParent ? .medium : .regular,
                showMetadata: store.showMetadata && !isProjectHeader,
                excludeMetadata: group != nil ? ["dueDate"] : [],
                isSelected: isSelected(item.id),
                onTitleChange: { store.setTitle(item.id, $0) },
                onKey: { handleKey($0, $1, item: item, group: group, entries: entries) },
                onPasteLines: { text in
                    let lines = PastedLine.parse(text)
                    guard let first = lines.first else { return nil }
                    if lines.count > 1 { store.pasteLines(Array(lines.dropFirst()), after: item.id, group: group) }
                    return first.text
                },
                onModifiedClick: { modifiers in handleModifiedClick(item.id, modifiers) }
            )
        }
    }

    private func isBelowDragSource(_ id: String) -> Bool {
        guard let drag, let from = store.index(of: drag.id), let to = store.index(of: id) else { return false }
        return to > from
    }

    // MARK: - Drag and drop

    private func dragChanged(_ item: Item, to location: CGPoint, entries: [OutlineEntry]) {
        if drag == nil {
            endTextEditing()
            drag = ListDrag(id: item.id, title: item.title, location: location)
        }
        drag?.location = location
        drag?.target = dropTarget(at: location.y, dragging: item.id, entries: entries)
    }

    /// The row under the pointer that the dragged task can be dropped on (in a gap: the nearest row).
    private func dropTarget(at y: CGFloat, dragging id: String, entries: [OutlineEntry]) -> String? {
        let candidates = entries.filter { entry in
            guard entry.id != id, rowFrames[entry.id] != nil else { return false }
            if case .item(let item, let group, _, _) = entry {
                return group != nil || !Outline.isDescendant(store.items, item.id, of: id)
            }
            return true // date group headings and empty-group rows
        }
        func distance(_ entry: OutlineEntry) -> CGFloat {
            let frame = rowFrames[entry.id]!
            return frame.minY <= y && y < frame.maxY ? 0 : min(abs(frame.minY - y), abs(frame.maxY - y))
        }
        return candidates.min { distance($0) < distance($1) }?.id
    }

    private func dragEnded(entries: [OutlineEntry]) {
        defer {
            drag = nil
            rowFrames = [:]
        }
        guard let drag, let target = drag.target, let entry = entries.first(where: { $0.id == target }) else { return }
        animate {
            switch entry {
            case .header(let category, _), .placeholder(let category):
                store.move(drag.id, into: .due(category))
            case .item(let item, let group, _, _):
                if let group { store.move(drag.id, into: .due(group)) } else { store.move(drag.id, onto: item.id) }
            }
        }
        store.select(drag.id)
    }

    /// The dragged task, following the pointer.
    @ViewBuilder private var dragPreview: some View {
        if let drag {
            Text(drag.title.isEmpty ? "Untitled" : drag.title)
                .font(.system(size: Metrics.taskFont))
                .lineLimit(1)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .frame(maxWidth: 320, alignment: .leading)
                .fixedSize()
                .cardStyle()
                .offset(x: drag.location.x + 12, y: drag.location.y - 16)
                .allowsHitTesting(false)
        }
    }

    /// The heading of a date group. It (including the gap above it) is a drop target for the group.
    private func groupHeader(_ category: DueCategory, topPadding: CGFloat) -> some View {
        let isCollapsed = store.collapsedGroups.contains(category)
        let headerID = "header-\(category.rawValue)"
        let count = Grouping.dueDateGroups(store.items, showCompleted: store.showCompleted)
            .first { $0.key == .due(category) }?.items.count ?? 0
        return HStack(spacing: 0) {
            Button { animate { store.toggleGroupCollapsed(category) } } label: {
                HStack(spacing: 0) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.tertiary)
                        .rotationEffect(.degrees(isCollapsed ? 0 : 90))
                        .frame(width: Metrics.disclosure)
                        .padding(.trailing, Metrics.disclosureGap)
                    Text(category.label)
                        .font(.system(size: Metrics.headingFont, weight: .semibold))
                        .foregroundStyle(category == .overdue ? Color.red : Color.primary)
                    if count > 0 {
                        Text("\(count)")
                            .font(.system(size: Metrics.taskFont))
                            .foregroundStyle(.tertiary)
                            .monospacedDigit()
                            .padding(.leading, 8)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Spacer(minLength: 0)

            if category == .now {
                Button { timer.start() } label: { Label("Focus", systemImage: "play.fill") }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .help("Start a 25-minute focus session")
            }
        }
        .frame(minHeight: Metrics.rowHeight - 12)
        .padding(.horizontal, Metrics.rowPadding)
        .padding(.vertical, 6)
        .background {
            if drag?.target == headerID {
                RoundedRectangle(cornerRadius: Metrics.rowCornerRadius).fill(Color.accentColor.opacity(0.12))
            }
        }
        .padding(.top, topPadding)
    }

    private func placeholderRow(_ category: DueCategory, entries: [OutlineEntry]) -> some View {
        var placeholder = Item()
        placeholder.id = OutlineEntry.placeholderID(category)
        placeholder.title = placeholderTitles[category] ?? ""
        return TaskRow(
            item: placeholder,
            showsDisclosureColumn: true, // line up with the tasks of other groups
            placeholder: "Add a task",
            onTitleChange: { placeholderTitles[category] = $0 },
            onKey: { key, context in
                switch key {
                case .enter:
                    let title = context.text.trimmingCharacters(in: .whitespaces)
                    guard !title.isEmpty else { return true }
                    let id = store.addItem { item in
                        item.title = title
                        item.assign(to: .due(category))
                    }
                    placeholderTitles[category] = ""
                    store.focus(id)
                case .up, .down:
                    if let target = neighbor(of: placeholder.id, offset: key == .up ? -1 : 1, in: entries) {
                        store.focus(target, caret: .offset(context.caret))
                    }
                case .escape:
                    endTextEditing()
                default:
                    return false
                }
                return true
            },
            onStatusChange: { _ in },
            onSelect: {}
        )
        // An empty group shows only this row; it takes drops for the group.
        .background {
            if drag?.target == placeholder.id {
                RoundedRectangle(cornerRadius: Metrics.rowCornerRadius).fill(Color.accentColor.opacity(0.12))
            }
        }
    }

    // MARK: - Keyboard: editing a task

    private func handleKey(_ key: TaskKey, _ context: TaskKeyContext, item: Item, group: DueCategory?,
                           entries: [OutlineEntry]) -> Bool {
        switch key {
        case .tab:
            animate { store.indentSelection(by: 1) }
        case .backtab:
            animate { store.indentSelection(by: -1) }
        case .up, .down:
            // Navigate from the logical cursor: with key repeat the next row may not have taken focus yet.
            // Keep the caret column when moving between tasks.
            let from = store.focusRequest?.id ?? item.id
            if let target = neighbor(of: from, offset: key == .up ? -1 : 1, in: entries) {
                store.focus(target, caret: .offset(context.caret))
            }
        case .shiftUp, .shiftDown:
            // Switch to block selection, starting with this task and its neighbour.
            guard let target = neighbor(of: item.id, offset: key == .shiftUp ? -1 : 1, in: entries, tasksOnly: true) else { return true }
            endTextEditing()
            store.selectRange(from: item.id, to: target)
        case .enter:
            if context.text.isEmpty && item.indent > 0 {
                animate { store.indentSelection(by: -1) } // Return on an empty subtask steps out a level
            } else {
                store.splitTask(item.id, caret: context.caret, group: group)
            }
        case .backspaceAtStart:
            if context.text.isEmpty {
                if item.indent > 0 {
                    animate { store.indentSelection(by: -1) }
                } else {
                    let previous = neighbor(of: item.id, offset: -1, in: entries)
                    if let previous { store.focus(previous) }
                    store.delete([item.id])
                }
            } else if let previous = neighbor(of: item.id, offset: -1, in: entries, tasksOnly: true) {
                store.mergeTask(item.id, into: previous)
            } else if item.indent > 0 {
                animate { store.indentSelection(by: -1) }
            }
        case .deleteAtEnd:
            if let next = neighbor(of: item.id, offset: 1, in: entries, tasksOnly: true) {
                store.mergeTask(next, into: item.id)
            }
        case .escape:
            store.focusRequest = nil
            endTextEditing() // the task stays selected: selection mode
        }
        return true
    }

    private func handleModifiedClick(_ id: String, _ modifiers: NSEvent.ModifierFlags) {
        endTextEditing()
        if modifiers.contains(.command) {
            store.toggleInSelection(id)
        } else if let anchor = store.selectionAnchor ?? store.activeItemID {
            store.selectRange(from: anchor, to: id)
        } else {
            store.select(id)
        }
    }

    // MARK: - Keyboard: selection mode (no text field focused)

    private func handleSelectionModeKey(_ event: NSEvent) -> Bool {
        guard store.editingID == nil, store.changelog == nil, !store.showUpdateDialog, !timer.isActive,
              let window = event.window, window.attachedSheet == nil,
              !(window.firstResponder is NSText) else { return false }

        let modifiers = event.modifierFlags.intersection([.shift, .command, .option, .control])
        let hasTarget = !store.targetIDs.isEmpty
        switch event.keyCode {
        case 126, 125: // ↑ ↓
            guard modifiers.isSubset(of: .shift) else { return false }
            store.moveSelection(by: event.keyCode == 126 ? -1 : 1, extending: modifiers == .shift)
        case 36, 76: // Return / Enter
            guard modifiers.isEmpty, let id = store.activeItemID, store.item(id) != nil else { return false }
            store.focus(id)
        case 53: // Esc
            guard store.activeItemID != nil else { return false }
            if store.selection.count > 1 { store.select(store.activeItemID) } else { store.select(nil) }
        case 51, 117: // ⌫ ⌦
            guard modifiers.isEmpty, hasTarget else { return false }
            animate { store.deleteSelection() }
        case 48: // Tab
            guard modifiers.isSubset(of: .shift), hasTarget else { return false }
            animate { store.indentSelection(by: modifiers.contains(.shift) ? -1 : 1) }
        case 0 where modifiers == .command: // ⌘A
            store.selectAllVisible()
        default:
            // Typing starts editing the selected task.
            guard modifiers.isSubset(of: .shift), store.selection.isEmpty, let id = store.activeItemID,
                  let item = store.item(id), let characters = event.characters, characters != " ",
                  let scalar = characters.unicodeScalars.first, scalar.value < 0xF700,
                  !CharacterSet.controlCharacters.contains(scalar) else { return false }
            store.setTitle(id, item.title + characters)
            store.focus(id)
        }
        return true
    }

    private func animate(_ change: () -> Void) {
        withAnimation(.snappy(duration: 0.18), change)
    }
}

/// Receives key-down events for this view's window (local monitor), while the view is on screen.
/// The handler returns true to consume the event.
struct KeyEventMonitor: NSViewRepresentable {
    let handler: (NSEvent) -> Bool

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        let coordinator = context.coordinator
        coordinator.view = view
        coordinator.monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak coordinator] event in
            guard let coordinator, event.window != nil, event.window === coordinator.view?.window else { return event }
            return coordinator.handler?(event) == true ? nil : event
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) { context.coordinator.handler = handler }

    static func dismantleNSView(_ nsView: NSView, coordinator: Coordinator) {
        if let monitor = coordinator.monitor { NSEvent.removeMonitor(monitor) }
    }

    final class Coordinator {
        var handler: ((NSEvent) -> Bool)?
        var monitor: Any?
        weak var view: NSView?
    }
}

/// A task being dragged in the list.
private struct ListDrag: Equatable {
    let id: String
    let title: String
    var location: CGPoint
    var target: String?
}

private struct RowFramesKey: PreferenceKey {
    static let defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue()) { $1 }
    }
}

/// Row wrapper with the hover-revealed drag handle and drop indicators.
private struct DraggableRow<Content: View>: View {
    enum Highlight { case fill, line(below: Bool) }

    let isDragged: Bool
    let isDropTarget: Bool
    let dropHighlight: Highlight
    /// Where the handle sits, from the row's leading edge (gutter included).
    let handleOffset: CGFloat
    /// Coordinate space the drag location is reported in.
    let space: String
    let onDrag: (CGPoint) -> Void
    let onDrop: () -> Void
    @ViewBuilder let content: Content
    @State private var hovering = false

    var body: some View {
        content
            .opacity(isDragged ? 0.4 : 1)
            .background {
                if isDropTarget, case .fill = dropHighlight {
                    RoundedRectangle(cornerRadius: Metrics.rowCornerRadius).fill(Color.accentColor.opacity(0.12))
                }
            }
            .overlay(alignment: lineAlignment) {
                if isDropTarget, case .line = dropHighlight {
                    Capsule().fill(Color.accentColor).frame(height: 2).padding(.leading, Metrics.rowPadding + Metrics.disclosure)
                }
            }
            // The gutter keeps even a top-level project's handle (left of its chevron) inside the row's frame,
            // where it receives clicks.
            .padding(.leading, Metrics.handleGutter)
            .overlay(alignment: .leading) { handle.offset(x: handleOffset) }
            .onHover { hovering = $0 }
    }

    private var handle: some View {
        // Only the icon fades: SwiftUI doesn't hit-test fully transparent views, and the handle must always
        // take the click.
        Image(systemName: "line.3.horizontal")
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(.tertiary)
            .opacity(hovering || isDragged ? 1 : 0)
            .animation(.easeInOut(duration: 0.15), value: hovering)
            .frame(width: Metrics.disclosure, height: Metrics.rowHeight - 8)
            .contentShape(Rectangle())
            .onHover { inside in
                if inside { NSCursor.openHand.push() } else { NSCursor.pop() }
            }
            .gesture(
                DragGesture(minimumDistance: 3, coordinateSpace: .named(space))
                    .onChanged { onDrag($0.location) }
                    .onEnded { _ in onDrop() }
            )
            .help("Drag to move")
    }

    private var lineAlignment: Alignment {
        if case .line(let below) = dropHighlight, below { return .bottom }
        return .top
    }
}
