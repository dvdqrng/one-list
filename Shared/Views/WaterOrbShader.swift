import Foundation

/// Metal source for the water orb (see `OrbRenderer`).
nonisolated enum WaterOrbShader {
    static let source = OrbRenderer.common + #"""
    constant float GRAVITY = 2.6;     // sphere radii per second²
    constant float PERIOD = 1.7;      // seconds between drips
    constant float DROP_R = 0.026;

    // MARK: Drips
    //
    // Drip k forms as a bead at the top inside the glass, lets go at release(k), falls freely and hits the
    // water at impact(k). Everything is a pure function of time, so pausing simply freezes the scene.

    struct Drip {
        float2 xz;      // where it falls
        float top;      // y of the bead's centre when it lets go
        float release;
        float impact;
        float speed;    // at impact
    };

    Drip drip(float k, float waterY) {
        Drip d;
        d.xz = float2(hash11(k + 3.1) - 0.5, hash11(k + 7.7) - 0.5) * 0.14;
        d.top = sqrt(R_IN * R_IN - dot(d.xz, d.xz)) - DROP_R * 1.6;
        d.release = k * PERIOD + (hash11(k) - 0.5) * 0.6;
        float fall = max(d.top - waterY, 0.0);
        float tf = sqrt(2.0 * fall / GRAVITY);
        d.impact = d.release + tf;
        d.speed = GRAVITY * tf;
        return d;
    }

    float waterLevelY(float level) { return -R_IN + 2.0 * R_IN * level; }

    bool dripsActive(float level) { return level < 0.985; }

    // MARK: Water surface

    float ripple(float2 xz, float t, Drip d) {
        float dt = t - d.impact;
        if (dt <= 0.0 || dt > 5.0) return 0.0;
        float a = 0.028 * clamp(d.speed / 3.0, 0.35, 1.0);
        float dist = length(xz - d.xz);
        float front = dist - 0.62 * dt;
        float rings = cos(24.0 * front) * exp(-10.0 * front * front) * exp(-1.1 * dt) / (1.0 + 4.0 * dist);
        float crater = -1.2 * exp(-14.0 * dt) * exp(-90.0 * dist * dist);
        return a * (rings + crater);
    }

    float heightAt(float2 xz, float t, float level) {
        float y = waterLevelY(level);
        // Calm base motion: a few slow, unrelated waves.
        y += 0.006 * sin(1.7 * xz.x + 0.9 * t)
           + 0.005 * sin(2.3 * xz.y - 0.7 * t + 1.0)
           + 0.003 * sin(3.1 * (xz.x + xz.y) + 1.3 * t);
        if (dripsActive(level)) {
            float kc = floor(t / PERIOD);
            for (int i = -3; i <= 0; i++) {
                y += ripple(xz, t, drip(kc + float(i), waterLevelY(level)));
            }
        }
        return y;
    }

    float3 surfaceNormal(float2 xz, float t, float level) {
        const float e = 0.004;
        float dx = heightAt(xz + float2(e, 0), t, level) - heightAt(xz - float2(e, 0), t, level);
        float dz = heightAt(xz + float2(0, e), t, level) - heightAt(xz - float2(0, e), t, level);
        return normalize(float3(-dx / (2.0 * e), 1.0, -dz / (2.0 * e)));
    }

    float3 environment(float3 r) {
        float3 col = mix(float3(0.025, 0.03, 0.045), float3(0.42, 0.5, 0.6), smoothstep(-0.2, 0.9, r.y));
        float s = max(dot(r, normalize(LIGHT)), 0.0);
        float b = max(dot(r, normalize(BACKLIGHT)), 0.0);
        return col + pow(s, 220.0) * 2.0 + pow(s, 18.0) * 0.12
                   + pow(b, 160.0) * float3(1.6, 1.7, 1.8) + pow(b, 12.0) * float3(0.1, 0.13, 0.16);
    }

    float caustic(float3 p, float t) {
        float2 q = float2(p.x * 7.5 + p.y * 3.1, p.z * 7.5 - p.y * 2.6) + float2(t * 0.33, -t * 0.27);
        float v = sin(q.x + 1.6 * sin(q.y * 1.3 + t * 0.6)) * sin(q.y * 1.1 + 1.4 * sin(q.x * 0.9 - t * 0.5));
        return pow(abs(v), 4.0);
    }

    // MARK: Shading

    fragment float4 orbFragment(VOut in [[stage_in]], constant Uniforms &u [[buffer(0)]]) {
        float2 sp = scenePoint(in.uv, u);
        float px = 2.0 * u.extent / u.resolution.y;
        float cover = smoothstep(R_OUT, R_OUT - 1.5 * px, length(sp));
        if (cover <= 0.0) return float4(0);

        // Orthographic camera tilted to look slightly down onto the water.
        float cp = cos(u.pitch), spi = sin(u.pitch);
        float3 oc = float3(sp, -4.0);
        float3 o = float3(oc.x, oc.y * cp - oc.z * spi, oc.y * spi + oc.z * cp);
        float3 d = float3(0.0, -spi, cp);

        float t = u.time;
        float waterY = waterLevelY(u.level);
        float3 L = normalize(LIGHT);

        // Front of the glass: a thin tint, stronger at grazing angles.
        float to0, to1;
        hitSphere(o, d, float3(0), R_OUT, to0, to1);
        float3 nOut = normalize(o + d * to0);
        float fres = pow(1.0 - abs(dot(nOut, -d)), 3.0);
        float glassA = 0.08 + 0.45 * fres;
        float3 glassC = float3(0.62, 0.72, 0.82) * (0.06 + 0.5 * fres);

        float ti0, ti1;
        if (!hitSphere(o, d, float3(0), R_IN, ti0, ti1)) {
            return float4(glassC, glassA) * cover;
        }

        // Inside: transparent air with a faint smoky glass tint, unless something is hit.
        float4 inner = float4(0.015, 0.02, 0.028, 0.18);

        // Water: march to the first point below the surface, then refine.
        float tWater = -1.0;
        bool throughSurface = false;
        if (u.level > 0.002) {
            const int STEPS = 72;
            float step = (ti1 - ti0) / float(STEPS);
            float3 p0 = o + d * ti0;
            if (p0.y < heightAt(p0.xz, t, u.level)) {
                tWater = ti0;
            } else {
                float prev = ti0;
                for (int i = 1; i <= STEPS; i++) {
                    float tt = ti0 + step * float(i);
                    float3 p = o + d * tt;
                    if (p.y < heightAt(p.xz, t, u.level)) {
                        float a = prev, b = tt;
                        for (int j = 0; j < 6; j++) {
                            float m = 0.5 * (a + b);
                            float3 q = o + d * m;
                            if (q.y < heightAt(q.xz, t, u.level)) b = m; else a = m;
                        }
                        tWater = b;
                        throughSurface = true;
                        break;
                    }
                    prev = tt;
                }
            }
        }

        if (tWater >= 0.0) {
            float3 pe = o + d * tWater;
            float len = ti1 - tWater;
            float3 pb = o + d * ti1;

            // Light absorbed on the way through (red goes first), scattered back blue-green.
            float3 absorb = float3(3.0, 1.15, 0.55);
            float3 T = exp(-absorb * len);
            float backDepth = max(waterY - pb.y, 0.0);
            float3 back = float3(0.02, 0.03, 0.05)
                        + caustic(pb, t) * float3(0.45, 0.7, 0.85) * 0.2 * exp(-backDepth * 1.4);
            float nearTop = exp(-max(waterY - pe.y, 0.0) * 1.3);
            float3 scatter = float3(0.08, 0.36, 0.58) * (0.45 + 0.65 * nearTop);
            float3 col = back * T + scatter * (1.0 - T);

            // Light shafts in the water.
            for (int j = 1; j <= 3; j++) {
                float3 q = o + d * (tWater + len * float(j) / 4.0);
                float depth = max(waterY - q.y, 0.0);
                col += caustic(q * 0.8, t * 0.8) * float3(0.35, 0.6, 0.75) * 0.06 * exp(-depth * 2.2) * exp(-absorb * (len * float(j) / 4.0));
            }

            // Bubbles rising from where drops landed.
            if (dripsActive(u.level)) {
                float kc = floor(t / PERIOD);
                for (int i = -3; i <= 0; i++) {
                    Drip dr = drip(kc + float(i), waterY);
                    float dt = t - dr.impact;
                    if (dt <= 0.0 || dt > 3.0) continue;
                    for (int b = 0; b < 3; b++) {
                        float fb = float(b);
                        float start = waterY - (0.12 + 0.1 * hash11(kc + float(i) + fb * 5.3)) * min(1.0, u.level * 6.0);
                        float y = start + (0.18 + 0.06 * fb) * dt;
                        if (y > waterY - 0.01) continue;
                        float2 xz = dr.xz + float2(sin(dt * 5.0 + fb * 2.0), cos(dt * 4.0 + fb)) * 0.012 + (fb - 1.0) * 0.02;
                        float tb0, tb1;
                        float rb = 0.008 + 0.004 * fb;
                        if (hitSphere(o, d, float3(xz.x, y, xz.y), rb, tb0, tb1) && tb0 > tWater) {
                            float3 nb = normalize(o + d * tb0 - float3(xz.x, y, xz.y));
                            float rim = pow(1.0 - abs(dot(nb, -d)), 2.0);
                            col += float3(0.75, 0.88, 1.0) * (0.15 + 0.7 * rim) * exp(-absorb * (tb0 - tWater)) * 0.8;
                        }
                    }
                }
            }

            if (throughSurface) {
                float3 n = surfaceNormal(pe.xz, t, u.level);
                float f = 0.04 + 0.96 * pow(1.0 - max(dot(n, -d), 0.0), 5.0);
                float3 r = reflect(d, n);
                col = mix(col, environment(r), f);
                // Light entering the surface makes the top layer glow a little.
                col += float3(0.05, 0.12, 0.15) * (0.6 + 0.4 * n.y);
                // Meniscus: water climbing the glass catches the light.
                float wall = R_IN - length(pe);
                col += float3(0.7, 0.85, 1.0) * exp(-wall * 90.0) * 0.4;
            }
            inner = float4(col, 1.0) * 0.97;
        }

        // Drips (in the air, in front of the water).
        if (dripsActive(u.level)) {
            float kc = floor(t / PERIOD);
            float bestT = 1e9;
            float3 bestN = float3(0);
            for (int i = -2; i <= 1; i++) {
                float k = kc + float(i);
                Drip dr = drip(k, waterY);
                float dt = t - dr.release;
                float3 c; float3 s; bool live = false;
                if (dt < 0.0 && dt > -PERIOD * 0.9) {
                    // Forming at the top: swelling, then stretching just before it lets go.
                    float grow = smoothstep(-PERIOD * 0.9, -0.1, dt);
                    float neck = smoothstep(-0.35, 0.0, dt);
                    float r = DROP_R * (0.25 + 0.75 * grow);
                    float stretch = 1.0 + 0.45 * neck;
                    float topInner = sqrt(R_IN * R_IN - dot(dr.xz, dr.xz));
                    c = float3(dr.xz.x, topInner - r * stretch * 0.95, dr.xz.y);
                    s = float3(r, r * stretch, r);
                    live = true;
                } else if (dt >= 0.0 && t < dr.impact) {
                    // Falling, stretching with speed.
                    float v = GRAVITY * dt;
                    float y = dr.top - 0.5 * GRAVITY * dt * dt;
                    float e = 1.0 + min(v * 0.22, 0.9);
                    c = float3(dr.xz.x, y, dr.xz.y);
                    s = float3(DROP_R / sqrt(e), DROP_R * e, DROP_R / sqrt(e));
                    live = true;
                } else if (t >= dr.impact) {
                    // Rebound droplet (the little jet after a drop hits water).
                    float dj = t - dr.impact - 0.06;
                    float v0 = 0.9 * clamp(dr.speed / 3.0, 0.3, 1.0);
                    float y = waterY + v0 * dj - 0.5 * GRAVITY * dj * dj;
                    if (dj > 0.0 && y > waterY && u.level > 0.03) {
                        c = float3(dr.xz.x, y + 0.01, dr.xz.y);
                        s = float3(0.011);
                        live = true;
                    }
                }
                float th; float3 nh;
                if (live && hitEllipsoid(o, d, c, s, th, nh) && th < bestT && th > ti0 - 0.05) {
                    bestT = th; bestN = nh;
                }
            }
            if (bestT < 1e8 && (tWater < 0.0 || bestT < tWater)) {
                // Clear water: mostly see-through, a dark refracting edge and bright glints.
                float facing = abs(dot(bestN, -d));
                float f = 0.04 + 0.96 * pow(1.0 - facing, 5.0);
                float3 r = reflect(d, bestN);
                float3 body = float3(0.55, 0.75, 0.88) * 0.18 * (0.5 + 0.5 * max(dot(bestN, L), 0.0));
                float3 dc = body + environment(r) * (0.15 + 0.85 * f);
                float edge = pow(1.0 - facing, 1.5);
                float a = mix(0.35, 0.9, edge);
                inner = float4(dc * a, a) + inner * (1.0 - a);
            }
        }

        float4 result = float4(glassC, glassA) + inner * (1.0 - glassA);
        return result * cover;
    }
    """#
}
