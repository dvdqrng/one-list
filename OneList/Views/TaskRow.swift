import SwiftUI

/// The one task row used everywhere: [disclosure] [checkbox] title … metadata.
struct TaskRow: View {
    enum Editing { case always, onClick, readonly }

    @Environment(AppStore.self) private var store

    let item: Item
    var editing: Editing = .always
    /// Nesting level (list view); the row is shifted by `Metrics.indent` per level.
    var level = 0
    /// Collapse state and toggle when the task has subtasks (list view).
    var disclosure: (collapsed: Bool, toggle: () -> Void)?
    /// Reserve the disclosure column so checkboxes line up (list view).
    var showsDisclosureColumn = false
    var isHeading = false
    var weight: Font.Weight = .regular
    var placeholder = "New Task"
    var showMetadata = false
    var excludeMetadata: Set<String> = []
    /// Kanban cards: metadata labels go under the title.
    var stackMetadata = false
    var isSelected = false
    var onTitleChange: ((String) -> Void)?
    var onKey: (TaskKey, TaskKeyContext) -> Bool = { _, _ in false }
    var onPasteLines: ((String) -> String?)?
    var onStatusChange: ((TodoStatus) -> Void)?
    var onSelect: (() -> Void)?
    /// ⇧-click / ⌘-click.
    var onModifiedClick: ((NSEvent.ModifierFlags) -> Void)?

    @State private var isEditing = false

    var body: some View {
        // Cards with labels align the checkbox with the title line, not the whole card.
        HStack(alignment: stackMetadata ? .top : .center, spacing: 0) {
            if showsDisclosureColumn || disclosure != nil {
                disclosureButton.padding(.trailing, Metrics.disclosureGap)
            }
            StatusCheckbox(state: .init(item)) {
                if onStatusChange == nil { store.select(item.id) }
                let next = StatusCheckbox.State(item).next
                if let onStatusChange { onStatusChange(next) } else { store.setStatus(item.id, next) }
            }
            .padding(.trailing, Metrics.checkboxGap)
            .padding(.top, stackMetadata ? 2 : 0)
            if stackMetadata {
                // Cards: labels sit under the title.
                VStack(alignment: .leading, spacing: 4) {
                    titleView
                    if showMetadata { MetadataLabels(item: item, exclude: excludeMetadata) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                titleView
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .layoutPriority(1)
            }
            if item.isAIBusy {
                ProgressView().controlSize(.mini).padding(.leading, 8)
            }
            if showMetadata && !stackMetadata {
                MetadataLabels(item: item, exclude: excludeMetadata).padding(.leading, 12)
            }
        }
        .frame(minHeight: Metrics.rowHeight - 12)
        .padding(.leading, CGFloat(level) * Metrics.indent + Metrics.rowPadding)
        .padding(.trailing, Metrics.rowPadding)
        .padding(.vertical, 6)
        .background {
            if isSelected {
                RoundedRectangle(cornerRadius: Metrics.rowCornerRadius, style: .continuous)
                    .fill(Color.accentColor.opacity(0.12))
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            let modifiers = NSEvent.modifierFlags.intersection([.shift, .command])
            if !modifiers.isEmpty, let onModifiedClick { onModifiedClick(modifiers) } else { (onSelect ?? { store.select(item.id) })() }
        }
        .animation(.snappy(duration: 0.16), value: level)
    }

    @ViewBuilder private var disclosureButton: some View {
        if let disclosure {
            Button(action: disclosure.toggle) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.tertiary)
                    .rotationEffect(.degrees(disclosure.collapsed ? 0 : 90))
                    .animation(.snappy(duration: 0.15), value: disclosure.collapsed)
                    .frame(width: Metrics.disclosure, height: 20)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help(disclosure.collapsed ? "Expand" : "Collapse")
        } else {
            Color.clear.frame(width: Metrics.disclosure, height: 20)
        }
    }

    private var fontSize: CGFloat { isHeading ? Metrics.headingFont : Metrics.taskFont }
    private var fontWeight: Font.Weight { isHeading ? .semibold : weight }

    @ViewBuilder private var titleView: some View {
        let request = store.focusRequest?.id == item.id ? store.focusRequest : nil
        let showField = editing == .always || (editing == .onClick && (isEditing || request != nil))
        if showField, let onTitleChange {
            TaskTextField(
                text: item.title,
                placeholder: placeholder,
                fontSize: fontSize,
                weight: fontWeight,
                completed: item.completed,
                focusRequest: request?.caret,
                onChange: onTitleChange,
                onFocus: {
                    isEditing = true
                    store.beginEditing(item.id)
                },
                onEndEditing: {
                    isEditing = false
                    store.endEditing(item.id)
                },
                onFocusHandled: {
                    isEditing = true // keep the field mounted once the request is cleared
                    if store.focusRequest?.id == item.id { store.focusRequest = nil }
                },
                onKey: { key, context in
                    if editing == .onClick, key == .enter || key == .escape {
                        endTextEditing()
                        return true
                    }
                    return onKey(key, context)
                },
                onPasteLines: onPasteLines,
                onModifiedClick: onModifiedClick
            )
        } else {
            let isPlaceholder = item.title.isEmpty && editing != .readonly
            Text(item.title.isEmpty ? (isPlaceholder ? placeholder : "Untitled") : item.title)
                .font(.system(size: fontSize, weight: fontWeight))
                .foregroundStyle(isPlaceholder ? .tertiary : item.completed ? .secondary : .primary)
                .strikethrough(item.completed)
                .lineLimit(1)
                .truncationMode(.tail)
                .onTapGesture {
                    store.select(item.id)
                    if editing == .onClick { store.focusRequest = FocusRequest(id: item.id) }
                }
        }
    }
}
