import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Photoreal macro iris. Anatomy modelled directly: a round limbus, a wavy
// collarette dividing the warm pupillary zone from the cooler ciliary zone,
// crypts along the collarette, radial trabeculae (fibres), concentric
// contraction furrows near the rim, a dark limbal ring, and a catchlight.
// uShape blends from a true circle (0, realistic) to the brand petal (1).
const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform float uTime;
  uniform vec3 uCore;       // warm pupillary-zone colour
  uniform vec3 uMid;        // main iris colour
  uniform vec3 uEdge;       // outer / limbal colour
  uniform float uPupil;
  uniform float uDissolve;
  uniform float uAlpha;
  uniform float uPetals;
  uniform float uShape;     // 0 = circle, 1 = brand petal
  uniform vec2 uMouse;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123); }
  float noise(vec2 p){
    vec2 i=floor(p), f=fract(p);
    vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
               mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
  }
  float fbm(vec2 p){
    float v=0.0, a=0.5;
    for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.02; a*=0.5; }
    return v;
  }

  void main(){
    vec2 p = vUv*2.0 - 1.0;
    p += uMouse*0.03*smoothstep(0.1,0.9,length(p));
    float r = length(p);
    float ang = atan(p.y, p.x);

    // silhouette: round limbus (or brand petal when uShape→1)
    float petal = 0.86 + 0.115*pow(0.5+0.5*cos(ang*uPetals),1.35);
    float edge = mix(0.985, petal, uShape);
    float edgeMask = 1.0 - smoothstep(edge-0.02, edge, r);
    if(edgeMask <= 0.001) discard;

    float drift = uTime*0.025;
    float rs = r - uDissolve*0.35;

    // organic angular warp so nothing looks lathe-perfect
    float warp = (fbm(vec2(ang*3.0, r*2.5)+drift)-0.5)*0.5;
    float a2 = ang + warp;

    // radial trabeculae — fine fibres stretched from centre outward
    float fibreHi = noise(vec2(a2*150.0, rs*7.0));
    float fibreLo = fbm(vec2(a2*46.0, rs*9.0));
    float fibre = fibreHi*0.5 + fibreLo*0.62;

    // collarette: wavy ring between pupillary and ciliary zones
    float collR = 0.42 + 0.04*sin(ang*9.0 + fbm(vec2(ang*4.0,3.0))*5.0);
    float inner = smoothstep(collR+0.02, collR-0.02, r); // 1 inside collarette

    // crypts: dark rhomboid openings clustered just outside the collarette
    float cryptN = noise(vec2(a2*26.0, r*15.0));
    float cryptBand = smoothstep(0.09, 0.0, abs(r - collR - 0.04));
    float crypts = smoothstep(0.55, 0.82, cryptN) * cryptBand;

    // contraction furrows: faint concentric folds toward the rim
    float furrow = sin(r*52.0 + fbm(vec2(ang*6.0, r*4.0))*6.0)*0.5 + 0.5;
    furrow = mix(1.0, furrow, smoothstep(0.5,0.86,r)*0.55);

    // base colour by zone
    vec3 col = mix(uMid, uEdge, smoothstep(collR, 0.94, r));
    col = mix(col, uCore, inner*0.55);
    col *= 0.5 + fibre*0.85;
    col *= furrow;
    col *= 1.0 - crypts*0.7;

    // warm flecks near the collarette
    float fleck = step(0.965, noise(vec2(a2*64.0, r*42.0))) * inner;
    col += fleck * vec3(0.7,0.5,0.22);

    // dark limbal ring
    col *= 1.0 - 0.78*smoothstep(0.84, 0.965, r);
    // gentle doming
    col *= 1.06 - 0.26*r;

    // pupil — deep, near-round with the faintest irregularity, soft collar
    float pupilEdge = uPupil + 0.004*sin(ang*5.0 + 1.0) + (fbm(vec2(ang*6.0, 9.0))-0.5)*0.01;
    float pupilMask = smoothstep(pupilEdge-0.02, pupilEdge+0.02, r);
    col *= pupilMask;
    col *= 0.5 + 0.5*smoothstep(pupilEdge, pupilEdge+0.13, r);

    // embers shimmer
    float hueDrift = sin(uTime*0.16 + ang*2.0)*0.5+0.5;
    col *= mix(vec3(1.03,0.99,0.95), vec3(0.96,1.0,1.06), hueDrift);

    // catchlight — a single soft specular reflection, upper-left
    float cl = length(p - vec2(-0.26, 0.30));
    col += smoothstep(0.12,0.0,cl)*0.7;

    // dissolve from the inside out (fibres stream into beads)
    float diss = smoothstep(uDissolve-0.32 + fibreLo*0.22, uDissolve + fibreLo*0.22, r+0.18);
    col *= 1.0 + uDissolve*0.6;

    float alpha = edgeMask * diss * uAlpha;
    if(alpha <= 0.002) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

export class Iris {
  constructor({ petals = 8, size = 2.3, shape = 0 } = {}) {
    this.uniforms = {
      uTime: { value: 0 },
      uCore: { value: new THREE.Color('#8a6b38') },
      uMid: { value: new THREE.Color('#5d7791') },
      uEdge: { value: new THREE.Color('#27384c') },
      uPupil: { value: 0.3 },
      uDissolve: { value: 0 },
      uAlpha: { value: 0 },
      uPetals: { value: petals },
      uShape: { value: shape },
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
    const breathe = Math.sin(t * 0.55) * 0.012 + Math.sin(t * 0.17) * 0.008;
    this.uniforms.uPupil.value = this.basePupil + breathe;
  }

  get basePupil() { return this._basePupil ?? 0.3; }
  set basePupil(v) { this._basePupil = v; }
}
