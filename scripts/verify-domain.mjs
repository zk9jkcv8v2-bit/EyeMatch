// Verification of the domain layer + Pupil-Anchored Sampling V2.
// Run:  node scripts/verify-domain.mjs   (exits non-zero on any failure)
//
// Synthetic eye "photos" (fake canvases) with CONTROLLABLE PUPIL GEOMETRY are
// pushed through the REAL pipeline: pupil estimation → limbus-bounded annulus
// → Lab clustering → matching → weighted recipe.

import { hexToLab, labToHex, deltaE2000, matchColorToBead } from '../src/domain/match.js';
import { BEAD_INVENTORY, activeBeads, INVENTORY_STATUS } from '../src/domain/inventory.js';
import { buildDesign, allocateQuantities, newDesignId, sequenceHexes } from '../src/domain/recipe.js';
import { buildWeightedSequence, ARRANGEMENTS } from '../src/domain/patterns.js';
import { extractMeasuredPalette, estimatePupil, classifyPalette } from '../src/scan.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
}
const near = (a, b, eps = 0.0001) => Math.abs(a - b) < eps;

/* ---------------- synthetic eye fixtures (pupil-aware) ---------------- */
// zones: [{ tMax, sectors: [[hex, frac], …] }] where t is the normalized iris
// radius (d - pupilR)/(irisR - pupilR) from the PUPIL CENTRE. Sclera beyond
// irisR; optional eyelid skin covering the top of the frame.
const SIZE = 480;
const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function eyeCanvas({
  pupil = { cx: 240, cy: 240, r: 55 }, irisR = 190, zones = [],
  irisHex = null, scleraHex = '#ece7e0', pupilHex = '#0a0908', eyelidY = null, skinHex = '#d8b6a0',
} = {}) {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  const sclera = hex2rgb(scleraHex), pup = hex2rgb(pupilHex), skin = hex2rgb(skinHex);
  const zoneRgb = zones.map((z) => {
    let acc = 0;
    return { tMax: z.tMax, cum: z.sectors.map(([hx, f]) => [hex2rgb(hx), acc += f]) };
  });
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = Math.hypot(x - pupil.cx, y - pupil.cy);
      let px;
      if (eyelidY !== null && y < eyelidY) px = skin;
      else if (d < pupil.r) px = pup;
      else if (d < irisR) {
        if (irisHex) px = hex2rgb(irisHex);
        else {
          const t = (d - pupil.r) / (irisR - pupil.r);
          const zone = zoneRgb.find((z) => t <= z.tMax) ?? zoneRgb[zoneRgb.length - 1];
          const angFrac = (Math.atan2(y - pupil.cy, x - pupil.cx) + Math.PI) / (Math.PI * 2);
          px = (zone.cum.find(([, c]) => angFrac <= c + 1e-9) ?? zone.cum[zone.cum.length - 1])[0];
        }
      } else px = sclera;
      const i = (y * SIZE + x) * 4;
      data[i] = px[0]; data[i + 1] = px[1]; data[i + 2] = px[2]; data[i + 3] = 255;
    }
  }
  return { width: SIZE, getContext: () => ({ getImageData: () => ({ data }) }) };
}

const HAZEL_ZONES = [
  { tMax: 0.38, sectors: [['#c9a95c', 0.6], ['#9c6b2e', 0.4]] },                    // collarette: gold + amber
  { tMax: 1.0, sectors: [['#8a8a4f', 0.45], ['#a89478', 0.35], ['#6b4a2f', 0.2]] }, // outer: olive / taupe / brown
];

