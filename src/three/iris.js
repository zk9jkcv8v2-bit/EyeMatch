import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Realistic macro iris: fine straight radial fibres, a warm amber corona
// around the pupil with golden flecks, soft crypt variation, and the brand's
// 8-petal star silhouette (the opening of the EyeMatch icon).
const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform float uTime;
  uniform vec3 uCore;       // warm corona color
  uniform vec3 uMid;
  uniform vec3 uEdge;
  uniform float uPupil;     // pupil radius in 0..1 disc space
  uniform float uDissolve;  // 0 = whole iris, ~1.4 = fully streamed away
  uniform float uAlpha;
  uniform float uPetals;
  uniform vec2 uMouse;      // -1..1, eased — the object "notices" the cursor

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    p += uMouse * 0.04 * smoothstep(0.1, 0.9, length(p));
    float r = length(p);
    float ang = atan(p.y, p.x);

    // Brand silhouette: 8-petal soft star (mirrors petalEdge() in config.js).
    float wave = pow(0.5 + 0.5 * cos(ang * uPetals), 1.35);
    float edge = 0.86 + 0.115 * wave;
    float edgeMask = 1.0 - smoothstep(edge - 0.016, edge + 0.006, r);
    if (edgeMask <= 0.001) discard;

    float drift = uTime * 0.04;
    // Radius sample shifts inward as dissolve grows → fibres stream outward.
    float rs = r - uDissolve * 0.35;

    // Fibres: thin, straight, dense radial striations with per-fibre length
    // variation, plus a slow macro wave so they read organic, not printed.
    float lane = ang * 90.0;
    float fibreId = floor(lane);
    float fine = noise(vec2(lane, rs * 26.0));
    float lenVar = hash(vec2(fibreId, 7.0));
    float macro = fbm(vec2(ang * 6.0 + sin(rs * 3.0 + drift), rs * 4.5 - drift * 2.0));
    float fiber = fine * 0.55 + macro * 0.45;
    // Some fibres stop short — fade them out past their personal length.
    fiber *= 1.0 - 0.55 * smoothstep(0.55 + lenVar * 0.4, 0.95, r) * step(0.5, lenVar);

    // Crypts — soft organic blotches, kept subtle.
    float crypts = fbm(p * 3.2 + drift * 0.5);

    vec3 col = mix(uMid, uEdge, smoothstep(0.42, 0.95, r));
    col *= 0.45 + fiber * 0.85;
    col *= 0.84 + crypts * 0.22;

    // Warm amber corona radiating from the pupil — the reference's gold ring.
    float corona = smoothstep(uPupil - 0.02, uPupil + 0.1, r)
                 * (1.0 - smoothstep(uPupil + 0.1, uPupil + 0.34, r));
    col = mix(col, uCore * (0.5 + fiber * 0.9), corona * 0.75);

    // Golden flecks scattered through the corona zone.
    float fleck = step(0.955, noise(vec2(ang * 48.0, r * 30.0)))
                * smoothstep(uPupil + 0.42, uPupil + 0.1, r)
                * smoothstep(uPupil - 0.02, uPupil + 0.06, r);
    col += fleck * vec3(0.85, 0.62, 0.22);

    // Limbal ring + shadow falling into the pupil.
    col *= 1.0 - 0.7 * smoothstep(0.72, 0.94, r);
    col *= 0.3 + 0.7 * smoothstep(uPupil, uPupil + 0.16, r);

    // Embers, not a rainbow: gently cycle warmth across the fibres.
    float hueDrift = sin(uTime * 0.18 + ang * 2.0) * 0.5 + 0.5;
    col *= mix(vec3(1.04, 0.99, 0.94), vec3(0.95, 1.0, 1.07), hueDrift);

    // Pupil — large, soft-edged like a macro photograph.
    float pupilMask = smoothstep(uPupil - 0.03, uPupil + 0.025, r);
    col *= pupilMask;

    // Dissolve from the inside out, eaten by noise.
    float diss = smoothstep(uDissolve - 0.32 + macro * 0.22, uDissolve + macro * 0.22, r + 0.18);
    col *= 1.0 + uDissolve * 0.7; // brightens like embers as it goes

    float alpha = edgeMask * diss * uAlpha;
    if (alpha <= 0.002) discard;
    gl_FragColor = vec4(col * 0.92, alpha);
  }
`;

export class Iris {
  constructor({ petals = 8, size = 2.3 } = {}) {
    this.uniforms = {
      uTime: { value: 0 },
      uCore: { value: new THREE.Color('#8a6b38') },
      uMid: { value: new THREE.Color('#5d7791') },
      uEdge: { value: new THREE.Color('#27384c') },
      uPupil: { value: 0.3 },
      uDissolve: { value: 0 },
      uAlpha: { value: 0 },
      uPetals: { value: petals },
      uMouse: { value: new THREE.Vector2() },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
    this.mouseTarget = new THREE.Vector2();
  }

  setColors({ core, mid, edge }) {
    this.uniforms.uCore.value.set(core);
    this.uniforms.uMid.value.set(mid);
    this.uniforms.uEdge.value.set(edge);
  }

  setMouse(nx, ny) {
    this.mouseTarget.set(nx, ny);
  }

  update(t) {
    this.uniforms.uTime.value = t;
    this.uniforms.uMouse.value.lerp(this.mouseTarget, 0.05);
    // Pupil breathes like it is adjusting to the light.
    const breathe = Math.sin(t * 0.55) * 0.012 + Math.sin(t * 0.17) * 0.008;
    this.uniforms.uPupil.value = this.basePupil + breathe;
  }

  get basePupil() { return this._basePupil ?? 0.3; }
  set basePupil(v) { this._basePupil = v; }
}
