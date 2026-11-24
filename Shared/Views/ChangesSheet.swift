import SwiftUI

/// Sheet for reviewing AI-proposed changes; each change can be (de)selected before applying.
struct ChangesSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let session: ChangelogSession
    @State private var selected: Set<UUID>

    init(session: ChangelogSession) {
        self.session = session
        // Uncertain proposals start unchecked.
        _selected = State(initialValue: Set(session.changes.filter(\.isConfident).map(\.id)))
    }

    private struct Group: Identifiable {
        let id: String
        let title: String
        let symbol: String
        let color: Color
        let changes: [ProposedChange]
    }

    private var groups: [Group] {
        func matching(_ match: (ChangeKind) -> Bool) -> [ProposedChange] { session.changes.filter { match($0.kind) } }
        return [
            Group(id: "add", title: "New Tasks", symbol: "plus.circle.fill", color: .green,
                  changes: matching { if case .add = $0 { true } else { false } }),
            Group(id: "update", title: "Updates", symbol: "pencil.circle.fill", color: .blue,
                  changes: matching { if case .update = $0 { true } else { false } }),
            Group(id: "status", title: "Status Changes", symbol: "checkmark.circle.fill", color: .purple,
                  changes: matching { if case .setCompleted = $0 { true } else { false } }),
            Group(id: "merge", title: "Merges", symbol: "arrow.triangle.merge", color: .orange,
                  changes: matching { if case .merge = $0 { true } else { false } }),
        ].filter { !$0.changes.isEmpty }
    }

    var body: some View {
        if session.changes.isEmpty {
            emptyState
        } else {
            VStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Review Changes").font(.system(size: 17, weight: .semibold))
                    if let input = session.inputText {
                        Text("“\(input)”").font(.callout).foregroundStyle(.secondary).lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 24)
                .padding(.top, 24)
                .padding(.bottom, 16)

                List {
                    ForEach(groups) { group in
                        Section {
                            ForEach(group.changes) { change in
                                Toggle(isOn: binding(for: change.id)) {
                                    ChangeDescription(change: change).opacity(selected.contains(change.id) ? 1 : 0.5)
                                }
                                .toggleStyle(ReviewToggleStyle())
                                .padding(.vertical, 3)
                            }
                        } header: {
                            Toggle(isOn: groupBinding(group)) {
                                Label("\(group.title) (\(group.changes.count))", systemImage: group.symbol)
                                    .foregroundStyle(group.color)
                            }
                            .toggleStyle(ReviewToggleStyle())
                        }
                    }
                }
                #if os(macOS)
                .listStyle(.inset(alternatesRowBackgrounds: false))
                #else
                .listStyle(.insetGrouped)
                #endif

                Divider()
                HStack {
                    Text("\(selected.count) of \(session.changes.count) selected").font(.callout).foregroundStyle(.secondary)
                    Spacer()
                    Button("Cancel", role: .cancel) { close() }
                        .keyboardShortcut(.cancelAction)
                    Button(selected.count == session.changes.count ? "Apply All" : "Apply \(selected.count)") {
                        Haptics.success()
                        withAnimation(.snappy) { store.apply(session.changes.filter { selected.contains($0.id) }) }
                    }
                    .keyboardShortcut(.defaultAction)
                    .disabled(selected.isEmpty)
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 16)
            }
            #if os(macOS)
            .frame(width: 560, height: 520)
            #else
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
            #endif
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            if let error = session.error {
                ContentUnavailableView("Something Went Wrong", systemImage: "exclamationmark.triangle", description: Text(error))
            } else {
                ContentUnavailableView(
                    session.source == .mergeButton ? "No Similar Tasks" : "No Changes Found",
                    systemImage: session.source == .mergeButton ? "rectangle.on.rectangle.slash" : "text.magnifyingglass",
                    description: Text(session.source == .mergeButton
                                      ? "No tasks look similar enough to merge."
                                      : "The AI couldn’t find anything to add or change in your input."))
            }
            Button("OK") { close() }.keyboardShortcut(.defaultAction)
        }
        .padding(24)
        #if os(macOS)
        .frame(width: 400)
        #else
        .presentationDetents([.medium])
        #endif
    }

    private func close() { store.changelog = nil }

    private func binding(for id: UUID) -> Binding<Bool> {
        Binding(get: { selected.contains(id) }, set: { on in if on { selected.insert(id) } else { selected.remove(id) } })
    }

    private func groupBinding(_ group: Group) -> Binding<Bool> {
        let ids = Set(group.changes.map(\.id))
        return Binding(get: { ids.isSubset(of: selected) },
                       set: { on in if on { selected.formUnion(ids) } else { selected.subtract(ids) } })
    }
}

