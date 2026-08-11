// Verification of the domain layer + Pupil-Anchored Sampling V2.
// Run:  node scripts/verify-domain.mjs   (exits non-zero on any failure)
//
// Synthetic eye "photos" (fake canvases) with CONTROLLABLE PUPIL GEOMETRY are
// pushed through the REAL pipeline: pupil estimation → limbus-bounded annulus
// → Lab clustering → matching → weighted recipe.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { hexToLab, labToHex, deltaE2000 } from '../src/domain/match.js';
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
  reflection = null, lashes = false,
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
      // Specular highlight: a window/sky reflected on the cornea, sitting
      // INSIDE the iris — the real-world contamination V2.1 must reject.
      if (reflection && Math.hypot(x - reflection.cx, y - reflection.cy) < reflection.r) px = hex2rgb(reflection.hex);
      // Eyelash streaks: dark but above the old L*12 floor.
      if (lashes && y < pupil.cy && ((x * 7 + y * 3) % 29) < 4 && d < irisR) px = [34, 28, 24];
      const i = (y * SIZE + x) * 4;
      data[i] = px[0]; data[i + 1] = px[1]; data[i + 2] = px[2]; data[i + 3] = 255;
    }
  }
  return { width: SIZE, getContext: () => ({ getImageData: () => ({ data }) }) };
}
const REFLECTION = { cx: 290, cy: 200, r: 45, hex: '#aad6f1' }; // sky-blue window highlight

const HAZEL_ZONES = [
  { tMax: 0.38, sectors: [['#c9a95c', 0.6], ['#9c6b2e', 0.4]] },                    // collarette: gold + amber
  { tMax: 1.0, sectors: [['#8a8a4f', 0.45], ['#a89478', 0.35], ['#6b4a2f', 0.2]] }, // outer: olive / taupe / brown
];

// Quantities keyed by the actual COLOUR, not by positional key — c00 means
// "heaviest colour", which is a different colour in different designs.
const qVector = (d) => Object.fromEntries(Object.entries(d.physical.quantities)
  .map(([k, n]) => [d.measuredPalette.find((p) => p.key === k).hex, n / d.physical.beadCount]));
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
// Palette signature: the measured colours themselves. No inventory anywhere.
const paletteSig = (res) => (res.ok
  ? res.palette.map((p) => p.hex).sort().join(',')
  : `RETAKE:${res.reason}`);
const hasColorNear = (res, hx, tol = 10) =>
  res.ok && res.palette.some((p) => deltaE2000(p.lab, hexToLab(hx)) <= tol);

/* ---- 1. colour science ---- */
for (const [l1, l2, e] of [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 2.8361, -74.0200], [50, 0, -82.7485], 3.4412],
]) check(`deltaE2000(${e})`, near(deltaE2000(l1, l2), e));
check('labToHex inverts hexToLab', labToHex(hexToLab('#8fa9bc')) === '#8fa9bc');

