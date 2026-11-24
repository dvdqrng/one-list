import SwiftUI

/// The one task row of the iOS app — list, board cards, focus mode and subtasks all use it, so a task
/// looks the same everywhere (and like on the Mac): [disclosure] [checkbox] title, labels underneath.
struct TaskRowView: View {
    @Environment(AppStore.self) private var store

    let item: Item
    /// Nesting level; the row is shifted by `Metrics.indent` per level.
    var level = 0
    /// Collapse state and toggle when the task has subtasks.
    var disclosure: (collapsed: Bool, toggle: () -> Void)?
    /// Reserve the disclosure column so checkboxes line up.
    var showsDisclosureColumn = false
    var isHeading = false
    var weight: Font.Weight = .regular
    var placeholder = "New Task"
    var showMetadata = false
    var excludeMetadata: Set<String> = []
    /// Editable rows turn into a text field when tapped (or when the store asks to focus them).
    var editable = false
    var group: DueCategory?
    var onKey: (OutlineKey, Int, String) -> Bool = { _, _, _ in false }
    var onPasteLines: ((String) -> String?)?
    var onTap: (() -> Void)?

    /// Follows Dynamic Type; the text field uses the same size, so the row doesn't jump when editing starts.
    @ScaledMetric(relativeTo: .body) private var typeScale: CGFloat = 1

    var body: some View {
        let checkboxBaseline = Metrics.taskFont * 0.32 * typeScale
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            if showsDisclosureColumn || disclosure != nil {
                disclosureButton.padding(.trailing, Metrics.disclosureGap)
            }
            StatusCheckbox(state: .init(item)) {
                let next = StatusCheckbox.State(item).next
                withAnimation(.snappy(duration: 0.2)) { store.setStatus(item.id, next) }
            }
            .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + checkboxBaseline }
            .padding(.trailing, Metrics.checkboxGap)

            VStack(alignment: .leading, spacing: 4) {
                titleView
                if showMetadata { MetadataLabels(item: item, exclude: excludeMetadata) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if item.isAIBusy {
                ProgressView().controlSize(.small).padding(.leading, 8)
            }
        }
        .padding(.leading, CGFloat(level) * Metrics.indent)
        .padding(.vertical, 10)
        .frame(minHeight: Metrics.rowHeight)
        .contentShape(Rectangle())
        .onTapGesture { (onTap ?? defaultTap)() }
        .animation(.snappy(duration: 0.16), value: level)
        .sensoryFeedback(trigger: item.completed) { _, done in done ? .success : .selection }
    }

    private func defaultTap() {
        if editable { store.focus(item.id) } else { store.select(item.id) }
    }

    private var isEditing: Bool {
        editable && (store.editingID == item.id || store.focusRequest?.id == item.id)
    }

    @ViewBuilder private var disclosureButton: some View {
        if let disclosure {
            Button(action: disclosure.toggle) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.tertiary)
                    .rotationEffect(.degrees(disclosure.collapsed ? 0 : 90))
                    .animation(.snappy(duration: 0.15), value: disclosure.collapsed)
                    .frame(width: Metrics.disclosure, height: Metrics.rowHeight - 12)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(disclosure.collapsed ? "Expand" : "Collapse")
        } else {
            Color.clear.frame(width: Metrics.disclosure, height: 1)
        }
    }

    private var fontSize: CGFloat { (isHeading ? Metrics.headingFont : Metrics.taskFont) * typeScale }
    private var fontWeight: Font.Weight { isHeading ? .semibold : weight }

    @ViewBuilder private var titleView: some View {
        if isEditing {
            OutlineTextField(
                text: item.title,
                placeholder: placeholder,
                fontSize: fontSize,
                weight: fontWeight.uiWeight,
                completed: item.completed,
                focusRequest: store.focusRequest?.id == item.id ? store.focusRequest?.caret : nil,
                onChange: { store.setTitle(item.id, $0) },
                onKey: onKey,
                onPasteLines: onPasteLines,
                onBeginEditing: { store.beginEditing(item.id) },
                onEndEditing: { store.endEditing(item.id) },
                onFocusHandled: { if store.focusRequest?.id == item.id { store.focusRequest = nil } }
            )
            .frame(minHeight: fontSize * 1.3)
        } else {
            let isPlaceholder = item.title.isEmpty
            Text(isPlaceholder ? placeholder : item.title)
                .font(.system(size: fontSize, weight: fontWeight))
                .foregroundStyle(isPlaceholder ? .tertiary : item.completed ? .secondary : .primary)
                .strikethrough(item.completed && !isPlaceholder)
                .lineLimit(isHeading ? 2 : 4)
                .multilineTextAlignment(.leading)
        }
    }
}

extension Font.Weight {
    var uiWeight: UIFont.Weight {
        switch self {
        case .medium: .medium
        case .semibold: .semibold
        case .bold: .bold
        default: .regular
        }
    }
}
