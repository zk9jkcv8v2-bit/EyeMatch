import * as THREE from 'three';

// Realistic natural-gemstone bead bracelet. Each stone uses a neutral
// grayscale mineral texture (mottling, veins, speckles) and gets its hue from
// material.color — so colors can shift smoothly on the GPU without ever
// regenerating a texture. On the landing the ring cycles through curated vivid
// gemstone palettes; in the reveal it locks to the colors matched from the eye.
// A faint translucent elastic cord threads the beads, just visible in the gaps.

function makeNeutralStoneTexture() {
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');

  // Neutral base; tints multiply in on top.
  ctx.fillStyle = '#bcbcbc';
  ctx.fillRect(0, 0, s, s);

  // Broad tonal zones — gives each stone an uneven, natural body.
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * s, y = Math.random() * s;
    const rad = 70 + Math.random() * 110;
    const v = 150 + Math.random() * 95;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${v},${v},${v},0.5)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }

  // Cloudy mottling — lighter and darker mineral patches, stronger contrast.
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * s, y = Math.random() * s;
    const rad = 14 + Math.random() * 56;
    const lighter = Math.random() > 0.42;
    const v = lighter ? 235 + Math.random() * 20 : 88 + Math.random() * 54;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${v},${v},${v},0.6)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }

  // Pale crystalline veins wandering across the stone.
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    let x = Math.random() * s, y = Math.random() * s;
    let a = Math.random() * Math.PI * 2;
    ctx.strokeStyle = `rgba(255,255,255,${0.16 + Math.random() * 0.2})`;
    ctx.lineWidth = 0.8 + Math.random() * 2.0;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 16 + Math.random() * 20;
    for (let k = 0; k < steps; k++) {
      a += (Math.random() - 0.5) * 1.15;
      x += Math.cos(a) * 9;
      y += Math.sin(a) * 9;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Fine dark speckles / inclusions.
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = `rgba(28,28,34,${0.08 + Math.random() * 0.16})`;
    ctx.beginPath();
    ctx.arc(Math.random() * s, Math.random() * s, 0.5 + Math.random() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeRoughnessTexture() {
  // Subtle roughness variation so highlights don't read as uniform plastic.
  const s = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7a7a7a';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 90; i++) {
    const v = 60 + Math.random() * 150;
    ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
    ctx.beginPath();
    ctx.arc(Math.random() * s, Math.random() * s, 2 + Math.random() * 12, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function toColors(palette) {
  return palette.map((hex) => new THREE.Color(hex));
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (f) => f * f * (3 - 2 * f);

export class Bracelet {
  constructor({ count = 24, radius = 1.02, slots = 5, shiftPalettes = [] } = {}) {
    this.count = count;
    this.radius = radius;
    this.slots = slots;
    this.group = new THREE.Group();
    this.gems = [];

    // Palettes for the living landing ring, pre-parsed to THREE.Color.
    this.shiftColors = shiftPalettes.map(toColors);
    this.shiftMode = false;
    this.dwell = 3.6;       // seconds a palette stays settled
    this.transition = 2.6;  // seconds to crossfade to the next

    const textures = Array.from({ length: 4 }, makeNeutralStoneTexture);
    const roughTex = makeRoughnessTexture();

    const beadR = (Math.PI * radius) / count * 0.98;
    const beadGeo = new THREE.SphereGeometry(beadR, 40, 30);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: textures[i % textures.length],
        roughnessMap: roughTex,
        roughness: 0.34,
        metalness: 0,
        clearcoat: 0.55,
        clearcoatRoughness: 0.28,
        envMapIntensity: 1.05,
        transparent: true,
        opacity: 1,
      });
      const bead = new THREE.Mesh(beadGeo, material);
      const jitter = 0.96 + ((i * 37) % 10) / 110;
      bead.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      bead.rotation.set(i * 1.7, i * 2.3, i * 0.9);
      bead.userData.baseScale = jitter;
      bead.userData.slot = (i * 7 + Math.floor(i / 5)) % slots;
      bead.userData.phase = i / count; // position around the ring
      bead.scale.setScalar(0.0001);
      this.group.add(bead);
      this.gems.push(bead);
    }

    // Subtle frosted elastic cord threading the beads — only peeks through gaps.
    const cordMat = new THREE.MeshPhysicalMaterial({
      color: 0xf3eee6,
      roughness: 0.35,
      metalness: 0,
      transmission: 0.4,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.cord = new THREE.Mesh(
      new THREE.TorusGeometry(radius, beadR * 0.18, 10, 220),
      cordMat
    );
    this.cordOpacity = 0.28;
    this.group.add(this.cord);
  }

  startColorShift() {
    this.shiftMode = true;
  }

  // Lock to a fixed set of colours (the reveal, matched to the eye).
  setColors(hexColors) {
    this.shiftMode = false;
    const colors = toColors(hexColors);
    this.gems.forEach((bead) => {
      bead.material.color.copy(colors[bead.userData.slot % colors.length]);
    });
  }

  update(t) {
    if (!this.shiftMode || this.shiftColors.length < 2) return;
    const n = this.shiftColors.length;
    const period = this.dwell + this.transition;
    const tp = ((t % (period * n)) + period * n) % (period * n);
    const idx = Math.floor(tp / period);
    const local = tp - idx * period;
    const a = this.shiftColors[idx % n];
    const b = this.shiftColors[(idx + 1) % n];

    for (const bead of this.gems) {
      // Each bead crossfades slightly offset by its position, so the new
      // colour washes around the ring like light moving over the stones.
      const lead = (bead.userData.phase - 0.5) * 0.7; // ±0.35s spread
      const f = smooth(clamp01((local - this.dwell + lead) / this.transition));
      const slot = bead.userData.slot;
      bead.material.color.copy(a[slot]).lerp(b[slot], f);
    }
  }
}
