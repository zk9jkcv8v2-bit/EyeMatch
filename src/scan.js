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

// Sample an annulus around the image centre (where the iris sits when the eye
// is framed), reject pupil/lash darkness, sclera/specular brightness and skin
// tones where possible, and return the dominant believable iris color.
export function extractIrisColor(canvas) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const data = ctx.getImageData(0, 0, size, size).data;
  const cx = size / 2, cy = size / 2;
  const rInner = size * 0.06, rOuter = size * 0.3;

  const buckets = new Array(24).fill(null).map(() => ({ w: 0, r: 0, g: 0, b: 0, n: 0 }));
  let greyAcc = { w: 0, r: 0, g: 0, b: 0, n: 0 };

  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < rInner || dist > rOuter) continue;
      const i = (y * size + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const { h, s, l } = rgbToHsl(r, g, b);
      if (l < 0.07 || l > 0.88) continue; // pupil / specular / sclera
      if (s < 0.1) {
        greyAcc.w += 1; greyAcc.r += r; greyAcc.g += g; greyAcc.b += b; greyAcc.n++;
        continue;
      }
      const bucket = buckets[Math.floor(h / 15) % 24];
      const weight = s * (1 - Math.abs(l - 0.42)); // favor saturated mid-tones
      bucket.w += weight;
      bucket.r += r * weight; bucket.g += g * weight; bucket.b += b * weight;
      bucket.n++;
    }
  }

  let best = null;
  for (const bucket of buckets) {
    if (bucket.n > 30 && (!best || bucket.w > best.w)) best = bucket;
  }
  if (!best || (greyAcc.w > best.w * 2.2 && greyAcc.n > 200)) best = greyAcc.n ? greyAcc : best;
  if (!best || !best.n) return null;

  const r = Math.round(best.r / best.w), g = Math.round(best.g / best.w), b = Math.round(best.b / best.w);
  return { ...rgbToHsl(r, g, b) };
}

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
  else if (h >= 165 && h <= 265) category = 'blue';
  else if (h >= 62 && h < 165) category = 'green';
  else if (h >= 28 && h < 62 && l > 0.4) category = 'hazel';
  else category = 'brown';
  const stone = STONES[category][l > 0.42 ? 0 : 1];
  return { category, stone };
}

// Build everything the 3D scene needs from one sampled color: a 5-stone bead
// palette and the iris shader ramp — all variations of the *actual* eye.
export function buildMatch(hsl) {
  const { category, stone } = classify(hsl);
  const h = hsl.h;
  const s = Math.min(0.62, Math.max(0.24, hsl.s * 1.35));
  const l = Math.min(0.6, Math.max(0.3, hsl.l * 1.1));

  const gems = [
    hslToHex(h, s, Math.min(0.62, l + 0.14)),
    hslToHex(h - 9, s * 0.92, l + 0.08),
    hslToHex(h, s, l),
    hslToHex(h + 10, s * 1.05, l - 0.1),
    hslToHex(h + 4, s * 0.85, Math.max(0.16, l - 0.2)),
  ];

  const iris = {
    core: hslToHex(38, Math.min(0.5, 0.3 + s * 0.3), 0.38), // amber corona, always warm
    mid: hslToHex(h, s, l),
    edge: hslToHex(h - 8, s * 0.9, Math.max(0.12, l - 0.24)),
  };

  return { category, stone, gems, iris, baseHex: hslToHex(h, hsl.s, hsl.l) };
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
