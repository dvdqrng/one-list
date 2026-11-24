import SwiftUI

/// The board: one column per due date, priority, status, category or project. Columns page sideways;
/// cards are dragged between columns (or moved with their context menu).
struct BoardView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        let _ = store.currentDay // re-evaluated when the day changes
        let columns = Grouping.kanbanColumns(store.items, groupBy: store.kanbanGroupBy, showCompleted: store.showCompleted)
        GeometryReader { proxy in
            // iPhone: one column per screen with the next one peeking in; iPad: fixed-width columns.
            let width = sizeClass == .compact ? proxy.size.width - 56 : 320
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 12) {
                    ForEach(columns) { column in
                        BoardColumn(column: column)
                            .frame(width: width)
                    }
                }
                .scrollTargetLayout()
                .padding(.horizontal, Metrics.listMargin)
                .padding(.vertical, 8)
            }
            .scrollTargetBehavior(.viewAligned)
            .scrollIndicators(.hidden)
        }
    }
}

private struct BoardColumn: View {
    @Environment(AppStore.self) private var store
    let column: ItemGroup
    @State private var isTargeted = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text(column.title)
                    .font(.system(size: Metrics.taskFont, weight: .semibold))
                    .lineLimit(1)
                Text("\(column.items.count)")
                    .font(.system(size: Metrics.taskFont))
                    .foregroundStyle(.tertiary)
                    .monospacedDigit()
                Spacer()
                Button {
                    Haptics.tap()
                    withAnimation(.snappy(duration: 0.2)) { store.addItem(in: column.key) }
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .foregroundStyle(.secondary)
                .accessibilityLabel("Add a task to \(column.title)")
            }
            .padding(.leading, 12)
            .padding(.trailing, 2)

            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(column.items) { item in
                        BoardCard(item: item)
                    }
                    if column.items.isEmpty {
                        Text("No tasks")
                            .font(.system(size: Metrics.labelFont))
                            .foregroundStyle(.tertiary)
                            .frame(maxWidth: .infinity, minHeight: 64)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.bottom, 8)
            }
            .scrollIndicators(.never)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .background {
            RoundedRectangle(cornerRadius: Metrics.columnCornerRadius, style: .continuous)
                .fill(isTargeted ? Color.accentColor.opacity(0.10) : Color.wellBackground)
        }
        .dropDestination(for: String.self) { ids, _ in
            guard let id = ids.first else { return false }
            if !column.items.contains(where: { $0.id == id }) {
                Haptics.thud()
                withAnimation(.snappy(duration: 0.2)) { store.move(id, into: column.key) }
            }
            return true
        } isTargeted: { targeted in
            if targeted && !isTargeted { Haptics.select() }
            isTargeted = targeted
        }
    }
}

private struct BoardCard: View {
    @Environment(AppStore.self) private var store
    let item: Item

    var body: some View {
        let groupBy = store.kanbanGroupBy
        TaskRowView(
            item: item,
            showMetadata: store.showMetadata,
            excludeMetadata: groupBy == .dueDate ? ["dueDate"] : groupBy == .category ? ["category"]
                : groupBy == .priority ? ["priority"] : [],
            editable: true,
            onKey: { key, _, _ in
                guard key == .enter || key == .escape else { return false }
                UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                return true
            }
        )
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardStyle(selected: store.isSidebarOpen && store.activeItemID == item.id)
        .draggable(item.id) {
            TaskRowView(item: item)
                .padding(.horizontal, 12)
                .frame(width: 260, alignment: .leading)
                .cardStyle()
                .environment(store)
        }
        .modifier(TaskActions(item: item, swipes: false))
    }
}
