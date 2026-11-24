import SwiftUI

/// How focus mode shows the remaining time.
enum FocusTimerStyle: String, CaseIterable, Identifiable {
    case digits, pie, pieWithTime, orb, water, sand
    var id: String { rawValue }

    var title: String {
        switch self {
        case .digits: "Numbers"
        case .pie: "Dial"
        case .pieWithTime: "Dial with Time"
        case .orb: "Glass Orb"
        case .water: "Water Orb"
        case .sand: "Sand Orb"
        }
    }

    var symbol: String {
        switch self {
        case .digits: "textformat.123"
        case .pie: "circle.lefthalf.filled"
        case .pieWithTime: "clock"
        case .orb: "flame"
        case .water: "drop"
        case .sand: "hourglass"
        }
    }
}

/// The focus timer in the chosen style.
struct FocusTimerDisplay: View {
    @Environment(FocusTimer.self) private var timer
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let style: FocusTimerStyle

    var body: some View {
        switch style {
        case .digits:
            Text(timer.formattedTime)
                .font(.system(size: Self.dialSize * 0.44, weight: .light, design: .rounded)) // 88 on the Mac
                .monospacedDigit()
                .foregroundStyle(timer.isComplete ? Color.green : Color.accentColor)
                .contentTransition(.numericText(countsDown: true))
                .animation(.snappy, value: timer.timeRemaining)
                .frame(height: Self.dialSize, alignment: .center)
        case .pie, .pieWithTime:
            VStack(spacing: 12) {
                // Redrawn only while running, at a calm rate.
                TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !timer.isRunning || reduceMotion)) { context in
                    let progress = timer.progress(at: context.date)
                    ZStack {
                        // The candle burns behind the glass…
                        CandleDial(progress: progress, time: context.date.timeIntervalSinceReferenceDate)
                            .frame(width: Self.dialSize + 2 * CandleDial.bleed, height: Self.dialSize + 2 * CandleDial.bleed)
                        // …and the time left is a pane of Liquid Glass in front of it.
                        GlassWedge(progress: progress)
                            .frame(width: Self.dialSize, height: Self.dialSize)
                    }
                }
                .frame(width: Self.dialSize + 2 * CandleDial.bleed, height: Self.dialSize + 2 * CandleDial.bleed)
                .padding(-CandleDial.bleed) // the glow may spill out without taking up layout space

                if style == .pieWithTime {
                    Text(timer.formattedTime)
                        .font(.system(size: 20, weight: .regular, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                        .contentTransition(.numericText(countsDown: true))
                        .animation(.snappy, value: timer.timeRemaining)
                }
            }
            .frame(height: Self.dialSize + (style == .pieWithTime ? 36 : 0))
            .accessibilityElement()
            .accessibilityLabel("\(timer.formattedTime) remaining")
        case .water where OrbMetalView.Kind.water.renderer != nil:
            shaderOrb(.water, glow: Color(red: 0.35, green: 0.72, blue: 0.92))
        case .sand where OrbMetalView.Kind.sand.renderer != nil:
            shaderOrb(.sand, glow: Color(red: 0.95, green: 0.75, blue: 0.45))
        case .sand:
            // Without Metal: the sand orb isn't available; show the drawn water orb instead.
            TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !timer.isRunning || reduceMotion)) { context in
                WaterOrb(filled: 1 - timer.progress(at: context.date), time: context.date.timeIntervalSinceReferenceDate)
            }
            .frame(width: Self.dialSize + 2 * CandleDial.bleed, height: Self.dialSize + 2 * CandleDial.bleed)
            .padding(-CandleDial.bleed)
            .frame(height: Self.dialSize)
        case .orb, .water:
            TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !timer.isRunning || reduceMotion)) { context in
                let filled = 1 - timer.progress(at: context.date)
                let time = context.date.timeIntervalSinceReferenceDate
                if style == .orb {
                    GlassOrb(filled: filled, time: time)
                } else {
                    WaterOrb(filled: filled, time: time)
                }
            }
            .frame(width: Self.dialSize + 2 * CandleDial.bleed, height: Self.dialSize + 2 * CandleDial.bleed)
            .padding(-CandleDial.bleed)
            .frame(height: Self.dialSize)
            .accessibilityElement()
            .accessibilityLabel("\(timer.formattedTime) remaining")
        }
    }

    #if os(iOS)
    /// The orb is the focus screen's centerpiece on a phone.
    static let dialSize: CGFloat = 264
    #else
    static let dialSize: CGFloat = 200
    #endif

    /// A shader-drawn orb under the glass shell, with a soft glow pooling beneath it as it fills.
    private func shaderOrb(_ kind: OrbMetalView.Kind, glow: Color) -> some View {
        ZStack {
            Ellipse()
                .fill(glow.opacity(0.16 * (1 - timer.progress(at: .now))))
                .frame(width: Self.dialSize * 0.7, height: Self.dialSize * 0.12)
                .blur(radius: 22)
                .offset(y: Self.dialSize * 0.56)
            OrbMetalView(kind: kind, timer: timer, animate: timer.isRunning && !reduceMotion)
                .frame(width: Self.dialSize + 2 * OrbMetalView.margin, height: Self.dialSize + 2 * OrbMetalView.margin)
            GlassShell()
                .frame(width: Self.dialSize + 2 * CandleDial.bleed, height: Self.dialSize + 2 * CandleDial.bleed)
        }
        .frame(width: Self.dialSize, height: Self.dialSize)
        .accessibilityElement()
        .accessibilityLabel("\(timer.formattedTime) remaining")
    }
}

