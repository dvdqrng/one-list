import Metal
import simd

/// Per-frame values shared with the shader (layout matches `Uniforms` in the Metal source).
struct OrbUniforms {
    var resolution: SIMD2<Float>
    /// Animation clock in seconds (stops while the timer is paused).
    var time: Float
    /// Fill state: the water's height share for water, the pile's peak height for sand.
    var level: Float
    /// Half the visible width, in sphere radii (room around the orb).
    var extent: Float
    /// How far the view looks down onto the water, in radians.
    var pitch: Float
}

/// Renders one of the shader-drawn orbs (water, sand) as a full-screen fragment shader.
///
/// The shader source is compiled when the app runs (with the system's Metal compiler), so building the
/// app needs no separate Metal toolchain.
final class OrbRenderer {
    let device: MTLDevice
    private let pipeline: MTLRenderPipelineState
    private let queue: MTLCommandQueue

    init?(source: String, device: MTLDevice? = MTLCreateSystemDefaultDevice(), pixelFormat: MTLPixelFormat = .bgra8Unorm) {
        guard let device, let queue = device.makeCommandQueue(),
              let library = try? device.makeLibrary(source: source, options: nil),
              let vertex = library.makeFunction(name: "orbVertex"),
              let fragment = library.makeFunction(name: "orbFragment") else { return nil }
        let descriptor = MTLRenderPipelineDescriptor()
        descriptor.vertexFunction = vertex
        descriptor.fragmentFunction = fragment
        descriptor.colorAttachments[0].pixelFormat = pixelFormat
        guard let pipeline = try? device.makeRenderPipelineState(descriptor: descriptor) else { return nil }
        self.device = device
        self.queue = queue
        self.pipeline = pipeline
    }

    /// Draws one frame into `texture` (cleared to transparent) and returns the command buffer, uncommitted.
    func render(to texture: MTLTexture, uniforms: OrbUniforms) -> MTLCommandBuffer? {
        let pass = MTLRenderPassDescriptor()
        pass.colorAttachments[0].texture = texture
        pass.colorAttachments[0].loadAction = .clear
        pass.colorAttachments[0].clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
        pass.colorAttachments[0].storeAction = .store
        guard let buffer = queue.makeCommandBuffer(),
              let encoder = buffer.makeRenderCommandEncoder(descriptor: pass) else { return nil }
        var uniforms = uniforms
        encoder.setRenderPipelineState(pipeline)
        encoder.setFragmentBytes(&uniforms, length: MemoryLayout<OrbUniforms>.stride, index: 0)
        encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        encoder.endEncoding()
        return buffer
    }

    /// Water: fill height (share of the diameter) for a share of the sphere's volume: solves V = h²(3 − 2h).
    static func waterLevel(forVolume v: Double) -> Double {
        guard v > 0 else { return 0 }
        guard v < 1 else { return 1 }
        var lo = 0.0, hi = 1.0
        for _ in 0..<30 {
            let h = (lo + hi) / 2
            if h * h * (3 - 2 * h) < v { lo = h } else { hi = h }
        }
        return (lo + hi) / 2
    }

    // MARK: - Shared shader code

    nonisolated static let common = #"""
    #include <metal_stdlib>
    using namespace metal;

    struct Uniforms {
        float2 resolution;
        float time;
        float level;
        float extent;
        float pitch;
    };

    struct VOut {
        float4 position [[position]];
        float2 uv;
    };

    // One triangle covering the screen; uv is in clip space (y up).
    vertex VOut orbVertex(uint vid [[vertex_id]]) {
        float2 p = float2((vid << 1) & 2, vid & 2);
        VOut o;
        o.position = float4(p * 2.0 - 1.0, 0.0, 1.0);
        o.uv = p * 2.0 - 1.0;
        return o;
    }

    constant float R_OUT = 1.0;
    constant float R_IN = 0.965;      // inner surface of the glass
    constant float3 LIGHT = float3(-0.45, 0.78, -0.43);  // key light, front left
    constant float3 BACKLIGHT = float3(0.25, 0.55, 0.8);  // a window behind the orb, for glints on the water

    float hash11(float n) { return fract(sin(n * 127.1 + 11.3) * 43758.5453); }

    // MARK: Helpers

    bool hitSphere(float3 o, float3 d, float3 c, float r, thread float &t0, thread float &t1) {
        float3 oc = o - c;
        float b = dot(oc, d);
        float h = b * b - (dot(oc, oc) - r * r);
        if (h < 0.0) return false;
        h = sqrt(h);
        t0 = -b - h;
        t1 = -b + h;
        return true;
    }

    // Ray against an axis-aligned ellipsoid; returns the entry distance and normal.
    bool hitEllipsoid(float3 o, float3 d, float3 c, float3 s, thread float &t, thread float3 &n) {
        float3 oo = (o - c) / s;
        float3 dd = d / s;
        float a = dot(dd, dd);
        float b = dot(oo, dd);
        float h = b * b - a * (dot(oo, oo) - 1.0);
        if (h < 0.0) return false;
        t = (-b - sqrt(h)) / a;
        if (t < 0.0) return false;
        float3 p = o + d * t;
        n = normalize((p - c) / (s * s));
        return true;
    }

    """#
}
