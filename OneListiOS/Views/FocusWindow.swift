import SwiftUI
import UIKit

/// Shows the focus session in its own window above the app. As an overlay inside the app's view tree
/// it fought the navigation bar (its glass buttons drew on top while it appeared) and forced the whole
/// app dark to get a light status bar; in a separate dark window it's isolated from both.
@MainActor
final class FocusWindow {
    private var window: UIWindow?
    private var hideWork: DispatchWorkItem?

    func show(store: AppStore, timer: FocusTimer) {
        hideWork?.cancel()
        guard window == nil,
              let scene = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first(where: { $0.activationState == .foregroundActive }) ??
                UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first
        else { return }
        let host = UIHostingController(rootView: FocusWindowRoot().environment(store).environment(timer))
        host.view.backgroundColor = .clear
        let window = UIWindow(windowScene: scene)
        // Exactly over the app's window (some screens report a scene size that differs from it).
        if let main = scene.windows.first(where: { $0.windowLevel == .normal }) { window.frame = main.frame }
        window.windowLevel = .normal + 1
        window.overrideUserInterfaceStyle = .dark
        window.backgroundColor = .clear
        window.rootViewController = host
        window.makeKeyAndVisible()
        self.window = window
    }

    /// Called when the session is minimized or ended; waits for the fade-out before removing the window.
    func hide() {
        guard window != nil else { return }
        hideWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, let window else { return }
            window.isHidden = true
            self.window = nil
            window.windowScene?.windows.first { $0 !== window && !$0.isHidden }?.makeKey()
        }
        hideWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + FocusWindowRoot.duration + 0.05, execute: work)
    }
}

/// Fades and scales the focus screen in when the window opens, and out when the session is minimized
/// or ended; the black backdrop fades without scaling, so nothing behind it peeks out at the edges.
private struct FocusWindowRoot: View {
    static let duration = 0.35

    @Environment(FocusTimer.self) private var timer
    @State private var appeared = false

    private var isShown: Bool { appeared && timer.isActive && !timer.isMinimized }

    var body: some View {
        ZStack {
            Color.clear
            if isShown {
                Color.black
                    .ignoresSafeArea()
                    .transition(.opacity)
                FocusView()
                    .transition(.opacity.combined(with: .scale(scale: 1.04))) // from slightly larger: no edges show
            }
        }
        .animation(.smooth(duration: Self.duration), value: isShown)
        // A new window gets its safe area a moment after its first layout; appearing before that lays the
        // screen out edge to edge and then jumps (black bars at the top and bottom). Wait for the insets.
        .onGeometryChange(for: Bool.self) { $0.safeAreaInsets.top > 0 } action: { ready in
            if ready && !appeared { appeared = true }
        }
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { appeared = true } // no insets (rare)
        }
    }
}
