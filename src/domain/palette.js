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
// NO maximum colour count. A palette is however many colours the iris
// genuinely contains: significance is decided by MIN_CLUSTER_WEIGHT (a
// perceptual/statistical criterion), never by an arbitrary cap. A uniform
// iris still yields exactly one colour — diversity is never manufactured,
// but genuine diversity is never truncated either.
const MIN_CLUSTER_WEIGHT = 0.05; // clusters below 5% of accepted pixels are noise
const MIN_SAMPLES = 500;     // fewer accepted pixels than this → retake, never guess
const MAX_CONTAMINATED = 0.45;   // if >45% of pixel weight is pruned as contamination → retake

// --- COALITION RESCUE (V2.2) ------------------------------------------------
// The blue-eye regression proved a real anatomical region can be split by the
// Lab grid into several sub-threshold clusters that are individually discarded
// even though together they clear the floor. In that photo the peri-pupillary
// gold ring survived sampling and every filter intact, formed its own clean
// cluster at 1.6%, and was then dropped — while a perceptually adjacent
// fragment sat at 3.8% right next to it (ΔE 7.7, Δradial 0.10).
//
// So: BEFORE the 5% floor is applied, sub-threshold clusters that are BOTH
// perceptually close AND in the same radial zone may form a coalition. A
// coalition of two or more whose combined weight clears the floor is admitted
// as ONE colour (its weighted mean) — the same thing clustering already does,
// applied once more with a spatial constraint.
//
// Why this rejects noise and reflections: a lone artifact has no partner, and
// a coalition of one is never rescued. Verified: every uniform-iris and
// reflection fixture produces zero sub-threshold clusters, so the rescue path
// cannot reach them at all.
//
// Constants are measured, not guessed. COALITION_DE must clear the 7.7 seen
// between the real gold fragments while staying well under the ~15-16 that
// separates genuinely different colours in the same photo. COALITION_RADIAL
// keeps a coalition inside one radial third (zones are 0.333 wide), so an
// inner ring can never coalesce with outer-iris tissue.
const COALITION_DE = 10;      // > MERGE_DE(7): related-but-distinct, never "same colour"
const COALITION_RADIAL = 0.25; // same anatomical band only
const COALITION_MIN_MEMBERS = 2;

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

  // 4. Prune contamination, then split what remains by the significance floor.
  const total = pixels.length;
  let pruned = 0;
  const strong = [], weak = [];
  for (const cl of clusters.sort((x, y) => y.n - x.n)) {
    if (isContaminant(cl.lab)) { pruned += cl.n; continue; }
    (cl.n / total < MIN_CLUSTER_WEIGHT ? weak : strong).push(cl);
  }
  diagnostics.prunedWeight = +(pruned / total).toFixed(3);
  if (pruned / total > MAX_CONTAMINATED) {
    return { ok: false, reason: 'contaminated', diagnostics };
  }

  // 4b. Coalition rescue — see the COALITION_* note above. Greedy against each
  //     coalition's running centroid (the same shape as the cell merge), so a
  //     chain of small steps can never drag a coalition far from where it
  //     started. `weak` is already ordered by weight, keeping this deterministic.
  const coalitions = [];
  for (const cl of weak) {
    let home = null;
    for (const c of coalitions) {
      if (deltaE2000(cl.lab, c.lab) <= COALITION_DE
        && Math.abs(cl.r - c.r) <= COALITION_RADIAL) { home = c; break; }
    }
    if (!home) {
      coalitions.push({ n: cl.n, lab: [...cl.lab], r: cl.r, members: 1 });
    } else {
      const t = home.n + cl.n;
      home.lab = home.lab.map((v, i) => (v * home.n + cl.lab[i] * cl.n) / t);
      home.r = (home.r * home.n + cl.r * cl.n) / t;
      home.n = t;
      home.members++;
    }
  }
  // The 5% floor stays the final safety mechanism — a coalition must clear it
  // too, and a lone fragment (an isolated reflection or speckle) never can.
  const rescued = coalitions.filter(
    (c) => c.members >= COALITION_MIN_MEMBERS && c.n / total >= MIN_CLUSTER_WEIGHT,
  );
  diagnostics.rescued = rescued.length;
  diagnostics.rescuedWeight = +(rescued.reduce((a, c) => a + c.n, 0) / total).toFixed(3);

  const kept = [...strong, ...rescued].sort((x, y) => y.n - x.n);
  if (!kept.length) {
    return { ok: false, reason: 'no-usable-color', diagnostics };
  }

  // 5. Every significant colour survives — no cap. Weights normalize over
  //    what we keep. (A genuinely uniform iris yields ONE entry; a genuinely
  //    varied iris keeps all of its colours.)
  const keptTotal = kept.reduce((a, c) => a + c.n, 0);
  const zone = (t) => (t < 1 / 3 ? 'inner' : t < 2 / 3 ? 'mid' : 'outer');
  const palette = kept.map((cl) => ({
    hex: labToHex(cl.lab),
    lab: cl.lab.map((v) => +v.toFixed(2)),
    weight: +(cl.n / keptTotal).toFixed(4),
    radialZone: zone(cl.r),
    radialMean: +cl.r.toFixed(3),
  }));
  // deterministic order: weight desc, then hex
  palette.sort((x, y) => y.weight - x.weight || (x.hex < y.hex ? -1 : 1));

  return { ok: true, palette, diagnostics };
}
