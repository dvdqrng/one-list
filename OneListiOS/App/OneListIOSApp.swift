import SwiftUI
import UserNotifications

@main
struct OneListIOSApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var store: AppStore
    @State private var timer: FocusTimer

    init() {
        let store = AppStore()
        _store = State(initialValue: store)
        _timer = State(initialValue: FocusTimer())
        AppDelegate.sync = store.sync
    }

    var body: some Scene {
        WindowGroup {
            MainView()
                .environment(store)
                .environment(timer)
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    /// Set by the app; a silent push from iCloud means another device changed the list.
    static var sync: CloudSync?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        // Lets iCloud wake the app with silent pushes when another device saves a change.
        application.registerForRemoteNotifications()
        return true
    }

    func application(_ application: UIApplication,
                     didReceiveRemoteNotification userInfo: [AnyHashable: Any]) async -> UIBackgroundFetchResult {
        guard let sync = Self.sync else { return .noData }
        await sync.syncNow()
        return .newData
    }

    /// Show the "Time's up" banner even while the app is open.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification)
        async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}
