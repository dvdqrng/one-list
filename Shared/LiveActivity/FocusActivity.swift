#if os(iOS)
import ActivityKit
import AppIntents
import Foundation

/// The focus session on the Lock Screen and in the Dynamic Island. Shared by the app (which starts and
/// updates the activity) and the widget extension (which draws it).
nonisolated struct FocusActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// When the running session ends; nil while paused or finished.
        var endDate: Date?
        /// Seconds left (paused / finished state; the system counts down by itself while running).
        var remaining: Int
        /// Total length of the session in seconds.
        var duration: Int
        /// The first open "Now" task.
        var task: String?
        var openTasks: Int

        var isRunning: Bool { endDate != nil }
        var isFinished: Bool { endDate == nil && remaining == 0 }
        /// Start of the countdown range for progress views (accounts for pauses and +5 min).
        var rangeStart: Date? { endDate.map { $0.addingTimeInterval(-Double(duration)) } }

        var formattedRemaining: String { String(format: "%d:%02d", remaining / 60, remaining % 60) }
    }
}

/// Bridges the Live Activity buttons to the running app. Intents run in the app's process; the app sets
/// these handlers at launch (the widget extension never calls them).
@MainActor
enum FocusControl {
    static var togglePause: (() -> Void)?
    static var addFiveMinutes: (() -> Void)?
}

nonisolated struct ToggleFocusIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Pause or Resume Focus"
    init() {}

    func perform() async throws -> some IntentResult {
        await MainActor.run { FocusControl.togglePause?() }
        return .result()
    }
}

nonisolated struct ExtendFocusIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Add 5 Minutes to Focus"
    init() {}

    func perform() async throws -> some IntentResult {
        await MainActor.run { FocusControl.addFiveMinutes?() }
        return .result()
    }
}
#endif
