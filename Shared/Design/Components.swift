import SwiftUI

// MARK: - Three-state checkbox (open → in progress → done)

struct StatusCheckbox: View {
    enum State { case unchecked, inProgress, checked }
    let state: State
    let action: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle().strokeBorder(tint, lineWidth: 1.25)
                // One fill that sweeps from nothing, to the left half (in progress), to the full circle (done).
                Pie(progress: progress, radius: state == .checked ? 0.5 : 0.25)
                    .fill(tint)
                CheckmarkShape()
                    .trim(from: 0, to: state == .checked ? 1 : 0)
                    .stroke(.white, style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
                    .frame(width: 8, height: 8)
            }
            .frame(width: Metrics.checkbox, height: Metrics.checkbox)
            .contentShape(Circle())
            .animation(reduceMotion ? nil : .spring(duration: 0.3, bounce: 0.15), value: state)
            .keyframeAnimator(initialValue: 1.0, trigger: state) { content, scale in
                content.scaleEffect(reduceMotion ? 1 : scale)
            } keyframes: { _ in
                KeyframeTrack {
                    CubicKeyframe(0.82, duration: 0.08)
                    SpringKeyframe(1.0, duration: 0.3, spring: .bouncy(duration: 0.3, extraBounce: 0.1))
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(state == .checked ? "Done" : state == .inProgress ? "In progress" : "Not done")
    }

    private var tint: Color {
        switch state {
        case .unchecked: Color.secondary.opacity(0.55)
        case .inProgress: .orange
        case .checked: Color.accentColor.opacity(0.85)
        }
    }

    private var progress: Double {
        switch state {
        case .unchecked: 0
        case .inProgress: 0.5
        case .checked: 1
        }
    }

    /// A pie slice sweeping from the bottom through the left side; `radius` is a fraction of the width.
    nonisolated private struct Pie: Shape {
        var progress: Double
        var radius: Double

        var animatableData: AnimatablePair<Double, Double> {
            get { AnimatablePair(progress, radius) }
            set { progress = newValue.first; radius = newValue.second }
        }

        func path(in rect: CGRect) -> Path {
            var p = Path()
            guard progress > 0.001 else { return p }
            let center = CGPoint(x: rect.midX, y: rect.midY)
            if progress >= 0.999 {
                p.addEllipse(in: CGRect(x: center.x - rect.width * radius, y: center.y - rect.width * radius,
                                        width: rect.width * radius * 2, height: rect.width * radius * 2))
                return p
            }
            p.move(to: center)
            p.addArc(center: center, radius: rect.width * radius, startAngle: .degrees(90),
                     endAngle: .degrees(90 + 360 * progress), clockwise: false)
            p.closeSubpath()
            return p
        }
    }

    /// A checkmark drawn as one stroke, so it can be drawn in with `trim`.
    nonisolated private struct CheckmarkShape: Shape {
        func path(in rect: CGRect) -> Path {
            var p = Path()
            p.move(to: CGPoint(x: rect.minX, y: rect.minY + rect.height * 0.55))
            p.addLine(to: CGPoint(x: rect.minX + rect.width * 0.36, y: rect.maxY - rect.height * 0.08))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + rect.height * 0.1))
            return p
        }
    }
}

extension StatusCheckbox.State {
    init(_ item: Item) {
        self = item.completed || item.status == .done ? .checked : item.status == .inProgress ? .inProgress : .unchecked
    }

    /// Click cycles open → in progress → done → open.
    var next: TodoStatus {
        switch self {
        case .unchecked: .inProgress
        case .inProgress: .done
        case .checked: .due
        }
    }
}

// MARK: - Metadata (priority, due date, category), shown like Reminders: small secondary labels

struct MetadataLabels: View {
    let item: Item
    var exclude: Set<String> = []

    var body: some View {
        let priority = exclude.contains("priority") ? nil : item.priority
        let due = exclude.contains("dueDate") ? nil : item.dueDate
        let category = exclude.contains("category") ? nil : item.category
        if priority != nil || due != nil || category != nil {
            HStack(spacing: 12) {
                if let priority {
                    Label(priority.title, systemImage: "flag.fill")
                        .foregroundStyle(priority.color)
                }
                if let due {
                    let overdue = DueDate.category(for: item) == .overdue && !item.completed
                    Label(DueDate.format(due), systemImage: "calendar")
                        .foregroundStyle(overdue ? Color.red : Color.secondary)
                }
                if let category {
                    Label(category, systemImage: "tag")
                        .foregroundStyle(.secondary)
                }
            }
            .font(.system(size: Metrics.labelFont))
            .labelStyle(CompactLabelStyle())
            .lineLimit(1)
            .fixedSize()
        }
    }
}

/// Icon + title with a tight gap.
struct CompactLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 3) {
            configuration.icon.imageScale(.small)
            configuration.title
        }
    }
}

// MARK: - Feedback toast

enum FeedbackKind { case error, warning }

struct FeedbackToast: View {
    let kind: FeedbackKind
    let message: String

    var body: some View {
        Label(message, systemImage: kind == .error ? "exclamationmark.circle.fill" : "exclamationmark.triangle.fill")
            .font(.callout)
            .foregroundStyle(kind == .error ? Color.red : Color.orange)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .glassOrMaterial(in: Capsule())
    }
}

// MARK: - Liquid Glass where available (macOS 26 / iOS 26), regular material before

extension View {
    @ViewBuilder
    func glassOrMaterial<S: Shape>(in shape: S) -> some View {
        if #available(macOS 26, iOS 26, *) {
            glassEffect(.regular, in: shape)
        } else {
            background(.regularMaterial, in: shape)
                .overlay(shape.stroke(Color.hairline.opacity(0.5), lineWidth: 0.5))
                .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
        }
    }
}

// MARK: - Animations

/// Gentle opacity pulse (recording, timer finished).
struct Pulse: ViewModifier {
    var active = true
    @State private var dim = false

    func body(content: Content) -> some View {
        content
            .opacity(active && dim ? 0.55 : 1)
            .animation(active ? .easeInOut(duration: 0.9).repeatForever() : .default, value: dim)
            .onAppear { dim = true }
    }
}

// MARK: - Section label

/// Small uppercase label above a group, as in macOS sidebars and iOS grouped lists.
struct SectionLabel: View {
    let title: String
    init(_ title: String) { self.title = title }

    var body: some View {
        Text(title.uppercased())
            .font(.system(size: Metrics.labelFont, weight: .semibold))
            .tracking(0.6)
            .foregroundStyle(.secondary)
            .padding(.leading, Metrics.rowPadding)
    }
}

// MARK: - Floating buttons

/// A round (or pill) button floating on Liquid Glass — focus controls, the minimized focus pill and other
/// buttons that hover over content. `prominent` tints it with the accent: the one main action on screen.
struct FloatingButtonStyle: ButtonStyle {
    var prominent = false
    var size: CGFloat = 52
    /// Pill instead of circle (for labels with text).
    var pill = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: size * 0.36, weight: .semibold))
            .foregroundStyle(prominent ? Color.white : Color.primary)
            .frame(minWidth: size, minHeight: size)
            .padding(.horizontal, pill ? size * 0.36 : 0)
            .background {
                if prominent {
                    Capsule().fill(Color.accentColor)
                }
            }
            .glassOrMaterial(in: Capsule())
            .contentShape(Capsule())
            .scaleEffect(configuration.isPressed ? 0.92 : 1)
            .animation(.snappy(duration: 0.18), value: configuration.isPressed)
    }
}