/// The remaining time as a wedge of warm candlelight that shrinks clockwise towards twelve o'clock. The
/// light drifts and flickers slowly, like a flame in still air; the spent part of the dial keeps a faint
/// ember glow, so the whole circle stays readable without any outline.
fileprivate struct CandleDial: View {
    let progress: Double
    let time: TimeInterval

    /// From here on the wedge is drawn as the whole disc, so the first second shows no seam at twelve.
    static let full = 0.997

    /// Room around the dial for the glow.
    static let bleed: CGFloat = 40

    private static let core = Color(red: 1.0, green: 0.93, blue: 0.78)   // warm white
    private static let flame = Color(red: 1.0, green: 0.70, blue: 0.32)  // amber
    private static let ember = Color(red: 0.95, green: 0.38, blue: 0.16) // deep orange

    var body: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let radius = FocusTimerDisplay.dialSize / 2
            let disc = Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
            let wedge = Self.wedge(center: center, radius: radius, progress: progress)

            // Halo around the dial, strongest while much time is left.
            var halo = context
            halo.addFilter(.blur(radius: 34))
            halo.opacity = 0.10 + 0.14 * progress
            drawLight(in: &halo, center: center, radius: radius)

            // The spent part: a dim ember.
            context.fill(disc, with: .color(.white.opacity(0.03)))
            var embers = context
            embers.clip(to: disc)
            embers.addFilter(.blur(radius: radius * 0.22))
            embers.opacity = 0.10
            drawLight(in: &embers, center: center, radius: radius)

            // The time left: full candlelight, cut crisply by the wedge.
            var light = context
            light.clip(to: wedge)
            light.addFilter(.blur(radius: radius * 0.16))
            drawLight(in: &light, center: center, radius: radius)
            // The flame stays whole: it is the candle, the wedge is how far its light still reaches.
            var flame = context
            flame.addFilter(.blur(radius: 7))
            drawFlame(in: &flame, center: center, radius: radius)

        }
    }

    /// Layered soft blobs: a broad orange bed, an amber body and a pale core, plus two flame tongues
    /// rising from it. Each drifts on a few slow, unrelated sine waves, so the motion never repeats visibly.
    fileprivate func drawLight(in context: inout GraphicsContext, center: CGPoint, radius r: CGFloat) {
        let t = time
        let sway = CGFloat(sin(t * 0.7) * 0.05 + sin(t * 1.3 + 1.7) * 0.025) * r
        let rise = CGFloat(sin(t * 0.5 + 0.4) * 0.03) * r
        let flicker = 1 + 0.05 * sin(t * 2.3) + 0.03 * sin(t * 3.7 + 2.1)

        context.blendMode = .plusLighter
        func blob(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ color: Color, _ alpha: Double) {
            let rect = CGRect(x: center.x + x - w / 2, y: center.y + y - h / 2, width: w, height: h)
            context.fill(Path(ellipseIn: rect),
                         with: .radialGradient(Gradient(colors: [color.opacity(alpha * flicker), color.opacity(0)]),
                                               center: CGPoint(x: rect.midX, y: rect.midY),
                                               startRadius: 0, endRadius: max(w, h) / 2))
        }
        blob(0, r * 0.15, r * 2.4, r * 2.4, Self.ember, 0.55)                   // bed
        blob(sway * 0.5, r * 0.2 + rise, r * 1.6, r * 1.8, Self.flame, 0.42)     // body: broad, so the wedge fills evenly
    }

    /// The flame itself: a teardrop whose tip sways more than its base, with a pale core.
    fileprivate func drawFlame(in context: inout GraphicsContext, center: CGPoint, radius r: CGFloat) {
        let t = time
        let sway = CGFloat(sin(t * 0.7) * 0.05 + sin(t * 1.3 + 1.7) * 0.025) * r
        let stretch = CGFloat(1 + 0.06 * sin(t * 1.9 + 0.8) + 0.03 * sin(t * 3.3))
        let flicker = 0.9 + 0.06 * sin(t * 2.3) + 0.04 * sin(t * 3.7 + 2.1)
        context.blendMode = .plusLighter

        func teardrop(width w: CGFloat, height h: CGFloat, base: CGFloat) -> Path {
            let bottom = CGPoint(x: center.x + sway * 0.3, y: center.y + base)
            let tip = CGPoint(x: center.x + sway * 1.8, y: bottom.y - h * stretch)
            var p = Path()
            p.move(to: tip)
            p.addCurve(to: CGPoint(x: bottom.x + w / 2, y: bottom.y - w * 0.45),
                       control1: CGPoint(x: tip.x + w * 0.05, y: tip.y + h * 0.35),
                       control2: CGPoint(x: bottom.x + w / 2, y: bottom.y - w * 1.1))
            p.addArc(center: CGPoint(x: bottom.x, y: bottom.y - w * 0.45), radius: w / 2,
                     startAngle: .degrees(0), endAngle: .degrees(180), clockwise: false)
            p.addCurve(to: tip,
                       control1: CGPoint(x: bottom.x - w / 2, y: bottom.y - w * 1.1),
                       control2: CGPoint(x: tip.x - w * 0.05, y: tip.y + h * 0.35))
            return p
        }

        let outer = teardrop(width: r * 0.42, height: r * 0.95, base: r * 0.42)
        context.fill(outer, with: .linearGradient(
            Gradient(stops: [.init(color: Self.ember.opacity(0), location: 0),
                             .init(color: Self.flame.opacity(0.75 * flicker), location: 0.45),
                             .init(color: Self.flame.opacity(0.9 * flicker), location: 1)]),
            startPoint: CGPoint(x: center.x, y: center.y - r * 0.6), endPoint: CGPoint(x: center.x, y: center.y + r * 0.42)))
        let inner = teardrop(width: r * 0.22, height: r * 0.5, base: r * 0.38)
        context.fill(inner, with: .linearGradient(
            Gradient(colors: [Self.core.opacity(0), Self.core.opacity(0.95 * flicker)]),
            startPoint: CGPoint(x: center.x, y: center.y - r * 0.1), endPoint: CGPoint(x: center.x, y: center.y + r * 0.38)))
    }

    static func wedge(center: CGPoint, radius: CGFloat, progress: Double) -> Path {
        var path = Path()
        guard progress > 0 else { return path }
        if progress >= full {
            return Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
        }
        path.move(to: center)
        path.addArc(center: center, radius: radius, startAngle: .degrees(-90),
                    endAngle: .degrees(-90 + 360 * progress), clockwise: false)
        path.closeSubpath()
        return path
    }
}

