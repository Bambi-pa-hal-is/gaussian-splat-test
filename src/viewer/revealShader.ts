// Work-buffer modifier that drives the unstyled -> styled transition.
//
// A noisy spherical wavefront expands from `uRevealOrigin`. Splats the front has
// passed get t = 1, splats ahead of it t = 0, and splats inside the front band
// get 0 < t < 1. The unstyled splat dissolves (shrinks, glows, drifts upward) as
// t goes 0 -> 1 while the styled splat materialises from the same front.
//
// `uRevealSide` selects the behaviour: 0 = unstyled (visible ahead of the front),
// 1 = styled (visible behind the front).
//
// `uClipY` hides every splat above that world height (the editor uses it to slice
// off the ceiling for its top-down view).

const glsl = /* glsl */ `
uniform vec3 uRevealOrigin;
uniform float uRevealRadius;
uniform float uRevealWidth;
uniform float uRevealSide;
uniform vec3 uRevealGlow;
uniform float uClipY;

float revealHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float revealNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(revealHash(i + vec3(0, 0, 0)), revealHash(i + vec3(1, 0, 0)), f.x),
                   mix(revealHash(i + vec3(0, 1, 0)), revealHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(revealHash(i + vec3(0, 0, 1)), revealHash(i + vec3(1, 0, 1)), f.x),
                   mix(revealHash(i + vec3(0, 1, 1)), revealHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

// 0 = front has not reached this point yet, 1 = front has fully passed
float revealProgress(vec3 p) {
    float n = revealNoise(p * 7.0) * 0.6 + revealNoise(p * 23.0) * 0.4;
    float d = distance(p, uRevealOrigin) + (n - 0.5) * uRevealWidth * 2.0;
    return clamp((uRevealRadius - d) / uRevealWidth, 0.0, 1.0);
}

// 1 in the middle of the band, 0 outside it
float revealBand(float t) {
    return 4.0 * t * (1.0 - t);
}

float revealVisibility(float t) {
    return uRevealSide > 0.5 ? t : 1.0 - t;
}

void modifySplatCenter(inout vec3 center) {
    float t = revealProgress(center);
    float band = revealBand(t);
    // dissolving splats float up and scatter a little; arriving ones settle down into place
    float jitter = revealHash(floor(center * 400.0)) - 0.5;
    float lift = uRevealSide > 0.5 ? (1.0 - t) : t;
    center.y += band * lift * uRevealWidth * (0.35 + jitter * 0.3);
}

void modifySplatRotationScale(vec3 originalCenter, vec3 modifiedCenter, inout vec4 rotation, inout vec3 scale) {
    float t = revealProgress(originalCenter);
    float v = revealVisibility(t);
    // overshoot slightly while in the band so the front reads as a bright, fuzzy edge
    float s = smoothstep(0.0, 1.0, v) * (1.0 + revealBand(t) * 0.6);
    scale *= originalCenter.y > uClipY ? 0.0 : s;
}

void modifySplatColor(vec3 center, inout vec4 color) {
    float t = revealProgress(center);
    float band = revealBand(t);
    color.rgb = mix(color.rgb, uRevealGlow, band * band * 0.85);
    color.a *= smoothstep(0.0, 1.0, revealVisibility(t));
}
`;

export const revealModifier = { glsl };
