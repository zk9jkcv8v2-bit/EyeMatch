// Verification of the domain layer + Measured Palette V1 — no test framework.
// Run:  node scripts/verify-domain.mjs   (exits non-zero on any failure)
//
// Uses synthetic iris "photos" (fake canvases) pushed through the REAL
// pipeline: sampling → Lab clustering → matching → weighted recipe.

import { hexToLab, labToHex, deltaE2000, matchColorToBead } from '../src/domain/match.js';
import { BEAD_INVENTORY, activeBeads, INVENTORY_STATUS } from '../src/domain/inventory.js';
import { buildDesign, allocateQuantities, newDesignId, sequenceHexes } from '../src/domain/recipe.js';
import { buildWeightedSequence, ARRANGEMENTS } from '../src/domain/patterns.js';
import { extractMeasuredPalette, classifyPalette } from '../src/scan.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
}
const near = (a, b, eps = 0.0001) => Math.abs(a - b) < eps;

/* ---------------- synthetic iris fixtures ---------------- */
// A fake 480×480 "photo": dark pupil to 15% radius, iris sectors 15–50%,
// sclera beyond. `sectors` = [[hex, fraction], …] angular slices.
const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function irisCanvas(sectors, { irisHex = null, scleraHex = '#ece7e0', pupilHex = '#0c0a09' } = {}) {
  const size = 480, R = size / 2;
  const data = new Uint8ClampedArray(size * size * 4);
  const cum = [];
  let acc = 0;
  for (const [hx, f] of sectors) { acc += f; cum.push([hex2rgb(hx), acc]); }
  const pupil = hex2rgb(pupilHex), sclera = hex2rgb(scleraHex);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - R, dy = y - R;
      const r = Math.sqrt(dx * dx + dy * dy) / R;
      const angFrac = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
      let px;
      if (r < 0.15) px = pupil;
      else if (r < 0.5) {
        px = irisHex ? hex2rgb(irisHex) : cum.find(([, c]) => angFrac <= c + 1e-9)[0];
      } else px = sclera;
      const i = (y * size + x) * 4;
      data[i] = px[0]; data[i + 1] = px[1]; data[i + 2] = px[2]; data[i + 3] = 255;
    }
  }
  return { width: size, getContext: () => ({ getImageData: () => ({ data }) }) };
}
const qVector = (design) => {
  const v = {};
  for (const [sku, n] of Object.entries(design.physical.quantities)) v[sku] = n / design.physical.beadCount;
  return v;
};
const qL1 = (a, b) => {
  const skus = new Set([...Object.keys(a), ...Object.keys(b)]);
  let d = 0;
  for (const s of skus) d += Math.abs((a[s] ?? 0) - (b[s] ?? 0));
  return d;
};
// mean over p1 of the nearest ΔE into p2 (palette dissimilarity)
const paletteDist = (p1, p2) => {
  const one = (a, b) => a.reduce((acc, e) => acc + Math.min(...b.map((f) => deltaE2000(e.lab, f.lab))), 0) / a.length;
  return Math.max(one(p1, p2), one(p2, p1));
};
const design = (palette, arrangement = 'dusk', size = 'M', id = 'EM-TST-AAAAAA') =>
  buildDesign({
    measuredPalette: palette, classification: classifyPalette(palette),
    arrangement, size, designId: id, now: () => '2026-08-04T00:00:00.000Z',
  });

/* ---- 1. CIEDE2000 against published test vectors (Sharma et al., 2005) ---- */
for (const [lab1, lab2, expected] of [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 2.8361, -74.0200], [50, 0, -82.7485], 3.4412],
]) check(`deltaE2000(${expected})`, near(deltaE2000(lab1, lab2), expected));
check('labToHex inverts hexToLab', labToHex(hexToLab('#8fa9bc')) === '#8fa9bc');

