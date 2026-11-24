import MetalKit
import SwiftUI

/// A shader-drawn orb (water or sand). Draws at a calm 30 fps while the timer runs and holds still
/// (drops and grains frozen mid-air) while it is paused.
#if os(macOS)
typealias PlatformViewRepresentable = NSViewRepresentable
#else
typealias PlatformViewRepresentable = UIViewRepresentable
#endif

struct OrbMetalView: PlatformViewRepresentable {
    enum Kind {
        case water, sand

        /// Compiled on first use; nil if Metal is unavailable or the shader fails to compile.
        var renderer: OrbRenderer? {
            switch self {
            case .water: OrbMetalView.waterRenderer
            case .sand: OrbMetalView.sandRenderer
            }
        }

        /// The shader's fill parameter for a share of the sphere's volume.
        func level(forVolume v: Double) -> Float {
            switch self {
            case .water: Float(OrbRenderer.waterLevel(forVolume: v))
            case .sand: Float(SandOrbShader.peak(forVolume: v))
            }
        }
    }

    let kind: Kind
    let timer: FocusTimer
    let animate: Bool

    private static let waterRenderer = OrbRenderer(source: WaterOrbShader.source)
    private static let sandRenderer = OrbRenderer(source: SandOrbShader.source)

    /// The view is this much larger than the orb, so its anti-aliased edge isn't clipped.
    static let margin: CGFloat = 4

    func makeCoordinator() -> Coordinator { Coordinator(kind: kind, timer: timer) }

    #if os(macOS)
    func makeNSView(context: Context) -> MTKView { makeView(context: context) }
    func updateNSView(_ view: MTKView, context: Context) { updateView(view, context: context) }
    #else
    func makeUIView(context: Context) -> MTKView { makeView(context: context) }
    func updateUIView(_ view: MTKView, context: Context) { updateView(view, context: context) }
    #endif

    private func makeView(context: Context) -> MTKView {
        let view = MTKView(frame: .zero, device: kind.renderer?.device)
        view.delegate = context.coordinator
        view.colorPixelFormat = .bgra8Unorm
        view.clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
        #if os(macOS)
        view.layer?.isOpaque = false
        #else
        view.isOpaque = false
        view.backgroundColor = .clear
        #endif
        view.preferredFramesPerSecond = 30
        view.enableSetNeedsDisplay = false
        view.isPaused = !animate
        return view
    }

    private func updateView(_ view: MTKView, context: Context) {
        context.coordinator.timer = timer
        context.coordinator.animate = animate
        view.isPaused = !animate
        if !animate { view.draw() } // show the current state once
    }

    final class Coordinator: NSObject, MTKViewDelegate {
        let kind: Kind
        var timer: FocusTimer
        var animate = true
        /// Animation clock: only advances while animating, so pausing freezes the scene.
        private var clock: Double = 4.2
        private var lastFrame: CFTimeInterval?
        /// The pile/level only changes slowly; recomputed when the fill share moves noticeably.
        private var cachedVolume = -1.0
        private var cachedLevel: Float = 0

        init(kind: Kind, timer: FocusTimer) {
            self.kind = kind
            self.timer = timer
        }

        func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

        func draw(in view: MTKView) {
            let now = CACurrentMediaTime()
            if animate, let lastFrame { clock += min(now - lastFrame, 0.1) }
            lastFrame = animate ? now : nil
            guard let renderer = kind.renderer, let drawable = view.currentDrawable else { return }
            let volume = 1 - timer.progress(at: .now)
            if abs(volume - cachedVolume) > 0.0005 {
                cachedVolume = volume
                cachedLevel = kind.level(forVolume: volume)
            }
            let size = view.drawableSize
            let uniforms = OrbUniforms(
                resolution: SIMD2(Float(size.width), Float(size.height)),
                time: Float(clock),
                level: cachedLevel,
                extent: Float((FocusTimerDisplay.dialSize + 2 * OrbMetalView.margin) / FocusTimerDisplay.dialSize),
                pitch: 0.28)
            guard let buffer = renderer.render(to: drawable.texture, uniforms: uniforms) else { return }
            buffer.present(drawable)
            buffer.commit()
        }
    }
}
