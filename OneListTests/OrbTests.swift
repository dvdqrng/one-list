import Foundation
import Testing
@testable import One_List

/// The orb shaders are compiled from source at runtime; a mistake would silently fall back to the drawn orb.
@MainActor
struct OrbTests {
    @Test func shadersCompile() {
        #expect(OrbRenderer(source: WaterOrbShader.source) != nil)
        #expect(OrbRenderer(source: SandOrbShader.source) != nil)
    }

    @Test func uniformsMatchShaderLayout() {
        // float2 + 5 floats, padded to the float2 alignment.
        #expect(MemoryLayout<OrbUniforms>.stride == 32)
    }

    @Test func upright() {
        var tilt = OrbTilt.water
        for _ in 0..<240 { tilt.step(gravity: SIMD3(0, -1, 0), dt: 1.0 / 60) }
        #expect(abs(tilt.roll) < 0.01)
        #expect(abs(tilt.pitch) < 0.01)
    }

    @Test func surfaceFollowsGravityWhenRolled() {
        // Phone turned 90° counter-clockwise (top to the left): gravity points along the device's -x.
        var tilt = OrbTilt.water
        for _ in 0..<600 { tilt.step(gravity: SIMD3(-1, 0, 0), dt: 1.0 / 60) }
        #expect(abs(tilt.roll - .pi / 2) < 0.02)
    }

    @Test func waterOvershootsSandDoesNot() {
        var water = OrbTilt.water, sand = OrbTilt.sand
        var waterMax = 0.0, sandMax = 0.0
        let g = SIMD3(sin(0.5), -cos(0.5), 0.0) // rolled by 0.5 rad
        for _ in 0..<600 {
            water.step(gravity: g, dt: 1.0 / 60)
            sand.step(gravity: g, dt: 1.0 / 60)
            waterMax = max(waterMax, abs(water.roll))
            sandMax = max(sandMax, abs(sand.roll))
        }
        #expect(waterMax > 0.52) // sloshes past
        #expect(sandMax < 0.505) // creeps over
        #expect(abs(abs(water.roll) - 0.5) < 0.01)
    }
}