/* ---- 2. Physical Inventory V1 invariants ---- */
const V1_SKUS = ['B001', 'B002', 'B003', 'B004', 'B005', 'B006'];
const active = activeBeads();
check('inventory status is physical V1', INVENTORY_STATUS === 'PHYSICAL_V1_APPROXIMATE_COLORS');
check('active SKUs are exactly B001–B006',
  JSON.stringify(active.map((b) => b.sku).sort()) === JSON.stringify(V1_SKUS));
check('all active beads are nominally 6 mm', active.every((b) => b.diameterMm === 6));
check('supplierRef is null everywhere', BEAD_INVENTORY.every((b) => b.supplierRef === null));

/* ---- 3. REAL-FAILURE REGRESSION: multicolor gold/olive/taupe/brown iris ---- */
const MULTI = [['#c9a95c', 0.3], ['#8a8a4f', 0.25], ['#a89478', 0.25], ['#6b4a2f', 0.2]];
const multiRes = extractMeasuredPalette(irisCanvas(MULTI));
check('multicolor iris: extraction succeeds', multiRes.ok, multiRes.reason);
const mp = multiRes.palette;
check('multicolor iris: ≥3 distinct measured colours', mp.length >= 3, `got ${mp.length}`);
check('multicolor iris: entries are perceptually distinct (pairwise ΔE > 8)',
  mp.every((a, i) => mp.every((b, j) => i === j || deltaE2000(a.lab, b.lab) > 8)));
check('multicolor iris: weights normalize to 1',
  near(mp.reduce((a, p) => a + p.weight, 0), 1, 0.01));
// verify the ACTUAL colour relationships, not a hardcoded diversity quota:
const nearest = (hx) => matchColorToBead(hx, active).sku;
check('gold sector maps toward B005', nearest('#c9a95c') === 'B005');
check('olive sector maps toward B004/B002', ['B004', 'B002'].includes(nearest('#8a8a4f')));
check('taupe/brown sectors map toward B006/B001',
  ['B006', 'B001'].includes(nearest('#a89478')) && ['B006', 'B001'].includes(nearest('#6b4a2f')));
const dMulti = design(mp);
const skusUsed = Object.keys(dMulti.physical.quantities);
check('multicolor recipe uses ≥3 SKUs (supported by true matches)',
  skusUsed.length >= 3, `got ${skusUsed.join(',')}`);
check('multicolor recipe is NOT ≥75% one SKU (old failure mode)',
  Math.max(...Object.values(dMulti.physical.quantities)) / dMulti.physical.beadCount < 0.75);

/* ---- 4. PERSONALIZATION: category no longer determines the bracelet ---- */
// A/B: gold-dominant vs green-dominant hazel — may share a category, must differ.
const goldHazel = extractMeasuredPalette(irisCanvas([['#c9a95c', 0.5], ['#8a8a4f', 0.15], ['#a89478', 0.2], ['#6b4a2f', 0.15]]));
const greenHazel = extractMeasuredPalette(irisCanvas([['#8a8a4f', 0.5], ['#c9a95c', 0.15], ['#a89478', 0.2], ['#6b4a2f', 0.15]]));
check('hazel A and B both extract', goldHazel.ok && greenHazel.ok);
const dGold = design(goldHazel.palette), dGreen = design(greenHazel.palette);
check('hazel A vs B: measured palettes measurably differ or weights shift',
  paletteDist(goldHazel.palette, greenHazel.palette) > 2
  || qL1(qVector(dGold), qVector(dGreen)) > 0.2);
check('hazel A vs B: physical quantity vectors differ (L1 > 0.2)',
  qL1(qVector(dGold), qVector(dGreen)) > 0.2,
  `L1=${qL1(qVector(dGold), qVector(dGreen)).toFixed(2)}`);
// C/D: blue-grey vs saturated blue.
const blueGrey = extractMeasuredPalette(irisCanvas([['#8fa4b5', 0.5], ['#7d8894', 0.3], ['#9fb2c0', 0.2]]));
const satBlue = extractMeasuredPalette(irisCanvas([['#4a7ec0', 0.5], ['#35619e', 0.3], ['#6b9fd4', 0.2]]));
check('blue C and D both extract', blueGrey.ok && satBlue.ok);
const dBG = design(blueGrey.palette), dSB = design(satBlue.palette);
check('blue C vs D: measured palettes measurably differ (dist > 5)',
  paletteDist(blueGrey.palette, satBlue.palette) > 5,
  `dist=${paletteDist(blueGrey.palette, satBlue.palette).toFixed(1)}`);
