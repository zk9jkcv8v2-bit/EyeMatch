import * as THREE from 'three';

// Polished natural-gemstone bead bracelet. Each stone uses a soft, cloudy
// grayscale mineral texture (translucent depth, gentle veining — no harsh
// noise) and takes its hue from material.color, so colors can shift smoothly
// on the GPU. The landing slowly cycles realistic eye-colour palettes; the
// reveal locks the beads to the colors matched from the eye.

// Soft, natural gemstone body: large smooth tonal clouds give translucent
// depth; a couple of faint veins; no speckle grit.
function makeGemTexture() {
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');

  // Mid base — tints multiply over this.
  ctx.fillStyle = '#aeaeae';
  ctx.fillRect(0, 0, s, s);

  // Broad soft clouds — the body of the stone, light and dark.
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * s, y = Math.random() * s;
    const rad = 60 + Math.random() * 130;
    const lighter = Math.random() > 0.45;
    const v = lighter ? 200 + Math.random() * 45 : 120 + Math.random() * 45;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${v},${v},${v},0.28)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }

  // A bright translucent core highlight — gemstone "glow from within".
  const cx = s * (0.35 + Math.random() * 0.3), cy = s * (0.3 + Math.random() * 0.3);
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.5);
  core.addColorStop(0, 'rgba(255,255,255,0.22)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, s, s);

  // A few faint, soft veins.
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    let x = Math.random() * s, y = Math.random() * s;
    let a = Math.random() * Math.PI * 2;
    ctx.strokeStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.06})`;
    ctx.lineWidth = 2 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 22; k++) {
      a += (Math.random() - 0.5) * 0.8;
      x += Math.cos(a) * 11;
      y += Math.sin(a) * 11;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function toColors(palette) {
  return palette.map((hex) => new THREE.Color(hex));
}

const smooth = (f) => f * f * (3 - 2 * f);

export class Bracelet {
  constructor({ count = 24, radius = 1.02, slots = 5, shiftPalettes = [] } = {}) {
    this.count = count;
    this.radius = radius;
    this.slots = slots;
    this.group = new THREE.Group();
    this.gems = [];

    this.shiftColors = shiftPalettes.map(toColors);
    this.shiftMode = false;
    this.dwell = 4.5;       // seconds a palette stays settled
    this.transition = 3.0;  // seconds to crossfade to the next eye colour

    const textures = Array.from({ length: 5 }, makeGemTexture);

    const beadR = (Math.PI * radius) / count * 0.98;
    const beadGeo = new THREE.SphereGeometry(beadR, 48, 36);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: textures[i % textures.length],
        roughness: 0.13,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        ior: 1.6,
        specularIntensity: 1,
        envMapIntensity: 1.7,
        sheen: 0.4,
        sheenRoughness: 0.5,
        sheenColor: new THREE.Color(0xffffff),
      });
      const bead = new THREE.Mesh(beadGeo, material);
      const jitter = 0.97 + ((i * 37) % 10) / 130;
      bead.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      bead.rotation.set(i * 1.7, i * 2.3, i * 0.9);
      bead.userData.baseScale = jitter;
      bead.userData.slot = (i * 7 + Math.floor(i / 5)) % slots;
      bead.scale.setScalar(0.0001);
      this.group.add(bead);
      this.gems.push(bead);
    }
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

  // Cohesive, slow crossfade through the eye-colour palettes.
  update(t) {
    if (!this.shiftMode || this.shiftColors.length < 2) return;
    const n = this.shiftColors.length;
    const period = this.dwell + this.transition;
    const tp = ((t % (period * n)) + period * n) % (period * n);
    const idx = Math.floor(tp / period);
    const local = tp - idx * period;
    const a = this.shiftColors[idx % n];
    const b = this.shiftColors[(idx + 1) % n];
    const f = smooth(Math.min(1, Math.max(0, (local - this.dwell) / this.transition)));
    for (const bead of this.gems) {
      const slot = bead.userData.slot;
      bead.material.color.copy(a[slot]).lerp(b[slot], f);
    }
  }
}