/// A checkbox on the Mac; on iOS the same check circle as the task checkbox, sized for touch.
struct ReviewToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        #if os(macOS)
        Toggle(configuration).toggleStyle(.checkbox)
        #else
        Button { configuration.isOn.toggle() } label: {
            HStack(alignment: .firstTextBaseline, spacing: Metrics.checkboxGap) {
                Image(systemName: configuration.isOn ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: Metrics.checkbox - 2))
                    .foregroundStyle(configuration.isOn ? Color.accentColor : Color.secondary.opacity(0.55))
                    .frame(width: Metrics.checkbox)
                    .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 6 }
                configuration.label
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(configuration.isOn ? "Selected" : "Not selected")
        #endif
    }
}

/// What a single change does, in words.
private struct ChangeDescription: View {
    let change: ProposedChange

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            switch change.kind {
            case .add(let item):
                Text(item.title).fontWeight(.medium)
                if let details = item.details { Text(details).font(.callout).foregroundStyle(.secondary).lineLimit(2) }
                MetadataLabels(item: item)

            case .update(let item, let updates):
                Text(item.title).fontWeight(.medium)
                ForEach(updates.fieldChanges(from: item), id: \.0) { key, old, new in
                    HStack(spacing: 4) {
                        Text(Self.fieldName(key)).foregroundStyle(.secondary)
                        Text(old).strikethrough().foregroundStyle(.secondary)
                        Image(systemName: "arrow.right").imageScale(.small).foregroundStyle(.tertiary)
                        Text(new)
                    }
                    .font(.callout)
                    .lineLimit(1)
                }

            case .setCompleted(let item, let updates):
                let completing = updates.completed ?? false
                Text(item.title).fontWeight(.medium).strikethrough(completing)
                Text(completing ? "Mark as done" : "Reopen").font(.callout).foregroundStyle(.secondary)

            case .merge(let sources, let merged, let why, let confidence):
                HStack {
                    Text(merged.title).fontWeight(.medium)
                    Text("\(confidence)%")
                        .font(.caption.weight(.semibold).monospacedDigit())
                        .padding(.horizontal, 6).padding(.vertical, 1)
                        .background(Capsule().fill(confidence > 85 ? Color.green.opacity(0.2) : Color.secondary.opacity(0.15)))
                }
                Text("Combines " + sources.map { "“\($0.title)”" }.joined(separator: ", "))
                    .font(.callout).foregroundStyle(.secondary)
                if !why.isEmpty { Text(why).font(.caption).foregroundStyle(.tertiary) }
                MetadataLabels(item: merged)
            }
            HStack(spacing: 6) {
                if let reason = change.reason {
                    Text(reason.hasPrefix("From ") || reason.hasPrefix("These ") ? reason : "“\(reason)”")
                        .font(.caption).foregroundStyle(.tertiary).lineLimit(2)
                }
                if !change.isConfident {
                    Text("Not sure").font(.caption2.weight(.medium)).foregroundStyle(.orange)
                        .padding(.horizontal, 5).padding(.vertical, 1)
                        .background(Capsule().fill(Color.orange.opacity(0.15)))
                }
            }
        }
    }

    private static func fieldName(_ key: String) -> String {
        switch key {
        case "dueDate": "Due:"
        default: key.prefix(1).uppercased() + key.dropFirst() + ":"
        }
    }
}
