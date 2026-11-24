#if os(macOS)
import AppKit
#else
import UIKit
import UserNotifications
#endif

/// 25-minute focus session. On the Mac the remaining time is shown in the menu bar while a session is
/// active; on iOS a local notification announces the end, since the app may be in the background.
@Observable
final class FocusTimer {
    static let defaultDuration = 1500

    private(set) var isActive = false
    private(set) var isRunning = false
    private(set) var timeRemaining = FocusTimer.defaultDuration
    /// Length of the current session, in seconds.
    private(set) var duration = FocusTimer.defaultDuration
    /// When the running session ends; lets the dial move smoothly between the one-second ticks.
    private var deadline: Date?
    var notes = ""

    var isComplete: Bool { timeRemaining == 0 && !isRunning }
    var formattedTime: String { String(format: "%d:%02d", timeRemaining / 60, timeRemaining % 60) }

    private var timer: Timer?
    #if os(macOS)
    private var statusItem: NSStatusItem?
    #endif

    func start(duration: Int = FocusTimer.defaultDuration) {
        timeRemaining = duration
        self.duration = duration
        isActive = true
        showStatusItem()
        resume()
    }

    func pause() {
        timer?.invalidate()
        timer = nil
        deadline = nil
        isRunning = false
        updateStatusItem()
        cancelEndNotification()
    }

    func resume() {
        guard !isRunning, timeRemaining > 0 else { return }
        isRunning = true
        deadline = .now + TimeInterval(timeRemaining)
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
        updateStatusItem()
        scheduleEndNotification()
    }

    /// Ends the session and resets the timer.
    func end() {
        pause()
        timeRemaining = Self.defaultDuration
        isActive = false
        hideStatusItem()
    }

    /// Catches up after the app was suspended (iOS stops timers in the background).
    func refresh() {
        guard isRunning else { return }
        tick()
    }

    #if DEBUG
    /// Snapshot harness: jump to a given remaining time.
    func debugSetRemaining(_ seconds: Int) {
        timeRemaining = seconds
        if isRunning { deadline = .now + TimeInterval(seconds) }
    }
    #endif

    /// Remaining fraction of the session (1 → 0), continuous while running.
    func progress(at date: Date) -> Double {
        let remaining = deadline.map { max(0, $0.timeIntervalSince(date)) } ?? Double(timeRemaining)
        return duration > 0 ? min(1, remaining / Double(duration)) : 0
    }

    private func tick() {
        // Follow the deadline, so a late timer firing never makes the session run long.
        timeRemaining = deadline.map { max(0, Int($0.timeIntervalSinceNow.rounded())) } ?? max(0, timeRemaining - 1)
        if timeRemaining == 0 { pause() } else { updateStatusItem() }
    }

    #if os(macOS)
    private func showStatusItem() {
        guard statusItem == nil else { return }
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = item.button {
            button.image = NSImage(systemSymbolName: "timer", accessibilityDescription: "Focus Timer")
            button.imagePosition = .imageLeading
            button.toolTip = "Focus Timer"
            button.target = self
            button.action = #selector(showApp)
        }
        statusItem = item
    }

    private func hideStatusItem() {
        if let statusItem { NSStatusBar.system.removeStatusItem(statusItem) }
        statusItem = nil
    }

    /// Shows the countdown while running (paused or finished sessions show just the icon).
    private func updateStatusItem() {
        statusItem?.button?.title = isRunning && timeRemaining > 0 ? " \(formattedTime)" : ""
    }

    @objc private func showApp() {
        NSApp.activate()
        AppDelegate.showMainWindow()
    }

    private func scheduleEndNotification() {}
    private func cancelEndNotification() {}
    #else
    private func showStatusItem() { UIApplication.shared.isIdleTimerDisabled = true }
    private func hideStatusItem() { UIApplication.shared.isIdleTimerDisabled = false }
    private func updateStatusItem() {}

    private static let notificationID = "focus-session-end"

    /// Announces the end of the session even when the app is in the background.
    private func scheduleEndNotification() {
        let seconds = TimeInterval(timeRemaining)
        guard seconds > 0 else { return }
        Task {
            let center = UNUserNotificationCenter.current()
            guard (try? await center.requestAuthorization(options: [.alert, .sound])) == true else { return }
            let content = UNMutableNotificationContent()
            content.title = "Time’s up"
            content.body = "Great focus session! Note what’s next or start another one."
            content.sound = .default
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
            try? await center.add(UNNotificationRequest(identifier: Self.notificationID, content: content, trigger: trigger))
        }
    }

    private func cancelEndNotification() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [Self.notificationID])
    }
    #endif
}
