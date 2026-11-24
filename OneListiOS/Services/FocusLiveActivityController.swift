import ActivityKit
import Foundation

/// Keeps the focus session's Live Activity in step with the timer: started with the session, updated on
/// pause / resume / +5 min / finish, ended with the session. The countdown itself runs in the system.
final class FocusLiveActivityController {
    private let timer: FocusTimer
    private let store: AppStore
    /// Only the id is kept: `Activity` isn't Sendable, so each update looks it up off the main actor.
    private var activityID: String?

    init(timer: FocusTimer, store: AppStore) {
        self.timer = timer
        self.store = store
        // An activity left over from a previous launch (the app was quit mid-session) has no timer behind it.
        let leftovers = Set(Activity<FocusActivityAttributes>.activities.map(\.id))
        Task.detached { await Self.end(leftovers) }
        timer.onChange = { [weak self] in self?.update() }
        FocusControl.togglePause = { [weak timer] in
            guard let timer, timer.isActive else { return }
            if timer.isRunning { timer.pause() } else { timer.resume() }
        }
        FocusControl.addFiveMinutes = { [weak timer] in
            guard let timer, timer.isActive else { return }
            timer.extend(by: 300)
        }
    }

    /// Also call when the "Now" tasks change, so the activity shows the current task.
    func update() {
        guard timer.isActive else {
            end()
            return
        }
        let open = store.focusTasks.filter { !$0.completed }
        let state = FocusActivityAttributes.ContentState(
            endDate: timer.isRunning ? timer.endDate : nil,
            remaining: timer.timeRemaining,
            duration: timer.duration,
            task: open.first.map { $0.title.isEmpty ? "Untitled" : $0.title },
            openTasks: open.count)
        // Past the end the system shows the finished state even if the app is suspended.
        let content = ActivityContent(state: state, staleDate: timer.isRunning ? timer.endDate : nil,
                                      relevanceScore: 100)
        if let id = activityID {
            Task.detached { await Self.update(id, content) }
        } else if ActivityAuthorizationInfo().areActivitiesEnabled {
            activityID = (try? Activity.request(attributes: FocusActivityAttributes(), content: content))?.id
        }
    }

    private func end() {
        guard let id = activityID else { return }
        activityID = nil
        Task.detached { await Self.end([id]) }
    }

    nonisolated private static func update(_ id: String,
                                           _ content: ActivityContent<FocusActivityAttributes.ContentState>) async {
        for activity in Activity<FocusActivityAttributes>.activities where activity.id == id {
            await activity.update(content)
        }
    }

    nonisolated private static func end(_ ids: Set<String>) async {
        for activity in Activity<FocusActivityAttributes>.activities where ids.contains(activity.id) {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}
