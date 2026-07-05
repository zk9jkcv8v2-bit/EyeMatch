// Camera handling + iris color extraction + gem palette generation.

export function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return rgbToHsl(r * 255, g * 255, b * 255);
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

export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Sample a ring where the iris sits when the eye fills the viewfinder —
// 30–40% of the frame radius. Skipping the centre entirely keeps the black
// pupil from dragging the read dark; rejecting extremes drops lashes,
// specular highlights and sclera. If the ring is too sparse (eye framed
// loosely), widen once as a fallback.
export function extractIrisColor(canvas) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const data = ctx.getImageData(0, 0, size, size).data;
  const R = size / 2;

  const sample = (rInner, rOuter) => {
    const acc = { w: 0, r: 0, g: 0, b: 0, n: 0 };
    const grey = { w: 0, r: 0, g: 0, b: 0, n: 0 };
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const dx = x - R, dy = y - R;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < rInner || dist > rOuter) continue;
        const i = (y * size + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const { h, s, l } = rgbToHsl(r, g, b);
        if (l < 0.09 || l > 0.85) continue;           // pupil / specular / sclera
        if (s > 0.3 && h >= 5 && h <= 32 && l > 0.45) continue; // skin tones
        if (s < 0.1) {
          grey.w += 1; grey.r += r; grey.g += g; grey.b += b; grey.n++;
          continue;
        }
        const weight = s * (1 - Math.abs(l - 0.42)); // favor saturated mid-tones
        acc.w += weight;
        acc.r += r * weight; acc.g += g * weight; acc.b += b * weight;
        acc.n++;
      }
    }
    return { acc, grey };
  };

  // Primary ring: 30–40% of the viewfinder radius.
  let { acc, grey } = sample(R * 0.3, R * 0.4);
  if (acc.n + grey.n < 120) ({ acc, grey } = sample(R * 0.18, R * 0.55));

  const best = grey.n > acc.n * 2.5 && grey.n > 150 ? grey : (acc.n ? acc : grey);
  if (!best.n) return null;

  const r = Math.round(best.r / best.w), g = Math.round(best.g / best.w), b = Math.round(best.b / best.w);
  return { ...rgbToHsl(r, g, b) };
}

// The only ten eyes we make: five real human eye colors, two variants each.
// Every scan resolves to one of these anchors — whatever the pixels say, the
// bracelet can never come out purple, red, or otherwise impossible.
const EYE_COLORS = {
  blue: {
    band: [195, 235],
    variants: [
      { stone: 'Aquamarine', h: 204, s: 0.44, l: 0.54 },
      { stone: 'Sapphire', h: 220, s: 0.5, l: 0.37 },
    ],
  },
  green: {
    band: [85, 150],
    variants: [
      { stone: 'Peridot', h: 92, s: 0.4, l: 0.48 },
      { stone: 'Emerald', h: 140, s: 0.44, l: 0.34 },
    ],
  },
  brown: {
    band: [24, 40],
    variants: [
      { stone: 'Citrine', h: 36, s: 0.5, l: 0.42 },
      { stone: 'Smoky Topaz', h: 28, s: 0.4, l: 0.28 },
    ],
  },
  hazel: {
    band: [38, 56],
    variants: [
      { stone: 'Golden Hazel', h: 46, s: 0.46, l: 0.46 },
      { stone: 'Hazel Mosaic', h: 40, s: 0.42, l: 0.36 },
    ],
  },
  grey: {
    band: [205, 220],
    variants: [
      { stone: 'Moonstone', h: 210, s: 0.09, l: 0.56 },
      { stone: 'Storm Quartz', h: 214, s: 0.11, l: 0.4 },
    ],
  },
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
  return { category, variant, stone: EYE_COLORS[category].variants[variant].stone };
}

// Build everything the 3D scene needs from one sampled color. The palette is
// anchored to the classified eye color; the measurement only nudges hue
// (clamped inside the category's believable band) and lightness slightly, so
// each match feels personal while staying biologically real.
export function buildMatch(hsl) {
  const { category, variant, stone } = classify(hsl);
  const anchor = EYE_COLORS[category].variants[variant];
  const [lo, hi] = EYE_COLORS[category].band;

  const h = hsl.h >= lo && hsl.h <= hi
    ? anchor.h + Math.max(-8, Math.min(8, hsl.h - anchor.h))
    : anchor.h;
  const s = category === 'grey'
    ? anchor.s
    : Math.max(anchor.s - 0.06, Math.min(anchor.s + 0.08, hsl.s));
  const l = anchor.l + Math.max(-0.05, Math.min(0.05, hsl.l - 0.45));

  const gems = [
    hslToHex(h, s, Math.min(0.62, l + 0.14)),
    hslToHex(h - 6, s * 0.92, l + 0.08),
    hslToHex(h, s, l),
    hslToHex(h + 6, s * 1.05, l - 0.1),
    hslToHex(h + 3, s * 0.85, Math.max(0.16, l - 0.2)),
  ];

  const iris = {
    core: hslToHex(38, Math.min(0.5, 0.3 + s * 0.3), 0.38), // amber corona, always warm
    mid: hslToHex(h, s, l),
    edge: hslToHex(h - 5, s * 0.9, Math.max(0.12, l - 0.24)),
  };

  return { category, variant, stone, gems, iris, baseHex: hslToHex(h, s, l) };
}

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
