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

/* ---------------- pupil-anchored iris sampling (V2) ---------------- */
//
// The real-image audit proved a fixed frame-centred ring fails on dilated /
// off-centre pupils: it sampled the pupil itself and never reached the outer
// iris. V2 first estimates the pupil (the darkest compact disc near frame
// centre — a natural fiducial, no ML), then samples an annulus RELATIVE to
// the pupil, so the same iris is sampled consistently across dilation,
// framing and eye position. A bad pupil estimate or a starved annulus is an
// explicit retake — never a silent fallback to the old geometry.
// Pixel-level rejection stays minimal (near-black / near-white only);
// subtler judgement stays at cluster level in domain/palette.js.

// Pupil estimation constants (fractions are of the frame half-size):
const PUPIL_SEARCH = 0.6;       // search disc for dark candidates
const PUPIL_DARK_L = 10;        // L* below this = pupil-dark candidate
const PUPIL_MIN_CANDIDATES = 60; // at step-2 sampling (~240 px of pupil)
const PUPIL_MIN_R = 0.05, PUPIL_MAX_R = 0.42; // plausible pupil radius range
const PUPIL_MAX_OFFSET = 0.45;  // centroid must be near-ish frame centre
const PUPIL_MIN_FILL = 0.35;    // candidates must form a compact disc, not scattered lashes

// Iris annulus geometry:
//   inner — multiples of PUPIL radius (pupil-margin/shadow exclusion must
//           scale with dilation)
//   outer — anchored to the LIMBUS (iris/sclera boundary) when detectable,
//           so a constricted and a dilated pupil sample comparable iris
//           tissue (the §invariance requirement); falls back to a pupil
//           multiple when no sclera is visible (eye fills the whole frame).
export const ANNULUS_INNER = 1.15;          // × pupil radius
export const ANNULUS_OUTER_FALLBACK = 2.3;  // × pupil radius, when limbus unknown
export const LIMBUS_MARGIN = 0.92;          // stay inside the limbal ring
const SCLERA_L = 78, SCLERA_C = 18;         // sclera signature: bright + near-neutral
const LIMBUS_RAYS = 32, LIMBUS_MIN_RAYS = 10;

// Pixel rejection (V2.1). A specular highlight — a window/sky reflected on the
// cornea — sits INSIDE the iris and inside the annulus, so geometry alone
// cannot exclude it. It cannot be excluded by an absolute lightness rule
// either: a light-grey or light-blue iris is just as bright as a highlight
// (both L*≈76), and an absolute cut deletes those irises entirely.
// What separates them is brightness RELATIVE to this iris plus chroma —
// a highlight is much lighter than its own iris and washed out, while real
// bright iris tissue (gold) carries strong chroma. Hence:
//   reject if  L* > medianL + SPECULAR_DELTA_L  AND  C* < SPECULAR_MAX_C
// This is what stops a reflection from becoming a physical bead colour
// (verified: brown iris + reflection no longer yields a blue-grey B003 bead).
const DARK_L = 15;              // pupil margin + eyelash (lashes survive L*12)
const BRIGHT_L = 88;            // absolute blow-out
const SPECULAR_DELTA_L = 22;    // "much lighter than this iris"
const SPECULAR_MAX_C = 25;      // real bright iris tissue carries more chroma

// Deterministic limbus estimate: march rays outward from the pupil centre
// until a sustained sclera-signature run; median over rays. Returns null when
// too few rays find sclera (eye fills the frame, heavy occlusion).
export function estimateLimbus(data, size, pupil) {
  const found = [];
  for (let k = 0; k < LIMBUS_RAYS; k++) {
    const a = (k / LIMBUS_RAYS) * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    let run = 0;
    for (let d = pupil.radius * 1.3; ; d += 2) {
      const x = Math.round(pupil.cx + dx * d), y = Math.round(pupil.cy + dy * d);
      if (x < 0 || y < 0 || x >= size || y >= size) break;
      const i = (y * size + x) * 4;
      const lab = rgbToLab(data[i], data[i + 1], data[i + 2]);
      if (lab[0] > SCLERA_L && Math.hypot(lab[1], lab[2]) < SCLERA_C) {
        if (++run >= 3) { found.push(d - 4); break; }
      } else run = 0;
    }
  }
  if (found.length < LIMBUS_MIN_RAYS) return null;
  found.sort((a, b) => a - b);
  return found[Math.floor(found.length / 2)];
}

