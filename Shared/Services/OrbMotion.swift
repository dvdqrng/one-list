import Foundation
#if os(iOS)
import CoreMotion
#endif

/// Which way is down, for the shader orbs: the water and the sand stay level with real gravity while the
/// phone tilts. One motion stream shared by all orbs on screen, running only while one is visible.
/// On the Mac (no motion sensors) gravity is always straight down.
@MainActor
final class OrbMotion {
    static let shared = OrbMotion()

    /// Gravity in device coordinates (x right, y up, z out of the screen), length ≈ 1.
    private(set) var gravity = SIMD3<Double>(0, -1, 0)
    private var users = 0

    #if os(iOS)
    private let manager = CMMotionManager()
    #endif

    func start() {
        users += 1
        #if os(iOS)
        guard users == 1, manager.isDeviceMotionAvailable else { return }
        manager.deviceMotionUpdateInterval = 1.0 / 60
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let g = motion?.gravity else { return }
            MainActor.assumeIsolated { self?.gravity = SIMD3(g.x, g.y, g.z) }
        }
        #endif
    }

    func stop() {
        users = max(0, users - 1)
        #if os(iOS)
        if users == 0 { manager.stopDeviceMotionUpdates() }
        #endif
        if users == 0 { gravity = SIMD3(0, -1, 0) }
    }
}

/// The orb's tilt, following gravity through a spring: water sloshes past and settles, sand slides slowly
/// without bouncing.
struct OrbTilt {
    /// Rotation of the scene on screen (radians) that keeps the surface level with real gravity.
    private(set) var roll = 0.0
    /// Extra camera pitch (radians): tilting the phone back shows more of the surface.
    private(set) var pitch = 0.0
    private var rollVelocity = 0.0
    private var pitchVelocity = 0.0
    /// The angle the phone is held at, adapting slowly, so only tilting *away* from it changes the view.
    private var restTilt: Double?

    let stiffness: Double
    let damping: Double

    static let water = OrbTilt(stiffness: 70, damping: 5.5)
    static let sand = OrbTilt(stiffness: 18, damping: 11)

    init(stiffness: Double, damping: Double) {
        self.stiffness = stiffness
        self.damping = damping
    }

    mutating func step(gravity g: SIMD3<Double>, dt: Double) {
        let dt = min(max(dt, 0), 1.0 / 20)

        // Roll: the angle that maps the scene's "down" onto gravity's direction on screen. Undefined when the
        // phone lies flat, so it then keeps its last value.
        var targetRoll = roll
        if g.x * g.x + g.y * g.y > 0.06 {
            targetRoll = -(atan2(g.y, g.x) + .pi / 2)
            // Take the short way round.
            let diff = remainder(targetRoll - roll, 2 * .pi)
            targetRoll = roll + diff
        }

        // Pitch: how far the screen faces up (0 upright, π/2 flat on a table), relative to the resting angle.
        let tilt = asin(max(-1, min(1, -g.z)))
        let rest = restTilt ?? tilt
        restTilt = rest + (tilt - rest) * min(1, dt / 2.5)
        let targetPitch = max(-0.25, min(0.9, (tilt - rest) * 0.8))

        let rollAccel = stiffness * (targetRoll - roll) - damping * rollVelocity
        rollVelocity += rollAccel * dt
        roll += rollVelocity * dt
        roll = remainder(roll, 2 * .pi)

        let pitchAccel = stiffness * (targetPitch - pitch) - damping * pitchVelocity
        pitchVelocity += pitchAccel * dt
        pitch += pitchVelocity * dt
    }
}