const qVector = (d) => Object.fromEntries(Object.entries(d.physical.quantities).map(([s, n]) => [s, n / d.physical.beadCount]));
const qL1 = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].reduce((t, s) => t + Math.abs((a[s] ?? 0) - (b[s] ?? 0)), 0);
const paletteDist = (p1, p2) => {
  const one = (a, b) => a.reduce((acc, e) => acc + Math.min(...b.map((f) => deltaE2000(e.lab, f.lab))), 0) / a.length;
  return Math.max(one(p1, p2), one(p2, p1));
};
const design = (palette, arrangement = 'dusk', size = 'M', id = 'EM-TST-AAAAAA') =>
  buildDesign({
    measuredPalette: palette, classification: classifyPalette(palette),
    arrangement, size, designId: id, now: () => '2026-08-04T00:00:00.000Z',
  });
const nearest = (hx) => matchColorToBead(hx, activeBeads()).sku;

/* ---- 1. colour science ---- */
for (const [l1, l2, e] of [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 2.8361, -74.0200], [50, 0, -82.7485], 3.4412],
]) check(`deltaE2000(${e})`, near(deltaE2000(l1, l2), e));
check('labToHex inverts hexToLab', labToHex(hexToLab('#8fa9bc')) === '#8fa9bc');

/* ---- 2. inventory invariants ---- */
const V1_SKUS = ['B001', 'B002', 'B003', 'B004', 'B005', 'B006'];
const active = activeBeads();
check('inventory status is physical V1', INVENTORY_STATUS === 'PHYSICAL_V1_APPROXIMATE_COLORS');
check('active SKUs are exactly B001–B006',
  JSON.stringify(active.map((b) => b.sku).sort()) === JSON.stringify(V1_SKUS));
check('all active beads are nominally 6 mm', active.every((b) => b.diameterMm === 6));
check('supplierRef is null everywhere', BEAD_INVENTORY.every((b) => b.supplierRef === null));

/* ---- 3. pupil estimation ---- */
const pupilFix = eyeCanvas({ pupil: { cx: 215, cy: 205, r: 75 }, irisR: 200, zones: HAZEL_ZONES });
const pe = estimatePupil(pupilFix);
check('pupil found on off-centre dilated fixture', pe.ok);
check('pupil centre accurate (±6px)', pe.ok && Math.hypot(pe.cx - 215, pe.cy - 205) < 6,
  pe.ok ? `got (${pe.cx.toFixed(0)},${pe.cy.toFixed(0)})` : pe.reason);
check('pupil radius accurate (±12%)', pe.ok && Math.abs(pe.radius - 75) / 75 < 0.12,
  pe.ok ? `got ${pe.radius.toFixed(0)}` : '');
check('blank frame → no pupil', !estimatePupil(eyeCanvas({ irisHex: '#8a8d92', pupilHex: '#8a8d92', scleraHex: '#8a8d92' })).ok);
check('all-dark frame → no pupil', !estimatePupil(eyeCanvas({ irisHex: '#0a0a0a', pupilHex: '#0a0a0a', scleraHex: '#0a0a0a' })).ok);

/* ---- 4. REAL-FAILURE-GEOMETRY REGRESSION (off-centre dilated pupil, olive outer iris) ---- */
const regRes = extractMeasuredPalette(pupilFix);
check('regression fixture: extraction succeeds', regRes.ok, regRes.reason);
const reg = regRes.ok ? regRes.palette : [];
const regDark = regRes.ok ? 1 - regRes.diagnostics.accepted / regRes.diagnostics.scanned : 1;
check('regression fixture: pupil mostly excluded (<12% rejected in annulus)', regDark < 0.12, `${(regDark * 100).toFixed(1)}%`);
check('regression fixture: ≥3 measured colours', reg.length >= 3, `got ${reg.length}`);
const goldE = reg.find((p) => p.lab[0] > 60 && p.lab[2] > 30);
const oliveE = reg.find((p) => p.lab[1] < -2);
check('regression fixture: gold structure retained', !!goldE);
check('regression fixture: olive outer structure retained (a*<-2)', !!oliveE,
  JSON.stringify(reg.map((p) => [p.hex, p.weight, p.radialZone])));
check('regression fixture: gold vs olive perceptually distinct (ΔE>12)',
  !!goldE && !!oliveE && deltaE2000(goldE.lab, oliveE.lab) > 12);
