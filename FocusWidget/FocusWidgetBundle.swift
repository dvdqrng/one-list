import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

@main
struct FocusWidgetBundle: WidgetBundle {
    var body: some Widget {
        FocusLiveActivity()
    }
}

/// The focus session on the Lock Screen and in the Dynamic Island, in the app's focus look: dark, the
/// accent ring, rounded light digits, one task, and the two session controls.
struct FocusLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusActivityAttributes.self) { context in
            LockScreenFocusView(state: context.state, isStale: context.isStale)
                .activityBackgroundTint(Color.black.opacity(0.8))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let state = context.state
            let finished = state.isFinished || context.isStale
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    FocusRing(state: state, finished: finished)
                        .frame(width: 44, height: 44)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Countdown(state: state, finished: finished)
                        .font(.system(size: 34, weight: .light, design: .rounded))
                        .frame(maxWidth: 120, alignment: .trailing)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    TaskLabel(state: state, finished: finished)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if !finished { FocusControls(state: state).padding(.top, 4) }
                }
            } compactLeading: {
                FocusRing(state: state, finished: finished, lineWidth: 3)
                    .frame(width: 18, height: 18)
            } compactTrailing: {
                Countdown(state: state, finished: finished)
                    .font(.system(size: 15, weight: .medium, design: .rounded))
                    .frame(width: 48, alignment: .trailing)
            } minimal: {
                FocusRing(state: state, finished: finished, lineWidth: 3)
                    .frame(width: 18, height: 18)
            }
            .keylineTint(.accentColor)
        }
    }
}

// MARK: - Lock Screen

private struct LockScreenFocusView: View {
    let state: FocusActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        let finished = state.isFinished || isStale
        HStack(alignment: .center, spacing: 16) {
            FocusRing(state: state, finished: finished)
                .frame(width: 52, height: 52)
            VStack(alignment: .leading, spacing: 4) {
                Countdown(state: state, finished: finished)
                    .font(.system(size: 34, weight: .light, design: .rounded))
                TaskLabel(state: state, finished: finished, alignment: .leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if !finished { FocusControls(state: state, compact: true) }
        }
        .padding(16)
        .foregroundStyle(.white)
    }
}

// MARK: - Pieces

/// Remaining time as a ring, like the app's dial: counts down by itself while running.
private struct FocusRing: View {
    let state: FocusActivityAttributes.ContentState
    let finished: Bool
    var lineWidth: CGFloat = 5

    var body: some View {
        ZStack {
            if finished {
                Image(systemName: "checkmark")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.green)
                Circle().stroke(Color.green, lineWidth: lineWidth)
            } else if let start = state.rangeStart, let end = state.endDate, end > .now {
                ProgressView(timerInterval: start...end, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                    .progressViewStyle(.circular)
                    .tint(.accentColor)
            } else {
                Circle().stroke(Color.white.opacity(0.2), lineWidth: lineWidth)
                Circle()
                    .trim(from: 0, to: state.duration > 0 ? Double(state.remaining) / Double(state.duration) : 0)
                    .stroke(Color.accentColor, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Image(systemName: "pause.fill")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct Countdown: View {
    let state: FocusActivityAttributes.ContentState
    let finished: Bool

    var body: some View {
        Group {
            if finished {
                Text("Done")
            } else if let end = state.endDate, end > .now {
                Text(timerInterval: Date.now...end, countsDown: true)
            } else {
                Text(state.formattedRemaining)
            }
        }
        .monospacedDigit()
        .multilineTextAlignment(.trailing)
        .foregroundStyle(finished ? Color.green : Color.white)
    }
}

private struct TaskLabel: View {
    let state: FocusActivityAttributes.ContentState
    let finished: Bool
    var alignment: TextAlignment = .center

    var body: some View {
        Group {
            if finished {
                Text("Time’s up — great focus session!")
            } else if let task = state.task {
                Text(task) + Text(state.openTasks > 1 ? "  +\(state.openTasks - 1)" : "").foregroundStyle(.secondary)
            } else {
                Text(state.isRunning ? "Focusing" : "Paused")
            }
        }
        .font(.system(size: 15, weight: .medium))
        .foregroundStyle(.white.opacity(0.85))
        .lineLimit(1)
        .multilineTextAlignment(alignment)
    }
}

/// Pause / resume and +5 min, run by the app through App Intents.
private struct FocusControls: View {
    let state: FocusActivityAttributes.ContentState
    var compact = false

    var body: some View {
        HStack(spacing: compact ? 8 : 12) {
            Button(intent: ExtendFocusIntent()) {
                Text("+5")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Color.white.opacity(0.15)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Add 5 Minutes")

            Button(intent: ToggleFocusIntent()) {
                Image(systemName: state.isRunning ? "pause.fill" : "play.fill")
                    .font(.system(size: 17, weight: .semibold))
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Color.accentColor))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(state.isRunning ? "Pause" : "Resume")
        }
        .foregroundStyle(.white)
        .frame(maxWidth: compact ? nil : .infinity, alignment: compact ? .trailing : .center)
    }
}
