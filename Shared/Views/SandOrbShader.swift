import Foundation

/// Metal source for the sand orb (see `OrbRenderer`): an hourglass-like stream trickling from the top onto a
/// growing cone of sand.
nonisolated enum SandOrbShader {
    /// Slope of the pile (sand rests at about 32°).
    static let slope = 0.62
    static let innerRadius = 0.965

    /// Height of the pile's peak for a share of the sphere's volume holding sand. The pile is a cone of
    /// fixed slope inside the sphere; its volume is integrated over rings and the peak found by bisection.
    static func peak(forVolume v: Double) -> Double {
        let r = innerRadius
        guard v > 0 else { return -r - 0.01 }
        let total = 4.0 / 3.0 * .pi * r * r * r
        func volume(_ c: Double) -> Double {
            let steps = 240
            var sum = 0.0
            for i in 0..<steps {
                let x = (Double(i) + 0.5) / Double(steps) * r
                let half = (r * r - x * x).squareRoot()
                let height = min(max(c - slope * x + half, 0), 2 * half) // from the bottom of the sphere at x
                sum += 2 * .pi * x * height * (r / Double(steps))
            }
            return sum / total
        }
        var lo = -r, hi = r + slope * r
        for _ in 0..<32 {
            let m = (lo + hi) / 2
            if volume(m) < v { lo = m } else { hi = m }
        }
        return (lo + hi) / 2
    }

    static let source = OrbRenderer.common + #"""
    constant float SLOPE = 0.62;
    constant float STREAM_R = 0.011;
    constant float3 SAND = float3(0.86, 0.71, 0.5);

    // Value noise, for grain texture and the stream's flicker.
    float hash31(float3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    float noise3(float3 x) {
        float3 i = floor(x), f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash31(i), hash31(i + float3(1, 0, 0)), f.x),
                       mix(hash31(i + float3(0, 1, 0)), hash31(i + float3(1, 1, 0)), f.x), f.y),
                   mix(mix(hash31(i + float3(0, 0, 1)), hash31(i + float3(1, 0, 1)), f.x),
                       mix(hash31(i + float3(0, 1, 1)), hash31(i + float3(1, 1, 1)), f.x), f.y), f.z);
    }

    bool streaming(float peak) { return peak < R_IN * 0.92; }

    // The pile: a cone with a softly rounded tip, plus slow slides running down its slope.
    float pileHeight(float2 xz, float t, float peak) {
        float r = length(xz);
        float y = peak - SLOPE * (sqrt(r * r + 0.0025) - 0.05);
        if (streaming(peak)) {
            // Slides: shallow bands that start at the tip and run outwards, now and then.
            for (int k = 0; k < 3; k++) {
                float fk = float(k);
                float cycle = 3.3 + fk * 1.1;
                float phase = fract(t / cycle + fk * 0.37);
                float angle = hash11(floor(t / cycle + fk * 0.37) + fk * 13.0) * 6.2831;
                float2 dir = float2(cos(angle), sin(angle));
                float along = dot(xz, dir);
                float across = dot(xz, float2(-dir.y, dir.x));
                float front = along - phase * 0.9;
                y += 0.012 * exp(-front * front * 90.0) * exp(-across * across * 25.0) * smoothstep(0.0, 0.1, along) * (1.0 - phase);
            }
        }
        return y;
    }

    float3 pileNormal(float2 xz, float t, float peak) {
        const float e = 0.003;
        float dx = pileHeight(xz + float2(e, 0), t, peak) - pileHeight(xz - float2(e, 0), t, peak);
        float dz = pileHeight(xz + float2(0, e), t, peak) - pileHeight(xz - float2(0, e), t, peak);
        return normalize(float3(-dx / (2.0 * e), 1.0, -dz / (2.0 * e)));
    }

    float3 shadeSand(float3 p, float3 n, float3 d, float t, float wallPressed) {
        float3 L = normalize(LIGHT);
        // Grain: fine noise in albedo and in the normal.
        float g1 = noise3(p * 140.0);
        float g2 = noise3(p * 37.0 + 3.0);
        float3 gn = normalize(n + (float3(noise3(p * 120.0 + 7.0), 0.0, noise3(p * 120.0 + 19.0)) - 0.5) * 0.6);
        float3 albedo = SAND * (0.78 + 0.22 * g1) * (0.92 + 0.12 * g2);
        albedo = mix(albedo, albedo * float3(0.9, 0.86, 0.82), wallPressed);
        float diffuse = max(dot(gn, L), 0.0);
        // Sand pressed against the glass gets light from all around, through the glass.
        float ambient = mix(0.22, 0.5, wallPressed);
        float3 col = albedo * (ambient + (1.0 - ambient) * diffuse);
        // Occasional quartz sparkles catching the light.
        float sparkle = step(0.985, noise3(floor(p * 260.0) + floor(t * 0.5)));
        col += sparkle * pow(max(dot(reflect(d, gn), L), 0.0), 6.0) * 0.9;
        return col;
    }

    fragment float4 orbFragment(VOut in [[stage_in]], constant Uniforms &u [[buffer(0)]]) {
        float2 sp = scenePoint(in.uv, u);
        float px = 2.0 * u.extent / u.resolution.y;
        float cover = smoothstep(R_OUT, R_OUT - 1.5 * px, length(sp));
        if (cover <= 0.0) return float4(0);

        float cp = cos(u.pitch), spi = sin(u.pitch);
        float3 oc = float3(sp, -4.0);
        float3 o = float3(oc.x, oc.y * cp - oc.z * spi, oc.y * spi + oc.z * cp);
        float3 d = float3(0.0, -spi, cp);
        float t = u.time;
        float peak = u.level;

        float to0, to1;
        hitSphere(o, d, float3(0), R_OUT, to0, to1);
        float3 nOut = normalize(o + d * to0);
        float fres = pow(1.0 - abs(dot(nOut, -d)), 3.0);
        float glassA = 0.08 + 0.45 * fres;
        float3 glassC = float3(0.7, 0.72, 0.76) * (0.06 + 0.5 * fres);

        float ti0, ti1;
        if (!hitSphere(o, d, float3(0), R_IN, ti0, ti1)) return float4(glassC, glassA) * cover;
        float4 inner = float4(0.015, 0.015, 0.018, 0.18);

        // Sand: first point below the pile's surface.
        float tSand = -1.0;
        bool onSurface = false;
        if (peak > -R_IN) {
            const int STEPS = 64;
            float step = (ti1 - ti0) / float(STEPS);
            float3 p0 = o + d * ti0;
            if (p0.y < pileHeight(p0.xz, t, peak)) {
                tSand = ti0;
            } else {
                float prev = ti0;
                for (int i = 1; i <= STEPS; i++) {
                    float tt = ti0 + step * float(i);
                    float3 p = o + d * tt;
                    if (p.y < pileHeight(p.xz, t, peak)) {
                        float a = prev, b = tt;
                        for (int j = 0; j < 6; j++) {
                            float m = 0.5 * (a + b);
                            float3 q = o + d * m;
                            if (q.y < pileHeight(q.xz, t, peak)) b = m; else a = m;
                        }
                        tSand = b;
                        onSurface = true;
                        break;
                    }
                    prev = tt;
                }
            }
        }
        if (tSand >= 0.0) {
            float3 p = o + d * tSand;
            // Against the glass, the sand's face points outwards, towards us.
            float3 n = onSurface ? pileNormal(p.xz, t, peak) : normalize(p);
            float3 col = shadeSand(p, n, d, t, onSurface ? 0.0 : 1.0);
            if (!onSurface) {
                // Sand pressed against the glass: lit through the glass, darker deeper down.
                float depth = max(pileHeight(p.xz, t, peak) - p.y, 0.0);
                col *= 0.7 + 0.3 * exp(-depth * 2.0);
            } else {
                // A little shade where the pile meets the glass.
                col *= 0.75 + 0.25 * smoothstep(0.0, 0.08, R_IN - length(p));
            }
            inner = float4(col, 1.0);
        }

        if (streaming(peak)) {
            // The stream: a thin column of falling grains from the opening at the top to the peak.
            float2 oxz = o.xz, dxz = d.xz;
            float a = dot(dxz, dxz), b = dot(oxz, dxz), c = dot(oxz, oxz) - STREAM_R * STREAM_R;
            float h = b * b - a * c;
            if (h > 0.0 && a > 1e-6) {
                float ts = (-b - sqrt(h)) / a;
                float3 p = o + d * ts;
                float topY = R_IN;
                if (p.y < topY && p.y > peak - 0.02 && ts > ti0 && (tSand < 0.0 || ts < tSand)) {
                    float grains = noise3(float3(p.x * 300.0, p.y * 90.0 + t * 26.0, p.z * 300.0));
                    float density = smoothstep(0.35, 0.6, grains) * (0.55 + 0.45 * smoothstep(topY, topY - 0.25, p.y));
                    float3 col = SAND * (0.7 + 0.5 * grains) * (0.55 + 0.45 * max(dot(normalize(float3(p.x, 0, p.z)), normalize(LIGHT)), 0.0));
                    inner = float4(col * density, density) + inner * (1.0 - density);
                }
            }

            // Grains bouncing off the peak.
            for (int k = 0; k < 7; k++) {
                float fk = float(k);
                float cycle = 0.7 + 0.25 * hash11(fk);
                float tau = fract(t / cycle + hash11(fk + 4.0)) * cycle;
                float n0 = floor(t / cycle + hash11(fk + 4.0));
                float angle = hash11(n0 * 7.0 + fk) * 6.2831;
                float vr = 0.12 + 0.12 * hash11(n0 + fk * 3.0);
                float vy = 0.35 + 0.3 * hash11(n0 * 1.7 + fk);
                float r = vr * tau;
                float2 xz = float2(cos(angle), sin(angle)) * r;
                float y = peak + vy * tau - 1.3 * tau * tau;
                if (y < pileHeight(xz, t, peak)) continue;
                float tg0, tg1;
                if (hitSphere(o, d, float3(xz.x, y, xz.y), 0.006, tg0, tg1) && (tSand < 0.0 || tg0 < tSand)) {
                    inner = float4(SAND * 0.9, 1.0);
                }
            }
        }

        float4 result = float4(glassC, glassA) + inner * (1.0 - glassA);
        return result * cover;
    }
    """#
}
