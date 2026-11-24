import SwiftUI

struct KanbanView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        let _ = store.currentDay // re-evaluated when the day changes
        let columns = Grouping.kanbanColumns(store.items, groupBy: store.kanbanGroupBy, showCompleted: store.showCompleted)
        let order = columns.flatMap { $0.items.map(\.id) }
        ScrollView(.horizontal) {
            HStack(alignment: .top, spacing: 16) {
                ForEach(columns) { column in
                    KanbanColumnView(column: column, order: order)
                }
            }
            .padding(20)
            .frame(maxHeight: .infinity, alignment: .top)
        }
        .scrollIndicators(.automatic)
    }
}

private struct KanbanColumnView: View {
    @Environment(AppStore.self) private var store
    let column: ItemGroup
    /// All card ids in board order, for arrow-key navigation.
    let order: [String]
    @State private var isTargeted = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text(column.title).font(.system(size: Metrics.taskFont, weight: .semibold))
                Text("\(column.items.count)").font(.system(size: Metrics.taskFont)).foregroundStyle(.tertiary).monospacedDigit()
                Spacer()
                Button { store.addItem(in: column.key) } label: {
                    Image(systemName: "plus").font(.system(size: 12, weight: .medium))
                }
                .buttonStyle(.borderless)
                .foregroundStyle(.secondary)
                .help("Add a task to \(column.title)")
            }
            .frame(height: 24)
            .padding(.horizontal, 8)
            .padding(.bottom, 8)

            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(column.items) { item in
                        KanbanCard(item: item, groupBy: store.kanbanGroupBy, order: order)
                    }
                }
                .padding(.bottom, 8)
            }
            .scrollIndicators(.never)
        }
        .padding(8)
        .frame(width: 272)
        .frame(maxHeight: .infinity, alignment: .top)
        .background {
            RoundedRectangle(cornerRadius: Metrics.columnCornerRadius, style: .continuous)
                .fill(isTargeted ? Color.accentColor.opacity(0.08) : Color.primary.opacity(0.03))
        }
        .dropDestination(for: String.self) { ids, _ in
            guard let id = ids.first else { return false }
            if !column.items.contains(where: { $0.id == id }) {
                withAnimation(.snappy(duration: 0.2)) { store.move(id, into: column.key) }
            }
            return true
        } isTargeted: { isTargeted = $0 }
    }
}

private struct KanbanCard: View {
    @Environment(AppStore.self) private var store
    let item: Item
    let groupBy: KanbanGroupBy
    let order: [String]

    var body: some View {
        TaskRow(
            item: item,
            editing: .onClick,
            showMetadata: store.showMetadata,
            excludeMetadata: groupBy == .dueDate ? ["dueDate"] : groupBy == .category ? ["category"] : groupBy == .priority ? ["priority"] : [],
            stackMetadata: true,
            onTitleChange: { store.setTitle(item.id, $0) },
            onKey: { key, _ in
                guard key == .up || key == .down, let i = order.firstIndex(of: item.id) else { return false }
                let target = i + (key == .up ? -1 : 1)
                if order.indices.contains(target) { store.focus(order[target]) }
                return true
            }
        )
        .padding(.vertical, 2)
        .frame(width: 256, alignment: .leading)
        .cardStyle(selected: store.activeItemID == item.id && store.editingID == nil)
        .onDrag { NSItemProvider(object: item.id as NSString) } preview: {
            TaskRow(item: item, editing: .readonly)
                .padding(.vertical, 2)
                .frame(width: 256, alignment: .leading)
                .cardStyle()
        }
    }
}