// With V1 inventory both may honestly collapse to B003 (the only blue family).
// The requirement is that identical recipes are only ever an INVENTORY
// limitation — i.e. every measured colour of both eyes genuinely nearest-
// matches the same SKUs — never a pipeline that ignored the measurement.
const identicalRecipes = JSON.stringify(dBG.physical.quantities) === JSON.stringify(dSB.physical.quantities);
check('blue C vs D: identical recipes only if true matches coincide',
  !identicalRecipes
  || [...blueGrey.palette, ...satBlue.palette].every((p) => nearest(p.hex) === 'B003'),
  JSON.stringify([dBG.physical.quantities, dSB.physical.quantities]));

/* ---- 5. QUALITY GATES / CONTAMINATION ---- */
const black = extractMeasuredPalette(irisCanvas([], { irisHex: '#0a0a0a', scleraHex: '#0a0a0a', pupilHex: '#0a0a0a' }));
check('all-dark capture → retake (insufficient)', !black.ok && black.reason === 'insufficient-samples');
const glare = extractMeasuredPalette(irisCanvas([], { irisHex: '#f4f2ee' }));
check('bright specular/sclera flood → retake', !glare.ok, glare.reason);
const greyGlare = extractMeasuredPalette(irisCanvas([['#d9d9d5', 0.7], ['#5a4a3a', 0.3]]));
check('mostly pale-neutral ring → retake (cluster contamination)',
  !greyGlare.ok && greyGlare.reason === 'contaminated', greyGlare.reason ?? 'ok?!');
// warm gold must SURVIVE (the old skin filter wrongly deleted it):
const goldEye = extractMeasuredPalette(irisCanvas([['#c9a95c', 0.7], ['#6b4a2f', 0.3]]));
check('warm gold iris survives extraction', goldEye.ok);
const goldEntry = goldEye.ok && goldEye.palette.find((p) => p.lab[2] > 20 && p.lab[0] > 55);
check('gold entry present with dominant weight', !!goldEntry && goldEntry.weight > 0.4,
  goldEye.ok ? JSON.stringify(goldEye.palette.map((p) => [p.hex, p.weight])) : goldEye.reason);
const uniform = extractMeasuredPalette(irisCanvas([], { irisHex: '#6b7d66' }));
check('genuinely uniform iris → 1 colour (diversity never faked)',
  uniform.ok && uniform.palette.length === 1);

/* ---- 6. DETERMINISM ---- */
const again = extractMeasuredPalette(irisCanvas(MULTI));
check('same image → identical measured palette',
  JSON.stringify(again.palette) === JSON.stringify(mp));
check('same inputs → identical design JSON',
  JSON.stringify(design(mp)) === JSON.stringify(design(mp)));

/* ---- 7. PATTERNS: exact quantities, identity properties, seeded wild ---- */
for (const p of ARRANGEMENTS) {
  const d = design(mp, p);
  const counted = {};
  d.physical.sequence.forEach((sku) => { counted[sku] = (counted[sku] ?? 0) + 1; });
  const sortEntries = (o) => JSON.stringify(Object.entries(o).sort((a, b) => a[0].localeCompare(b[0])));
  check(`'${p}': sequence multiset equals quantities`,
    sortEntries(counted) === sortEntries(d.physical.quantities));
}
const dDusk = design(mp, 'dusk');
const hexSeq = sequenceHexes(dDusk);
const heights = dDusk.physical.sequence.map((_, i) => (Math.sin((i / 24) * Math.PI * 2) + 1) / 2);
const lOf = (h) => hexToLab(h)[0];
const topL = hexSeq.filter((_, i) => heights[i] > 0.5).reduce((a, h) => a + lOf(h), 0) / hexSeq.filter((_, i) => heights[i] > 0.5).length;
const botL = hexSeq.filter((_, i) => heights[i] <= 0.5).reduce((a, h) => a + lOf(h), 0) / hexSeq.filter((_, i) => heights[i] <= 0.5).length;
check('dusk: top of wrist is lighter than bottom', topL > botL, `${topL.toFixed(0)} vs ${botL.toFixed(0)}`);
check('wild: same design id → same sequence',
  JSON.stringify(design(mp, 'wild', 'M', 'EM-AAA-111111').physical.sequence)
  === JSON.stringify(design(mp, 'wild', 'M', 'EM-AAA-111111').physical.sequence));