/// The remaining time as a wedge of Liquid Glass, refracting the candle behind it.
private struct GlassWedge: View {
    let progress: Double

    #if DEBUG
    /// Window snapshots can't capture Liquid Glass; the harness can ask for the material fallback.
    private static let forceFallback = ProcessInfo.processInfo.environment["ONE_LIST_NO_GLASS"] != nil
    #else
    private static let forceFallback = false
    #endif

    var body: some View {
        if #available(macOS 26, iOS 26, *), !Self.forceFallback {
            Color.clear
                .glassEffect(.clear.tint(Color(red: 1, green: 0.8, blue: 0.55).opacity(0.06)), in: Wedge(progress: progress))
        } else {
            // Drawn glass (materials here would hide the candle): a faint sheen, a soft inner highlight
            // along the edges and a crisp specular rim, lit from the top left.
            let wedge = Wedge(progress: progress)
            wedge
                .fill(LinearGradient(colors: [.white.opacity(0.10), .white.opacity(0.02)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
                .overlay {
                    wedge.stroke(.white.opacity(0.16), lineWidth: 4)
                        .blur(radius: 6)
                        .clipShape(wedge)
                }
                .overlay {
                    wedge.stroke(LinearGradient(colors: [.white.opacity(0.55), .white.opacity(0.08), .white.opacity(0.25)],
                                                startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1)
                }
                .shadow(color: .black.opacity(0.25), radius: 10, y: 6)
        }
    }
}

/// Pie slice from twelve o'clock, clockwise; the whole disc once (almost) full.
nonisolated private struct Wedge: Shape {
    var progress: Double

    var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    func path(in rect: CGRect) -> Path {
        CandleDial.wedge(center: CGPoint(x: rect.midX, y: rect.midY), radius: min(rect.width, rect.height) / 2, progress: progress)
    }
}

/// A slowly turning glass sphere with a candle inside. It starts as a dim ember and fills with warm light
/// as the session goes on, glowing fully when the time is up.
private struct GlassOrb: View {
    /// Elapsed share of the session, 0 → 1.
    let filled: Double
    let time: TimeInterval

    /// Tiny air bubbles in the glass (longitude, latitude in radians, size); they show the rotation.
    private static let bubbles: [(Double, Double, CGFloat)] = [
        (0.3, 0.5, 2.2), (1.4, -0.2, 1.6), (2.2, 0.9, 1.4), (2.9, -0.6, 2.0), (3.7, 0.2, 1.5),
        (4.4, -0.9, 1.3), (5.1, 0.6, 1.8), (5.8, -0.35, 1.4), (0.9, -0.7, 1.2), (3.3, 0.75, 1.1),
    ]

    var body: some View {
        // Fills evenly, so how bright it is tells how far the session has come.
        let glow = 0.1 + 0.9 * filled
        let rotation = time * 2 * .pi / 40 // one turn every 40 s
        let candle = CandleDial(progress: 1, time: time)

        ZStack {
            Canvas { context, size in
                let c = CGPoint(x: size.width / 2, y: size.height / 2)
                let r = FocusTimerDisplay.dialSize / 2
                let sphere = Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r))

                // Warm light pooling under the orb, and a halo around it.
                var pool = context
                pool.addFilter(.blur(radius: 14))
                pool.fill(Path(ellipseIn: CGRect(x: c.x - r * 0.8, y: c.y + r * 0.88, width: r * 1.6, height: r * 0.32)),
                          with: .color(Color(red: 0.95, green: 0.5, blue: 0.2).opacity(0.35 * glow)))
                var halo = context
                halo.addFilter(.blur(radius: 32))
                halo.opacity = 0.28 * glow
                candle.drawLight(in: &halo, center: c, radius: r)

                // Dark glass body, lit faintly from the top left.
                context.fill(sphere, with: .radialGradient(
                    Gradient(colors: [.white.opacity(0.05), .black.opacity(0.4)]),
                    center: CGPoint(x: c.x - r * 0.3, y: c.y - r * 0.35), startRadius: 0, endRadius: r * 1.4))

                var inside = context
                inside.clip(to: sphere)

                // The candlelight filling the orb.
                var light = inside
                light.addFilter(.blur(radius: r * 0.2))
                light.opacity = glow
                candle.drawLight(in: &light, center: c, radius: r)

                // The flame, always faintly there.
                var flame = inside
                flame.addFilter(.blur(radius: 6))
                flame.opacity = 0.35 + 0.65 * glow
                candle.drawFlame(in: &flame, center: CGPoint(x: c.x, y: c.y + r * 0.08), radius: r * 0.8)

                // Light scattering in the glass near the rim, warmest at the bottom.
                inside.fill(sphere, with: .radialGradient(
                    Gradient(stops: [.init(color: .clear, location: 0.7),
                                     .init(color: Color(red: 1, green: 0.62, blue: 0.3).opacity(0.3 * glow), location: 1)]),
                    center: CGPoint(x: c.x, y: c.y - r * 0.1), startRadius: 0, endRadius: r * 1.08))

                // Bubbles turning with the sphere; brightest when facing us.
                for (lon, lat, size) in Self.bubbles {
                    let a = lon + rotation
                    let depth = cos(lat) * cos(a)
                    guard depth > 0 else { continue }
                    let p = CGPoint(x: c.x + r * 0.92 * CGFloat(cos(lat) * sin(a)), y: c.y - r * 0.92 * CGFloat(sin(lat)))
                    inside.fill(Path(ellipseIn: CGRect(x: p.x - size / 2, y: p.y - size / 2, width: size, height: size)),
                                with: .color(.white.opacity(0.35 * depth)))
                }
            }

            GlassShell()
        }
        .compositingGroup()
    }
}

/// Liquid Glass sphere surface (macOS 26); earlier systems rely on the drawn highlights alone.
private struct OrbGlass: View {
    #if DEBUG
    private static let disabled = ProcessInfo.processInfo.environment["ONE_LIST_NO_GLASS"] != nil
    #else
    private static let disabled = false
    #endif