check('regression fixture: radial zones are meaningful (gold inner, olive not inner)',
  !!goldE && !!oliveE && goldE.radialZone === 'inner' && oliveE.radialZone !== 'inner',
  `gold=${goldE?.radialZone} olive=${oliveE?.radialZone}`);
check('true matches support ≥3 SKUs (gold→B005, olive→B004/B002, taupe/brown→B006/B001)',
  nearest('#c9a95c') === 'B005' && ['B004', 'B002'].includes(nearest('#8a8a4f'))
  && ['B006', 'B001'].includes(nearest('#a89478')));
const regD = design(reg);
check('regression recipe uses ≥3 SKUs', Object.keys(regD.physical.quantities).length >= 3,
  JSON.stringify(regD.physical.quantities));
const regAgain = extractMeasuredPalette(pupilFix);
check('regression fixture: byte-identical on repeat', JSON.stringify(regAgain) === JSON.stringify(regRes));

/* ---- 5. PUPIL / FRAMING INVARIANCE (same iris, different pupil & position) ---- */
const BASE = { irisR: 190, zones: HAZEL_ZONES };
const variants = {
  baseline: eyeCanvas({ ...BASE, pupil: { cx: 240, cy: 240, r: 55 } }),
  smallPupil: eyeCanvas({ ...BASE, pupil: { cx: 240, cy: 240, r: 32 } }),
  largePupil: eyeCanvas({ ...BASE, pupil: { cx: 240, cy: 240, r: 85 } }),
  shiftedX: eyeCanvas({ ...BASE, pupil: { cx: 295, cy: 240, r: 55 } }),
  shiftedY: eyeCanvas({ ...BASE, pupil: { cx: 240, cy: 300, r: 55 } }),
};
const results = Object.fromEntries(Object.entries(variants).map(([k, c]) => [k, extractMeasuredPalette(c)]));
check('invariance: every variant extracts', Object.values(results).every((r) => r.ok),
  JSON.stringify(Object.entries(results).filter(([, r]) => !r.ok).map(([k, r]) => [k, r.reason])));
const basePal = results.baseline.palette;
const baseQ = qVector(design(basePal));
console.log('  invariance distances vs baseline:');
for (const [k, r] of Object.entries(results)) {
  if (k === 'baseline' || !r.ok) continue;
  const pd = paletteDist(basePal, r.palette);
  const ql = qL1(baseQ, qVector(design(r.palette)));
  console.log(`    ${k}: paletteDist=${pd.toFixed(2)} recipeL1=${ql.toFixed(2)}`);
  check(`invariance: ${k} palette ≈ baseline (dist<8)`, pd < 8, pd.toFixed(2));
  check(`invariance: ${k} recipe ≈ baseline (L1<0.4)`, ql < 0.4, ql.toFixed(2));
}

/* ---- 6. UNIFORM-EYE HONESTY ---- */
const uniBrown = extractMeasuredPalette(eyeCanvas({ irisHex: '#7a5a32' }));
check('uniform brown iris → exactly 1 colour', uniBrown.ok && uniBrown.palette.length === 1,
  uniBrown.ok ? `${uniBrown.palette.length}` : uniBrown.reason);
const uniBlue = extractMeasuredPalette(eyeCanvas({ irisHex: '#5a7fa0' }));
check('uniform blue iris → exactly 1 colour', uniBlue.ok && uniBlue.palette.length === 1);

/* ---- 7. PERSONALIZATION (category must not determine the bracelet) ---- */
const goldHazel = extractMeasuredPalette(eyeCanvas({
  zones: [{ tMax: 1, sectors: [['#c9a95c', 0.5], ['#8a8a4f', 0.15], ['#a89478', 0.2], ['#6b4a2f', 0.15]] }],
}));
const greenHazel = extractMeasuredPalette(eyeCanvas({
  zones: [{ tMax: 1, sectors: [['#8a8a4f', 0.5], ['#c9a95c', 0.15], ['#a89478', 0.2], ['#6b4a2f', 0.15]] }],
}));
check('hazel A/B both extract', goldHazel.ok && greenHazel.ok);
check('hazel A/B: quantity vectors differ (L1>0.2)',
  qL1(qVector(design(goldHazel.palette)), qVector(design(greenHazel.palette))) > 0.2);
