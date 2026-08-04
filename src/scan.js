// Camera handling + iris sampling + measured-palette extraction.
//
// MEASURED-COLOR-FIRST (Measured Palette V1): the physical design is derived
// from the iris's actual measured colours (domain/palette.js). Eye-colour
// classification below is METADATA ONLY — stone naming, UI copy, iris-shader
// styling. It never creates or constrains the physical bead palette.
// (The old canonical-category-palette path was deleted; the physical catalog
// itself now guarantees the bracelet can't be an impossible colour.)

import { rgbToLab, hexToLab, labToHex } from './domain/match.js';
import { buildMeasuredPalette } from './domain/palette.js';

export function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return rgbToHsl(r, g, b);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

/* ---------------- iris ring sampling ---------------- */

// The iris ring: 30–40% of the frame radius when the eye fills the
// viewfinder. NOTE (Measured Palette V1): the ring is NEVER silently widened
// — a sparse or contaminated ring becomes an explicit retake result instead
// of a guessed colour. Pixel-level rejection is minimal by design (only
// near-black pupil/lash and very bright specular/sclera); everything subtler
// — including warm golds that a generic "skin filter" would wrongly eat —
// is judged at cluster level in domain/palette.js.
export const RING_INNER = 0.3, RING_OUTER = 0.4;

export function sampleIrisPixels(canvas) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const data = ctx.getImageData(0, 0, size, size).data;
  const R = size / 2;
  const pixels = [];
  let scanned = 0;
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const dx = x - R, dy = y - R;
      const dist = Math.sqrt(dx * dx + dy * dy) / R;
      if (dist < RING_INNER || dist > RING_OUTER) continue;
      scanned++;
      const i = (y * size + x) * 4;
      const lab = rgbToLab(data[i], data[i + 1], data[i + 2]);
      if (lab[0] < 12 || lab[0] > 88) continue; // pupil/lash dark · specular/sclera bright
      pixels.push({ lab, radial: dist });
    }
  }
  return { pixels, scanned };
}

// The one entry point the flow uses: canvas → measured palette (or retake).
export function extractMeasuredPalette(canvas) {
  const { pixels, scanned } = sampleIrisPixels(canvas);
  const result = buildMeasuredPalette(pixels, { ringInner: RING_INNER, ringOuter: RING_OUTER });
  result.diagnostics.scanned = scanned;
  return result;
}

/* ---------------- classification — METADATA ONLY ---------------- */

const STONES = {
  blue: ['Aquamarine', 'Sapphire'],
  green: ['Peridot', 'Emerald'],
  brown: ['Citrine', 'Smoky Topaz'],
  hazel: ['Golden Hazel', 'Hazel Mosaic'],
  grey: ['Moonstone', 'Storm Quartz'],
};

export function classify(hsl) {
  const { h, s, l } = hsl;
  let category;
  if (s < 0.13) category = 'grey';
  else if (h >= 165 && h <= 290) category = 'blue';   // violet reads → blue
  else if (h >= 62 && h < 165) category = 'green';
  else if (h >= 36 && h < 62 && l > 0.38) category = 'hazel';
  else category = 'brown';                            // reds, magentas, ambers → brown
  const variant = l > 0.42 ? 0 : 1;
  return { category, variant, stone: STONES[category][variant] };
}

// Classify from the measured palette's dominant colour. Used for the stone
// name, UI copy and iris-shader styling — NOT for bead selection.
export function classifyPalette(palette) {
  return classify(hexToHsl(palette[0].hex));
}

// Iris-shader colours derived from the measured palette: warm amber corona
// (brand constant), dominant measured colour mid, darkened darkest at the
// edge. Purely visual; deterministic.
export function irisColorsFor(palette) {
  const dominant = palette[0];
  const darkest = palette.reduce((a, p) => (p.lab[0] < a.lab[0] ? p : a), palette[0]);
  const [L, a, b] = darkest.lab;
  return {
    core: '#8a6b38',
    mid: dominant.hex,
    edge: labToHex([Math.max(8, L * 0.55), a * 0.9, b * 0.9]),
  };
}

/* ---------------- camera / capture (unchanged) ---------------- */

export class Scanner {
  constructor({ video, placeholder, captureCanvas }) {
    this.video = video;
    this.placeholder = placeholder;
    this.canvas = captureCanvas;
    this.stream = null;
    this.ready = false;
  }

  async start() {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.placeholder.textContent = 'CAMERA UNAVAILABLE — UPLOAD A PHOTO INSTEAD';
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 } },
        audio: false,
      });
      this.video.srcObject = this.stream;
      this.video.style.display = 'block';
      this.placeholder.style.display = 'none';
      this.ready = true;
    } catch {
      this.placeholder.textContent = 'CAMERA UNAVAILABLE — UPLOAD A PHOTO INSTEAD';
      this.video.style.display = 'none';
    }
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.ready = false;
      this.video.srcObject = null;
      this.video.style.display = 'none';
      this.placeholder.style.display = 'flex';
      this.placeholder.textContent = 'REQUESTING CAMERA…';
    }
  }

  captureFromVideo() {
    if (!this.ready || !this.video.videoWidth) return false;
    const ctx = this.canvas.getContext('2d');
    ctx.save();
    ctx.translate(this.canvas.width, 0);
    ctx.scale(-1, 1); // un-mirror
    drawCover(ctx, this.video, this.video.videoWidth, this.video.videoHeight, this.canvas.width);
    ctx.restore();
    return true;
  }

  captureFromImage(img) {
    const ctx = this.canvas.getContext('2d');
    ctx.save();
    drawCover(ctx, img, img.naturalWidth || img.width, img.naturalHeight || img.height, this.canvas.width);
    ctx.restore();
    return true;
  }
}

function drawCover(ctx, source, sw, sh, size) {
  let cw, ch, sx, sy;
  if (sw / sh > 1) { ch = sh; cw = sh; sx = (sw - cw) / 2; sy = 0; }
  else { cw = sw; ch = sw; sx = 0; sy = (sh - ch) / 2; }
  ctx.drawImage(source, sx, sy, cw, ch, 0, 0, size, size);
}
