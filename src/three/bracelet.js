import * as THREE from 'three';

// Realistic natural-gemstone bead bracelet: polished round stones strung
// snugly on a hidden elastic, like the product photo — no metal band.
// Each bead gets a procedurally generated stone texture (mottling, veins,
// speckles) tinted from the sampled iris palette.

function shiftLightness(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

function makeStoneTexture(hex) {
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, s, s);

  // Cloudy mottling — lighter and darker mineral patches.
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * s, y = Math.random() * s;
    const rad = 18 + Math.random() * 60;
    const lighter = Math.random() > 0.45;
    const tone = shiftLightness(hex, lighter ? 0.1 + Math.random() * 0.12 : -(0.08 + Math.random() * 0.1));
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `${tone}55`);
    g.addColorStop(1, `${tone}00`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }

  // Pale crystalline veins wandering across the stone.
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    let x = Math.random() * s, y = Math.random() * s;
    let a = Math.random() * Math.PI * 2;
    ctx.strokeStyle = `rgba(255,255,255,${0.07 + Math.random() * 0.12})`;
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
  for (let i = 0; i < 110; i++) {
    ctx.fillStyle = `rgba(8,10,24,${0.05 + Math.random() * 0.12})`;
    ctx.beginPath();
    ctx.arc(Math.random() * s, Math.random() * s, 0.5 + Math.random() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export class Bracelet {
  constructor({ count = 24, radius = 1.02 } = {}) {
    this.count = count;
    this.radius = radius;
    this.group = new THREE.Group();
    this.gems = [];
    this.textures = [];

    // Beads sized so neighbours touch, like stones on an elastic.
    const beadR = (Math.PI * radius) / count * 0.98;
    const beadGeo = new THREE.SphereGeometry(beadR, 36, 28);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.22,
        metalness: 0,
        clearcoat: 0.85,
        clearcoatRoughness: 0.22,
        envMapIntensity: 0.9,
        transparent: true,
        opacity: 1,
      });
      const bead = new THREE.Mesh(beadGeo, material);
      const jitter = 0.96 + ((i * 37) % 10) / 110;
      bead.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      bead.rotation.set(i * 1.7, i * 2.3, i * 0.9);
      bead.userData.baseScale = jitter;
      bead.scale.setScalar(0.0001);
      this.group.add(bead);
      this.gems.push(bead);
    }
  }

  setColors(hexColors) {
    this.textures.forEach((t) => t.dispose());
    this.textures = hexColors.map((hex) => makeStoneTexture(hex));
    // Deterministic non-repeating shuffle so colors read "mixed", not striped.
    this.gems.forEach((bead, i) => {
      const tex = this.textures[(i * 7 + Math.floor(i / 5)) % this.textures.length];
      bead.material.map = tex;
      bead.material.needsUpdate = true;
    });
  }

  update(t, dt) {
    // Polished stones don't tumble — beads stay put; life comes from the
    // group's slow rotation and the orbiting specular light.
  }
}