// Deterministic pupil estimate: centroid + p95-radius of very-dark pixels
// near frame centre, with plausibility gates. Returns {ok:false, reason}
// when no believable pupil exists (blank frames, lash scatter, all-dark).
export function estimatePupil(canvas) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const data = ctx.getImageData(0, 0, size, size).data;
  const R = size / 2;

  let sx = 0, sy = 0, n = 0;
  const xs = [], ys = [];
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const dx = x - R, dy = y - R;
      if (Math.sqrt(dx * dx + dy * dy) / R > PUPIL_SEARCH) continue;
      const i = (y * size + x) * 4;
      const [L] = rgbToLab(data[i], data[i + 1], data[i + 2]);
      if (L >= PUPIL_DARK_L) continue;
      sx += x; sy += y; n++; xs.push(x); ys.push(y);
    }
  }
  if (n < PUPIL_MIN_CANDIDATES) return { ok: false, reason: 'no-pupil' };

  const cx = sx / n, cy = sy / n;
  if (Math.hypot(cx - R, cy - R) / R > PUPIL_MAX_OFFSET) return { ok: false, reason: 'no-pupil' };

  const dists = xs.map((x, i) => Math.hypot(x - cx, ys[i] - cy)).sort((a, b) => a - b);
  const radius = dists[Math.floor(dists.length * 0.95)];
  if (radius / R < PUPIL_MIN_R || radius / R > PUPIL_MAX_R) return { ok: false, reason: 'no-pupil' };

  // Compactness: a real pupil fills its disc; scattered lash/shadow darkness
  // doesn't. Step-2 grid ⇒ expected density is area/4.
  const fill = n / (Math.PI * radius * radius / 4);
  if (fill < PUPIL_MIN_FILL) return { ok: false, reason: 'no-pupil' };

  return { ok: true, cx, cy, radius, fill: +fill.toFixed(2), candidates: n };
}

export function sampleIrisPixels(canvas) {
  const pupil = estimatePupil(canvas);
  if (!pupil.ok) return { pixels: [], scanned: 0, pupil };

  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const data = ctx.getImageData(0, 0, size, size).data;

  const inner = pupil.radius * ANNULUS_INNER;
  const limbus = estimateLimbus(data, size, pupil);
  const outer = limbus !== null
    ? limbus * LIMBUS_MARGIN
    : pupil.radius * ANNULUS_OUTER_FALLBACK;
  // A believable iris band must remain; a pupil filling the visible iris
  // (or a false pupil) is a retake, never a guess.
  if (outer < inner + pupil.radius * 0.35) {
    return { pixels: [], scanned: 0, pupil: { ok: false, reason: 'no-iris' } };
  }
  // Pass 1 — gather the annulus and keep pixels within the absolute limits.
  // Normalized iris radius: 0 at the annulus inner edge (collarette side),
  // 1 at the outer edge (ciliary side). Meaningful anatomy, not frame math.
  const candidates = [];
  let scanned = 0;
  const x0 = Math.max(0, Math.floor(pupil.cx - outer)), x1 = Math.min(size - 1, Math.ceil(pupil.cx + outer));
  const y0 = Math.max(0, Math.floor(pupil.cy - outer)), y1 = Math.min(size - 1, Math.ceil(pupil.cy + outer));
  for (let y = y0 + (y0 % 2); y <= y1; y += 2) {
    for (let x = x0 + (x0 % 2); x <= x1; x += 2) {
      const d = Math.hypot(x - pupil.cx, y - pupil.cy);
      if (d < inner || d > outer) continue;
      scanned++;
      const i = (y * size + x) * 4;
      const lab = rgbToLab(data[i], data[i + 1], data[i + 2]);
      if (lab[0] < DARK_L || lab[0] > BRIGHT_L) continue; // pupil margin / lash · blow-out
      candidates.push({ lab, radial: Math.min(1, Math.max(0, (d - inner) / (outer - inner))) });
    }
  }

  // Pass 2 — adaptive specular rejection, measured against THIS iris's own
  // median lightness so light irises are never mistaken for highlights.
  const sortedL = candidates.map((p) => p.lab[0]).sort((a, b) => a - b);
  const medianL = sortedL.length ? sortedL[sortedL.length >> 1] : 0;
  const pixels = candidates.filter(
    (p) => !(p.lab[0] > medianL + SPECULAR_DELTA_L
      && Math.hypot(p.lab[1], p.lab[2]) < SPECULAR_MAX_C),
  );

  return {
    pixels, scanned, pupil, medianL: +medianL.toFixed(1),
    specularRejected: candidates.length - pixels.length,
    annulus: { inner: +inner.toFixed(1), outer: +outer.toFixed(1), limbus: limbus === null ? null : +limbus.toFixed(1) },
  };
}

// The one entry point the flow uses: canvas → measured palette (or retake).
export function extractMeasuredPalette(canvas) {
  const s = sampleIrisPixels(canvas);
  if (!s.pupil.ok) {
    return { ok: false, reason: s.pupil.reason, diagnostics: { pupil: s.pupil } };
  }
  const result = buildMeasuredPalette(s.pixels);
  result.diagnostics.scanned = s.scanned;
  result.diagnostics.pupil = {
    cx: +s.pupil.cx.toFixed(1), cy: +s.pupil.cy.toFixed(1),
    radius: +s.pupil.radius.toFixed(1), fill: s.pupil.fill,
  };
  result.diagnostics.annulus = s.annulus;
  result.diagnostics.medianL = s.medianL;
  result.diagnostics.specularRejected = s.specularRejected;
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