const blueGrey = extractMeasuredPalette(eyeCanvas({
  zones: [{ tMax: 1, sectors: [['#8fa4b5', 0.5], ['#7d8894', 0.3], ['#9fb2c0', 0.2]] }],
}));
const satBlue = extractMeasuredPalette(eyeCanvas({
  zones: [{ tMax: 1, sectors: [['#4a7ec0', 0.5], ['#35619e', 0.3], ['#6b9fd4', 0.2]] }],
}));
check('blue C/D both extract', blueGrey.ok && satBlue.ok);
check('blue C/D: measured palettes measurably differ (dist>5)',
  paletteDist(blueGrey.palette, satBlue.palette) > 5);
const dBG = design(blueGrey.palette), dSB = design(satBlue.palette);
check('blue C/D: identical recipes only if true matches coincide',
  JSON.stringify(dBG.physical.quantities) !== JSON.stringify(dSB.physical.quantities)
  || [...blueGrey.palette, ...satBlue.palette].every((p) => nearest(p.hex) === 'B003'));

/* ---- 8. QUALITY GATES / CONTAMINATION ---- */
const glare = extractMeasuredPalette(eyeCanvas({ irisHex: '#f4f2ee' }));
check('bright glare/sclera-flood iris → retake', !glare.ok, glare.reason ?? 'ok?!');
const paleNeutral = extractMeasuredPalette(eyeCanvas({
  zones: [{ tMax: 1, sectors: [['#d9d9d5', 0.7], ['#5a4a3a', 0.3]] }],
}));
// A pale-neutral iris is indistinguishable from sclera: the limbus gate may
// reject it as 'no-iris' before clustering can call it 'contaminated'.
// Either machine reason is a correct, honest retake.
check('mostly pale-neutral iris → retake', !paleNeutral.ok && ['contaminated', 'no-iris'].includes(paleNeutral.reason),
  paleNeutral.reason ?? 'ok?!');
const goldEye = extractMeasuredPalette(eyeCanvas({
  zones: [{ tMax: 1, sectors: [['#c9a95c', 0.7], ['#6b4a2f', 0.3]] }],
}));
const goldEntry = goldEye.ok && goldEye.palette.find((p) => p.lab[2] > 20 && p.lab[0] > 55);
check('warm gold survives extraction with dominant weight', !!goldEntry && goldEntry.weight > 0.4,
  goldEye.ok ? JSON.stringify(goldEye.palette.map((p) => [p.hex, p.weight])) : goldEye.reason);
const eyelid = extractMeasuredPalette(eyeCanvas({ ...BASE, pupil: { cx: 240, cy: 240, r: 55 }, eyelidY: 120 }));
const skinWeight = eyelid.ok
  ? eyelid.palette.filter((p) => p.lab[0] > 70 && p.lab[1] > 5 && p.lab[2] > 10 && p.lab[2] < 30)
      .reduce((a, p) => a + p.weight, 0)
  : 1;
check('eyelid-contaminated framing: valid measurement with bounded skin leakage (<0.3) or clean retake',
  !eyelid.ok || skinWeight < 0.3, `skinWeight=${skinWeight.toFixed(2)}`);

/* ---- 9. DETERMINISM + PATTERNS + ALLOCATION ---- */
check('same inputs → identical design JSON',
  JSON.stringify(design(reg)) === JSON.stringify(design(reg)));