    var body: some View {
        if #available(macOS 26, iOS 26, *), !Self.disabled {
            Color.clear.glassEffect(.clear, in: Circle())
        }
    }
}

/// The orb's glass: Liquid Glass (macOS 26) plus drawn rim light and reflections, on top of the contents.
fileprivate struct GlassShell: View {
    var body: some View {
        ZStack {
            // Real Liquid Glass over the body on macOS 26.
            OrbGlass()
                .frame(width: FocusTimerDisplay.dialSize, height: FocusTimerDisplay.dialSize)

            Canvas { context, size in
                let c = CGPoint(x: size.width / 2, y: size.height / 2)
                let r = FocusTimerDisplay.dialSize / 2
                let sphere = Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r))

                // Fresnel rim: glass catches more light at grazing angles.
                context.fill(sphere, with: .radialGradient(
                    Gradient(stops: [.init(color: .clear, location: 0.8),
                                     .init(color: .white.opacity(0.08), location: 0.95),
                                     .init(color: .white.opacity(0.22), location: 1)]),
                    center: c, startRadius: 0, endRadius: r))
                context.stroke(sphere, with: .linearGradient(
                    Gradient(colors: [.white.opacity(0.4), .white.opacity(0.05), .white.opacity(0.15)]),
                    startPoint: CGPoint(x: c.x - r, y: c.y - r), endPoint: CGPoint(x: c.x + r, y: c.y + r)), lineWidth: 0.75)

                // Window reflection: a soft highlight and a crisp glint, top left.
                var soft = context
                soft.addFilter(.blur(radius: 4))
                soft.translateBy(x: c.x - r * 0.36, y: c.y - r * 0.46)
                soft.rotate(by: .degrees(-32))
                soft.fill(Path(ellipseIn: CGRect(x: -r * 0.36, y: -r * 0.17, width: r * 0.72, height: r * 0.34)),
                          with: .radialGradient(Gradient(colors: [.white.opacity(0.32), .white.opacity(0)]),
                                                center: .zero, startRadius: 0, endRadius: r * 0.36))
                var glint = context
                glint.addFilter(.blur(radius: 1.2))
                glint.translateBy(x: c.x - r * 0.47, y: c.y - r * 0.56)
                glint.rotate(by: .degrees(-35))
                glint.fill(Path(ellipseIn: CGRect(x: -r * 0.06, y: -r * 0.025, width: r * 0.12, height: r * 0.05)),
                           with: .radialGradient(Gradient(colors: [.white.opacity(0.85), .white.opacity(0)]),
                                                 center: .zero, startRadius: 0, endRadius: r * 0.06))

                // A faint secondary reflection on the lower right.
                var low = context
                low.addFilter(.blur(radius: 6))
                var arc = Path()
                arc.addArc(center: c, radius: r * 0.86, startAngle: .degrees(20), endAngle: .degrees(70), clockwise: false)
                low.stroke(arc, with: .color(.white.opacity(0.12)), lineWidth: 3)
            }
        }
    }
}