check('patterns differ from each other',
  new Set(ARRANGEMENTS.map((p) => JSON.stringify(design(mp, p).physical.sequence))).size === 3);

/* ---- 8. ALLOCATION: largest remainder ---- */
const q = allocateQuantities({ B005: 0.3, B004: 0.25, B006: 0.45 }, 24);
check('allocation sums exactly to beadCount', Object.values(q).reduce((a, b) => a + b, 0) === 24);
check('allocation ≈ proportions', q.B006 === 11 && q.B005 === 7 && q.B004 === 6, JSON.stringify(q));
check('tiny cluster may get zero beads',
  !('B002' in allocateQuantities({ B003: 0.98, B002: 0.02 }, 24)));

/* ---- 9. SCHEMA v2 / SERIALIZATION / PRIVACY / IDS / MULTI ---- */
check('schemaVersion is 2', dMulti.schemaVersion === 2);
check('design carries measuredPalette with hex/lab/weight/radialZone',
  dMulti.measuredPalette.every((p) => p.hex && p.lab?.length === 3 && p.weight > 0 && p.radialZone));
check('beadMatches carry measuredHex/sku/beadHex/deltaE/weight',
  dMulti.beadMatches.every((m) => m.measuredHex && m.sku && m.beadHex && Number.isFinite(m.deltaE) && m.weight > 0));
const json = JSON.stringify(dMulti);
check('design round-trips losslessly', JSON.stringify(JSON.parse(json)) === json);
check('no image data anywhere in the recipe', !/data:image|base64/i.test(json));
check('sequence only V1 SKUs', dMulti.physical.sequence.every((s) => V1_SKUS.includes(s)));
check('bead diameters resolve to [6]', JSON.stringify(dMulti.physical.beadDiametersMm) === '[6]');
const ids = new Set(Array.from({ length: 200 }, () => newDesignId('Aquamarine')));
check('design id format + uniqueness', ids.size === 200 && [...ids].every((id) => /^EM-AQU-[A-HJ-NP-Z2-9]{6}$/.test(id)));
const dA = design(mp, 'dusk', 'S', null);          // null → a fresh id is minted
const dB = design(goldHazel.palette, 'wild', 'L', null);
check('multi-bracelet designs stay independent',
  dA.designId !== dB.designId
  && JSON.stringify(dA.physical.quantities) !== JSON.stringify(dB.physical.quantities));

/* ---- 10. REPORT: measured palettes + recipes for the fixtures ---- */
console.log('\n--- Measured Palette V1 fixture report ---');
for (const [label, res] of [
  ['MULTICOLOR (old failure case)', multiRes], ['GOLD-HAZEL', goldHazel],
  ['GREEN-HAZEL', greenHazel], ['BLUE-GREY', blueGrey], ['SAT-BLUE', satBlue],
]) {
  if (!res.ok) { console.log(`${label}: RETAKE (${res.reason})`); continue; }
  const d = design(res.palette);
  const pal = res.palette.map((p) => `${p.hex}·${(p.weight * 100).toFixed(0)}%`).join(' ');
  const qs = Object.entries(d.physical.quantities).map(([s, n]) => `${s}×${n}`).join(' ');
  console.log(`${label}\n  palette: ${pal}\n  stone: ${d.stone} · recipe: ${qs}`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
