// Personal measured palette — the heart of Measured Palette V1.
//
// Takes the accepted iris ring pixels (already converted to CIE Lab, with
// their radial position) and produces 3–5 representative colours with
// weights, by deterministic coarse Lab-grid clustering. This REPLACES the
// old single-averaged-colour → canonical-category-palette path for physical
// design generation: the bracelet is now derived from THIS iris, not from an
// eye-colour category.
//
// Everything is pure and deterministic: no Math.random, no DOM, no network.
// Same pixel list in → byte-identical palette out.
//
// ---------------------------------------------------------------------------
// TUNABLE CONSTANTS (V1 — chosen against the current sampler's density of
// ~2,500–3,200 accepted pixels per capture; revisit after physical testing)
// ---------------------------------------------------------------------------
const L_BIN = 12.5;          // Lab grid: L* bin height (8 bins over 0..100)
const AB_BIN = 12;           // Lab grid: a*/b* bin width
// MERGE_DE 10 → 7 (Sampling V2): the real-image audit proved ΔE≤10 merged
// pale gold with ochre — perceptually distinct tissue that maps to different
// physical beads (B005 vs B006). 7 preserves that distinction on the real
// regression photo while uniform fixtures still collapse to one cluster.
const MERGE_DE = 7;
const MAX_COLORS = 5;        // palette ceiling
const MIN_CLUSTER_WEIGHT = 0.05; // clusters below 5% of accepted pixels are noise
const MIN_SAMPLES = 500;     // fewer accepted pixels than this → retake, never guess
const MAX_CONTAMINATED = 0.45;   // if >45% of pixel weight is pruned as contamination → retake

import { deltaE2000, labToHex } from './match.js';

// Cluster-level contamination rules. Deliberately conservative: the old
// pixel-level skin filter wrongly deleted pale-gold IRIS pixels, so warm
// chromatic colours are never rejected here. We only prune what cannot be
// iris: glare/sclera (very light AND near-neutral) and pupil/lash residue
// (very dark). Warm gold (light but chromatic) survives both rules.
function isContaminant([L, a, b]) {
  const chroma = Math.hypot(a, b);
  if (L > 80 && chroma < 15) return true;  // sclera / specular glare
  if (L < 15) return true;                 // pupil / eyelash residue
  return false;
}

// pixels: [{ lab: [L,a,b], radial: 0..1 }] where radial is the NORMALIZED
// iris radius from scan.sampleIrisPixels — 0 at the annulus inner edge
// (collarette side), 1 at the outer edge (ciliary side). radialZone is
// descriptive metadata in thirds of that span; it never forces colours.
// Returns { ok:true, palette, diagnostics } or { ok:false, reason, diagnostics }.
// `reason` is a machine key — UI copy is the caller's job.
export function buildMeasuredPalette(pixels) {
  const diagnostics = { accepted: pixels.length, clusters: 0, prunedWeight: 0 };

  if (pixels.length < MIN_SAMPLES) {
    return { ok: false, reason: 'insufficient-samples', diagnostics };
  }

  // 1. Coarse Lab-grid histogram — a few hundred occupied cells at most.
  const cells = new Map();
  for (const { lab, radial } of pixels) {
    const key = `${Math.floor(lab[0] / L_BIN)}|${Math.floor(lab[1] / AB_BIN)}|${Math.floor(lab[2] / AB_BIN)}`;
    let c = cells.get(key);
    if (!c) { c = { n: 0, L: 0, a: 0, b: 0, r: 0 }; cells.set(key, c); }
    c.n++; c.L += lab[0]; c.a += lab[1]; c.b += lab[2]; c.r += radial;
  }

  // 2. Deterministic order: heaviest cells first (tie: key string).
  const ordered = [...cells.entries()]
    .map(([key, c]) => ({ key, n: c.n, lab: [c.L / c.n, c.a / c.n, c.b / c.n], r: c.r / c.n }))
    .sort((x, y) => y.n - x.n || (x.key < y.key ? -1 : 1));

  // 3. Greedy merge: each cell joins the first existing cluster within
  //    MERGE_DE of its running weighted mean, else founds a new cluster.
  const clusters = [];
  for (const cell of ordered) {
    let home = null;
    for (const cl of clusters) {
      if (deltaE2000(cell.lab, cl.lab) <= MERGE_DE) { home = cl; break; }
    }
    if (!home) {
      clusters.push({ n: cell.n, lab: [...cell.lab], r: cell.r });
    } else {
      const t = home.n + cell.n;
      home.lab = home.lab.map((v, i) => (v * home.n + cell.lab[i] * cell.n) / t);
      home.r = (home.r * home.n + cell.r * cell.n) / t;
      home.n = t;
    }
  }
  diagnostics.clusters = clusters.length;

  // 4. Prune contamination + noise; track how much we threw away.
  const total = pixels.length;
  let pruned = 0;
  const kept = [];
  for (const cl of clusters.sort((x, y) => y.n - x.n)) {
    if (isContaminant(cl.lab)) { pruned += cl.n; continue; }
    if (cl.n / total < MIN_CLUSTER_WEIGHT) continue; // noise: dropped from palette, not "contamination"
    kept.push(cl);
  }
  diagnostics.prunedWeight = +(pruned / total).toFixed(3);
  if (pruned / total > MAX_CONTAMINATED) {
    return { ok: false, reason: 'contaminated', diagnostics };
  }
  if (!kept.length) {
    return { ok: false, reason: 'no-usable-color', diagnostics };
  }

  // 5. Top MAX_COLORS by weight; normalize weights over what we keep.
  //    (A genuinely uniform iris yields ONE entry — diversity is never faked.)
  const top = kept.slice(0, MAX_COLORS);
  const keptTotal = top.reduce((a, c) => a + c.n, 0);
  const zone = (t) => (t < 1 / 3 ? 'inner' : t < 2 / 3 ? 'mid' : 'outer');
  const palette = top.map((cl) => ({
    hex: labToHex(cl.lab),
    lab: cl.lab.map((v) => +v.toFixed(2)),
    weight: +(cl.n / keptTotal).toFixed(4),
    radialZone: zone(cl.r),
  }));
  // deterministic order: weight desc, then hex
  palette.sort((x, y) => y.weight - x.weight || (x.hex < y.hex ? -1 : 1));

  return { ok: true, palette, diagnostics };
}
