// Colour → physical bead matching.
//
// Maps each generated EyeMatch palette colour to the closest AVAILABLE bead in
// the physical inventory, using perceptual colour distance (CIE Lab +
// CIEDE2000) rather than raw RGB distance. Everything here is pure and
// deterministic: no Math.random, no DOM, no network — same inputs always
// produce the same matches, so results are directly testable.
//
// Matches are returned WITH their distance score (deltaE). Bad matches are
// never hidden — callers can inspect quality and decide what is acceptable.
// Rough CIEDE2000 intuition: <1 imperceptible, 1–2 barely perceptible,
// 2–10 perceptible, >10 clearly a different colour.

/* ---------- sRGB hex → CIE Lab (D65 reference white) ---------- */

function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function hexToLab(hex) {
  const r = srgbToLinear(parseInt(hex.slice(1, 3), 16));
  const g = srgbToLinear(parseInt(hex.slice(3, 5), 16));
  const b = srgbToLinear(parseInt(hex.slice(5, 7), 16));

  // linear sRGB → XYZ (D65)
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;

  // XYZ → Lab
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f(x / 0.95047), fy = f(y / 1.0), fz = f(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/* ---------- CIEDE2000 colour difference ---------- */

const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function deltaE2000(lab1, lab2) {
  const [L1, a1, b1] = lab1, [L2, a2, b2] = lab2;

  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1p = C1p === 0 ? 0 : (deg(Math.atan2(b1, a1p)) + 360) % 360;
  const h2p = C2p === 0 ? 0 : (deg(Math.atan2(b2, a2p)) + 360) % 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp;
  if (C1p * C2p === 0) dhp = 0;
  else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
  else dhp = h2p - h1p > 180 ? h2p - h1p - 360 : h2p - h1p + 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp) / 2);

  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp;
  if (C1p * C2p === 0) hbp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
  else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;

  const T = 1
    - 0.17 * Math.cos(rad(hbp - 30))
    + 0.24 * Math.cos(rad(2 * hbp))
    + 0.32 * Math.cos(rad(3 * hbp + 6))
    - 0.20 * Math.cos(rad(4 * hbp - 63));
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;

  return Math.sqrt(
    (dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2
    + Rt * (dCp / Sc) * (dHp / Sh)
  );
}

/* ---------- matching ---------- */

// Match one desired colour against the given beads (assumed pre-filtered to
// ACTIVE only — see inventory.activeBeads). Deterministic tie-break: lower
// deltaE first, then lexicographically smaller SKU.
export function matchColorToBead(desiredHex, beads) {
  if (!beads.length) throw new Error('matchColorToBead: no beads to match against');
  const desired = hexToLab(desiredHex);
  let best = null;
  for (const bead of beads) {
    const dE = deltaE2000(desired, hexToLab(bead.hex));
    if (!best || dE < best.deltaE - 1e-9
      || (Math.abs(dE - best.deltaE) <= 1e-9 && bead.sku < best.sku)) {
      best = { desiredHex, sku: bead.sku, beadHex: bead.hex, beadName: bead.name, deltaE: dE };
    }
  }
  return best;
}

// Match a whole generated palette (array of hex strings), preserving order —
// result[i] corresponds to palette slot i.
export function matchPaletteToBeads(paletteHexes, beads) {
  return paletteHexes.map((hex) => matchColorToBead(hex, beads));
}