/// A glass sphere slowly filling with water. The level follows the sphere's volume, so it climbs fastest
/// around the middle; the surface sways gently, light ripples through the water and a few bubbles rise.
private struct WaterOrb: View {
    /// Elapsed share of the session, 0 → 1: the share of the sphere's volume holding water.
    let filled: Double
    let time: TimeInterval

    /// Fill height (0 → 1 of the diameter) for a volume share: solves V = h²(3 − 2h).
    private static func level(forVolume v: Double) -> Double {
        guard v > 0 else { return 0 }
        guard v < 1 else { return 1 }
        var lo = 0.0, hi = 1.0
        for _ in 0..<30 {
            let h = (lo + hi) / 2
            if h * h * (3 - 2 * h) < v { lo = h } else { hi = h }
        }
        return (lo + hi) / 2
    }

    private static let shallow = Color(red: 0.35, green: 0.72, blue: 0.92)
    private static let deep = Color(red: 0.06, green: 0.22, blue: 0.48)

    var body: some View {
        let t = time
        ZStack {
            Canvas { context, size in
                let c = CGPoint(x: size.width / 2, y: size.height / 2)
                let r = FocusTimerDisplay.dialSize / 2
                let sphere = Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r))
                let h = CGFloat(Self.level(forVolume: filled))

                // A cool glow under and around the orb, growing with the water.
                var pool = context
                pool.addFilter(.blur(radius: 16))
                pool.fill(Path(ellipseIn: CGRect(x: c.x - r * 0.8, y: c.y + r * 0.88, width: r * 1.6, height: r * 0.32)),
                          with: .color(Self.shallow.opacity(0.25 * filled)))

                // Empty glass.
                context.fill(sphere, with: .radialGradient(
                    Gradient(colors: [.white.opacity(0.05), .black.opacity(0.4)]),
                    center: CGPoint(x: c.x - r * 0.3, y: c.y - r * 0.35), startRadius: 0, endRadius: r * 1.4))

                guard h > 0.002 else { return }
                var inside = context
                inside.clip(to: sphere)

                // The surface: an ellipse (seen slightly from above) that sways and tilts a little.
                let surfaceY = c.y + r - 2 * r * h + CGFloat(sin(t * 0.8) * 1.2 + sin(t * 1.9 + 1) * 0.6)
                let halfChord = sqrt(max(0, r * r - (surfaceY - c.y) * (surfaceY - c.y)))
                let tilt = Angle.degrees(sin(t * 0.45) * 1.8 + sin(t * 1.1 + 0.6) * 0.6)
                let depth = max(1.5, halfChord * 0.13)

                // Water body below the surface's centre line, rotated with the tilt.
                var water = inside
                water.translateBy(x: c.x, y: surfaceY)
                water.rotate(by: tilt)
                let body = Path(CGRect(x: -2 * r, y: 0, width: 4 * r, height: 4 * r))
                water.fill(body, with: .linearGradient(
                    Gradient(colors: [Self.shallow.opacity(0.55), Self.deep.opacity(0.85)]),
                    startPoint: .zero, endPoint: CGPoint(x: 0, y: 2 * r * h + depth)))

                // Light rippling through the water.
                var caustics = water
                caustics.addFilter(.blur(radius: 9))
                caustics.blendMode = .plusLighter
                for i in 0..<4 {
                    let k = Double(i)
                    let x = CGFloat(sin(t * (0.21 + 0.05 * k) + k * 1.7)) * halfChord * 0.7
                    let y = CGFloat(0.25 + 0.5 * (sin(t * (0.17 + 0.04 * k) + k) + 1) / 2) * 2 * r * h
                    let w = r * CGFloat(0.35 + 0.1 * sin(t * 0.3 + k))
                    caustics.fill(Path(ellipseIn: CGRect(x: x - w / 2, y: y - w * 0.18, width: w, height: w * 0.36)),
                                  with: .color(.white.opacity(0.07)))
                }

                // Bubbles rising from the bottom.
                if h > 0.08 {
                    let height = 2 * r * h
                    for i in 0..<6 {
                        let k = Double(i)
                        let speed = 10 + 4 * k.truncatingRemainder(dividingBy: 3) // points per second
                        let rise = CGFloat((t * speed + k * 37).truncatingRemainder(dividingBy: Double(height)))
                        let x = CGFloat(sin(k * 2.3) * 0.55) * r + CGFloat(sin(t * 1.3 + k)) * 2
                        let size = CGFloat(1.4 + k.truncatingRemainder(dividingBy: 2))
                        water.fill(Path(ellipseIn: CGRect(x: x - size / 2, y: height - rise, width: size, height: size)),
                                   with: .color(.white.opacity(0.35 * Double(min(1, rise / 12)))))
                    }
                }

                // The surface itself, lighter, with a bright meniscus line along its front edge.
                if halfChord > 2 {
                    let surface = Path(ellipseIn: CGRect(x: -halfChord, y: -depth, width: 2 * halfChord, height: 2 * depth))
                    water.fill(surface, with: .linearGradient(
                        Gradient(colors: [Self.shallow.opacity(0.35), Self.shallow.opacity(0.6)]),
                        startPoint: CGPoint(x: 0, y: -depth), endPoint: CGPoint(x: 0, y: depth)))
                    var front = Path()
                    front.addArc(center: .zero, radius: 1, startAngle: .degrees(0), endAngle: .degrees(180), clockwise: false)
                    water.stroke(front.applying(CGAffineTransform(scaleX: halfChord, y: depth)),
                                 with: .color(.white.opacity(0.45)), lineWidth: 1)
                    var back = Path()
                    back.addArc(center: .zero, radius: 1, startAngle: .degrees(180), endAngle: .degrees(360), clockwise: false)
                    water.stroke(back.applying(CGAffineTransform(scaleX: halfChord, y: depth)),
                                 with: .color(.white.opacity(0.15)), lineWidth: 0.75)
                }
            }

            GlassShell()
        }
        .compositingGroup()
    }
}
