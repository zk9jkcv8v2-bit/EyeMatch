import * as THREE from 'three';

// Realistic natural-gemstone bead bracelet. Each stone uses a neutral
// grayscale mineral texture (mottling, veins, speckles) and gets its hue from
// material.color — so colors can shift smoothly on the GPU without ever
// regenerating a texture. On the landing the ring cycles through curated vivid
// gemstone palettes; in the reveal it locks to the colors matched from the eye.

function makeNeutralStoneTexture() {
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');

  // Bright neutral base so tints read vivid once multiplied in.
  ctx.fillStyle = '#c8c8c8';
  ctx.fillRect(0, 0, s, s);

  // Cloudy mottling — lighter and darker mineral patches.
  for (let i = 0; i < 48; i++) {
    const x = Math.random() * s, y = Math.random() * s;
    const rad = 18 + Math.random() * 64;
    const lighter = Math.random() > 0.45;
    const v = lighter ? 235 + Math.random() * 20 : 120 + Math.random() * 50;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${v},${v},${v},0.4)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }

  // Pale crystalline veins wandering across the stone.
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    let x = Math.random() * s, y = Math.random() * s;
    let a = Math.random() * Math.PI * 2;
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + Math.random() * 0.16})`;
    ctx.lineWidth = 0.8 + Math.random() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 14 + Math.random() * 18;
    for (let k = 0; k < steps; k++) {
      a += (Math.random() - 0.5) * 1.1;
      x += Math.cos(a) * 9;
      y += Math.sin(a) * 9;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Fine dark speckles.
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(40,40,46,${0.06 + Math.random() * 0.12})`;
    ctx.beginPath();
    ctx.arc(Math.random() * s, Math.random() * s, 0.5 + Math.random() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function toColors(palette) {
  return palette.map((hex) => new THREE.Color(hex));
}

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
    this.shiftPeriod = 4.6;

    // A few neutral textures shared across beads for natural variety.
    const textures = Array.from({ length: 4 }, makeNeutralStoneTexture);

    const beadR = (Math.PI * radius) / count * 0.98;
    const beadGeo = new THREE.SphereGeometry(beadR, 36, 28);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: textures[i % textures.length],
        roughness: 0.2,
        metalness: 0,
        clearcoat: 0.9,
        clearcoatRoughness: 0.2,
        envMapIntensity: 1.0,
        transparent: true,
        opacity: 1,
      });
      const bead = new THREE.Mesh(beadGeo, material);
      const jitter = 0.96 + ((i * 37) % 10) / 110;
      bead.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      bead.rotation.set(i * 1.7, i * 2.3, i * 0.9);
      bead.userData.baseScale = jitter;
      // Deterministic, non-repeating colour slot so neighbours differ.
      bead.userData.slot = (i * 7 + Math.floor(i / 5)) % slots;
      bead.scale.setScalar(0.0001);
      this.group.add(bead);
      this.gems.push(bead);
    }
  }

  // Living landing ring — continuously morph between vivid palettes.
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
    const segT = t / this.shiftPeriod;
    const i0 = Math.floor(segT) % n;
    const i1 = (i0 + 1) % n;
    let f = segT - Math.floor(segT);
    f = f * f * (3 - 2 * f); // smoothstep ease
    const a = this.shiftColors[i0];
    const b = this.shiftColors[i1];
    for (const bead of this.gems) {
      const slot = bead.userData.slot;
      bead.material.color.copy(a[slot]).lerp(b[slot], f);
    }
  }
}