const sortEntries = (o) => JSON.stringify(Object.entries(o).sort((a, b) => a[0].localeCompare(b[0])));
for (const p of ARRANGEMENTS) {
  const d = design(reg, p);
  const counted = {};
  d.physical.sequence.forEach((sku) => { counted[sku] = (counted[sku] ?? 0) + 1; });
  check(`'${p}': sequence multiset equals quantities`, sortEntries(counted) === sortEntries(d.physical.quantities));
}
const dDusk = design(reg, 'dusk');
const hexSeq = sequenceHexes(dDusk);
const hts = dDusk.physical.sequence.map((_, i) => (Math.sin((i / 24) * Math.PI * 2) + 1) / 2);
const lOf = (h) => hexToLab(h)[0];
const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
check('dusk: top of wrist lighter than bottom',
  avg(hexSeq.filter((_, i) => hts[i] > 0.5).map(lOf)) > avg(hexSeq.filter((_, i) => hts[i] <= 0.5).map(lOf)));
check('wild: same design id → same sequence',
  JSON.stringify(design(reg, 'wild', 'M', 'EM-AAA-111111').physical.sequence)
  === JSON.stringify(design(reg, 'wild', 'M', 'EM-AAA-111111').physical.sequence));
check('patterns differ from each other',
  new Set(ARRANGEMENTS.map((p) => JSON.stringify(design(reg, p).physical.sequence))).size === 3);
const q = allocateQuantities({ B005: 0.3, B004: 0.25, B006: 0.45 }, 24);
check('allocation sums exactly to beadCount', Object.values(q).reduce((a, b) => a + b, 0) === 24);
check('allocation ≈ proportions', q.B006 === 11 && q.B005 === 7 && q.B004 === 6);
check('tiny cluster may get zero beads', !('B002' in allocateQuantities({ B003: 0.98, B002: 0.02 }, 24)));

/* ---- 10. SCHEMA v2 / PRIVACY / IDS / MULTI ---- */
check('schemaVersion is 2', regD.schemaVersion === 2);
check('design carries measuredPalette with hex/lab/weight/radialZone',
  regD.measuredPalette.every((p) => p.hex && p.lab?.length === 3 && p.weight > 0 && p.radialZone));
const json = JSON.stringify(regD);
check('design round-trips losslessly', JSON.stringify(JSON.parse(json)) === json);
check('no image data anywhere in the recipe', !/data:image|base64/i.test(json));
check('sequence only V1 SKUs', regD.physical.sequence.every((s) => V1_SKUS.includes(s)));
check('bead diameters resolve to [6]', JSON.stringify(regD.physical.beadDiametersMm) === '[6]');
const ids = new Set(Array.from({ length: 200 }, () => newDesignId('Aquamarine')));
check('design id format + uniqueness', ids.size === 200 && [...ids].every((id) => /^EM-AQU-[A-HJ-NP-Z2-9]{6}$/.test(id)));
const dA = design(reg, 'dusk', 'S', null);
const dB = design(goldHazel.palette, 'wild', 'L', null);
check('multi-bracelet designs stay independent',
  dA.designId !== dB.designId && JSON.stringify(dA.physical.quantities) !== JSON.stringify(dB.physical.quantities));

/* ---- 11. REPORT ---- */
console.log('\n--- Pupil-Anchored Sampling V2 fixture report ---');
for (const [label, res] of [
  ['REGRESSION GEOMETRY', regRes], ['BASELINE', results.baseline],
  ['SMALL PUPIL', results.smallPupil], ['LARGE PUPIL', results.largePupil],
  ['GOLD-HAZEL', goldHazel], ['GREEN-HAZEL', greenHazel],
]) {
  if (!res.ok) { console.log(`${label}: RETAKE (${res.reason})`); continue; }
  const d = design(res.palette);
  console.log(`${label}\n  palette: ${res.palette.map((p) => `${p.hex}·${(p.weight * 100).toFixed(0)}%·${p.radialZone}`).join(' ')}`
    + `\n  stone: ${d.stone} · recipe: ${Object.entries(d.physical.quantities).map(([s, n]) => `${s}×${n}`).join(' ')}`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