/* ---- 2. ARCHITECTURE: the pipeline must be inventory-independent ---- */
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const full = `${dir}/${f}`;
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const srcFiles = walk('src').filter((f) => f.endsWith('.js'));
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const offenders = srcFiles.filter((f) => {
  const t = stripComments(readFileSync(f, 'utf8'));
  return /from\s+['"][^'"]*inventory[^'"]*['"]/.test(t)
    || /\bactiveBeads\b|\bBEAD_INVENTORY\b|\bmatchColorToBead\b|\bmatchPaletteToBeads\b/.test(t);
});
check('no file under src/ imports inventory or matches SKUs', offenders.length === 0, offenders.join(', '));
check('inventory data lives outside the app', statSync('reference/bead-inventory-v1.js').isFile());
check('no bead SKU literal appears anywhere in src/',
  !srcFiles.some((f) => /\bB00[1-6]\b/.test(stripComments(readFileSync(f, 'utf8')))));

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
check('regression fixture: source gold AND olive both survive as measured colours',
  hasColorNear(regRes, '#c9a95c', 14) && hasColorNear(regRes, '#8a8a4f', 14),
  JSON.stringify(reg.map((p) => p.hex)));
const regD = design(reg);
check('regression recipe uses ≥3 measured colours', Object.keys(regD.physical.quantities).length >= 3,
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

/* ---- 5b. SPECULAR REFLECTION MUST NEVER BECOME A PHYSICAL BEAD (V2.1) ---- */
// A window/sky highlight sits inside the iris, so geometry can't exclude it,
// and an absolute lightness cut would delete light-grey/light-blue irises.
// The adaptive rule (L* > medianL+22 AND C* < 25) must remove it everywhere
// while leaving every genuine iris type intact.
const reflectionCases = {
  brown: '#7a5a32', hazelZones: null, blue: '#5a7fa0', lightGrey: '#b9bdc2', lightBlue: '#a6c4d6',
};
for (const [label, hex] of Object.entries(reflectionCases)) {
  if (!hex) continue;
  const clean = extractMeasuredPalette(eyeCanvas({ irisHex: hex }));
  const withRefl = extractMeasuredPalette(eyeCanvas({ irisHex: hex, reflection: REFLECTION }));
  check(`reflection/${label}: still extracts`, withRefl.ok, withRefl.reason);
  // A highlight must never introduce a colour ALIEN to the iris. On dark and
  // mid irises it is rejected outright; on a very light iris it is only a few
  // L* above the iris itself, so it may survive — but then it is necessarily
  // perceptually close to the iris's own colours. Both are acceptable; an
  // alien colour is not.
  const alien = withRefl.ok && clean.ok && withRefl.palette.filter((p) =>
    !clean.palette.some((c) => deltaE2000(p.lab, c.lab) <= 20));
  check(`reflection/${label}: highlight introduces no alien colour`,
    withRefl.ok && clean.ok && alien.length === 0,
    `clean=${paletteSig(clean)} withReflection=${paletteSig(withRefl)}`);
}
// The specific defect that motivated V2.1: a BROWN iris must not acquire the
// blue-grey bead that the reflection alone would match.
const brownRefl = extractMeasuredPalette(eyeCanvas({ irisHex: '#7a5a32', reflection: REFLECTION }));
check('reflection: brown iris never acquires the highlight colour (the V2.1 defect)',
  brownRefl.ok && !hasColorNear(brownRefl, REFLECTION.hex, 18), paletteSig(brownRefl));
check('reflection: highlight pixels are actually being rejected',
  brownRefl.ok && brownRefl.diagnostics.specularRejected > 0,
  `rejected=${brownRefl.ok ? brownRefl.diagnostics.specularRejected : 'n/a'}`);
// Multicolor iris keeps its real structure when a highlight is present.
const hazelRefl = extractMeasuredPalette(eyeCanvas({ zones: HAZEL_ZONES, reflection: REFLECTION }));
const hazelClean = extractMeasuredPalette(eyeCanvas({ zones: HAZEL_ZONES }));
check('reflection: multicolor hazel keeps its measured colours',
  hazelRefl.ok && paletteSig(hazelRefl) === paletteSig(hazelClean),
  `clean=${paletteSig(hazelClean)} withReflection=${paletteSig(hazelRefl)}`);
// Light irises must survive the adaptive rule (an absolute cut would kill them).
for (const [label, hex] of [['light grey', '#b9bdc2'], ['light blue', '#a6c4d6']]) {
  const r = extractMeasuredPalette(eyeCanvas({ irisHex: hex }));
  check(`light iris (${label}) survives specular rejection`, r.ok && r.palette.length === 1,
    r.ok ? `${r.palette.length} colours` : r.reason);
}
// Eyelash streaks (L*≈13, above the old floor) must not create a bead family.
for (const [label, opts] of [['brown', { irisHex: '#7a5a32' }], ['hazel', { zones: HAZEL_ZONES }]]) {
  const clean = extractMeasuredPalette(eyeCanvas(opts));
  const lashy = extractMeasuredPalette(eyeCanvas({ ...opts, lashes: true }));
  const lashAlien = lashy.ok && clean.ok && lashy.palette.filter((p) =>
    !clean.palette.some((c) => deltaE2000(p.lab, c.lab) <= 20));
  check(`lashes/${label}: eyelash shadow introduces no alien colour`,
    lashy.ok && lashAlien.length === 0,
    `clean=${paletteSig(clean)} lashes=${paletteSig(lashy)}`);
}
// Very dark brown must still be measurable with the raised dark floor.
const veryDark = extractMeasuredPalette(eyeCanvas({ irisHex: '#3a2a1c' }));
check('very dark brown iris still extracts (dark floor L*15)', veryDark.ok, veryDark.reason);

/* ---- 5c. NO ARBITRARY PALETTE CAP ---- */
// A six-colour iris must yield six colours; significance (weight), not a cap,
// decides. Diversity is never manufactured — see the uniform tests below.
const sixColour = extractMeasuredPalette(eyeCanvas({ zones: [{ tMax: 1.0, sectors: [
  ['#c9a95c', 1/6], ['#8a8a4f', 1/6], ['#a89478', 1/6],
  ['#6b4a2f', 1/6], ['#4a7ec0', 1/6], ['#b9bdc2', 1/6]] }] }));
check('six genuinely distinct colours all survive (no 3–5 cap)',
  sixColour.ok && sixColour.palette.length >= 6,
  sixColour.ok ? `${sixColour.palette.length}: ${paletteSig(sixColour)}` : sixColour.reason);
check('six-colour design keeps all colours in the recipe',
  sixColour.ok && Object.keys(design(sixColour.palette).physical.quantities).length >= 5);

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
check('hazel A/B: colour-keyed quantity vectors differ (L1>0.2)',
  qL1(qVector(design(goldHazel.palette)), qVector(design(greenHazel.palette))) > 0.2,
  `gold=${JSON.stringify(qVector(design(goldHazel.palette)))} green=${JSON.stringify(qVector(design(greenHazel.palette)))}`);
check('hazel A/B: dominant colour genuinely differs',
  goldHazel.palette[0].hex !== greenHazel.palette[0].hex
  && deltaE2000(goldHazel.palette[0].lab, greenHazel.palette[0].lab) > 15);
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
const q = allocateQuantities({ c00: 0.3, c01: 0.25, c02: 0.45 }, 24);
check('allocation sums exactly to beadCount', Object.values(q).reduce((a, b) => a + b, 0) === 24);
check('allocation ≈ proportions', q.c02 === 11 && q.c00 === 7 && q.c01 === 6, JSON.stringify(q));
check('tiny colour may get zero beads', !('c01' in allocateQuantities({ c00: 0.98, c01: 0.02 }, 24)));

/* ---- 10. SCHEMA v2 / PRIVACY / IDS / MULTI ---- */
check('schemaVersion is 3', regD.schemaVersion === 3);
check('design carries NO bead/SKU fields',
  !('beadMatches' in regD) && !('beadDiametersMm' in regD.physical) && !/\bB00[1-6]\b/.test(JSON.stringify(regD)));
check('design carries measuredPalette with key/hex/lab/weight/radial info',
  regD.measuredPalette.every((p) => p.key && p.hex && p.lab?.length === 3 && p.weight > 0
    && p.radialZone && typeof p.radialMean === 'number'));
const json = JSON.stringify(regD);
check('design round-trips losslessly', JSON.stringify(JSON.parse(json)) === json);
check('no image data anywhere in the recipe', !/data:image|base64/i.test(json));
check('sequence references only this design\'s measured colours',
  regD.physical.sequence.every((k) => regD.measuredPalette.some((p) => p.key === k)));
check('sequenceHex matches measured colours position-for-position',
  regD.physical.sequenceHex.every((hx, i) =>
    hx === regD.measuredPalette.find((p) => p.key === regD.physical.sequence[i]).hex));
check('every measured colour is preserved verbatim (never replaced/dropped)',
  regD.measuredPalette.every((p, i) => p.hex === reg[i].hex && p.weight === reg[i].weight));
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
    + `\n  stone: ${d.stone} · recipe: ${Object.entries(d.physical.quantities)
        .map(([k, n]) => `${d.measuredPalette.find((p) => p.key === k).hex}×${n}`).join(' ')}`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
