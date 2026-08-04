// Lightweight verification of the domain layer — no test framework needed.
// Run:  node scripts/verify-domain.mjs   (exits non-zero on any failure)
//
// Covers: CIEDE2000 correctness, Physical Inventory V1 invariants (B001–B006),
// deterministic matching/sequences, recipe serialization, privacy, and a
// human-readable report of which SKUs each eye category actually uses.

import { hexToLab, deltaE2000, matchPaletteToBeads, matchColorToBead } from '../src/domain/match.js';
import { BEAD_INVENTORY, activeBeads, INVENTORY_STATUS } from '../src/domain/inventory.js';
import { buildDesign, buildSequence, newDesignId } from '../src/domain/recipe.js';
import { colorIndexFor, ARRANGEMENTS } from '../src/domain/patterns.js';
import { buildMatch, hexToHsl } from '../src/scan.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
}
const near = (a, b, eps = 0.0001) => Math.abs(a - b) < eps;

/* ---- 1. CIEDE2000 against published test vectors (Sharma et al., 2005) ---- */
const vectors = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 2.8361, -74.0200], [50, 0, -82.7485], 3.4412],
];
for (const [lab1, lab2, expected] of vectors) {
  const got = deltaE2000(lab1, lab2);
  check(`deltaE2000(${expected}) → ${got.toFixed(4)}`, near(got, expected));
}

/* ---- 2. Physical Inventory V1 invariants ---- */
const V1_SKUS = ['B001', 'B002', 'B003', 'B004', 'B005', 'B006'];
const active = activeBeads();
check(`inventory status is physical V1 (${INVENTORY_STATUS})`,
  INVENTORY_STATUS === 'PHYSICAL_V1_APPROXIMATE_COLORS');
check('exactly six active bead families',
  active.length === 6);
check('active SKUs are exactly B001–B006',
  JSON.stringify(active.map((b) => b.sku).sort()) === JSON.stringify(V1_SKUS));
check('no EM-DEV-* SKU survives anywhere in the catalog',
  BEAD_INVENTORY.every((b) => !b.sku.startsWith('EM-DEV')));
check('all active beads are nominally 6 mm',
  active.every((b) => b.diameterMm === 6));
check('supplierRef is null everywhere (SKU identity is supplier-independent)',
  BEAD_INVENTORY.every((b) => b.supplierRef === null));
check('every bead declares variation low|medium|high',
  BEAD_INVENTORY.every((b) => ['low', 'medium', 'high'].includes(b.variation)));
check('every bead has a textual appearance description',
  BEAD_INVENTORY.every((b) => typeof b.appearance === 'string' && b.appearance.length > 20));
check('no mineral/geological names claimed in bead names',
  BEAD_INVENTORY.every((b) => !/quartz|jade|agate|amber|aventurine|sodalite|chalcedony|moonstone|labradorite|citrine|topaz|tiger/i.test(b.name)));

/* ---- 3. Determinism: same inputs → identical bead mapping ---- */
const match = buildMatch(hexToHsl('#5a7fa0')); // a blue eye
const m1 = matchPaletteToBeads(match.gems, active);
const m2 = matchPaletteToBeads(match.gems, active);
check('same palette + inventory → identical matches',
  JSON.stringify(m1) === JSON.stringify(m2));
check('every palette slot got a SKU with a distance score',
  m1.length === 5 && m1.every((m) => m.sku && Number.isFinite(m.deltaE)));
check('matches reference only V1 SKUs',
  m1.every((m) => V1_SKUS.includes(m.sku)));

/* ---- 4. Inactive beads can never be selected (synthetic inventory) ---- */
const synthetic = [
  ...active,
  { sku: 'B999', name: 'Retired Test', family: 'test', hex: '#123456', variation: 'low', appearance: 'synthetic inactive test bead, never selectable', usefulFor: [], supplierRef: null, diameterMm: 6, active: false },
];
const exact = matchColorToBead('#123456', activeBeads(synthetic)); // exact colour exists only on the INACTIVE bead
check('exact-colour match on an INACTIVE bead is refused', exact.sku !== 'B999', `got ${exact.sku}`);

/* ---- 5. Sequences: deterministic per pattern, distinct across patterns ---- */
const seqs = {};
for (const p of ARRANGEMENTS) {
  const a = buildSequence(m1, p, 24);
  const b = buildSequence(m1, p, 24);
  check(`'${p}' sequence is deterministic (24 beads)`, JSON.stringify(a) === JSON.stringify(b));
  seqs[p] = a;
}
check('dusk ≠ cadence ≠ wild sequences',
  JSON.stringify(seqs.dusk) !== JSON.stringify(seqs.cadence)
  && JSON.stringify(seqs.cadence) !== JSON.stringify(seqs.wild)
  && JSON.stringify(seqs.dusk) !== JSON.stringify(seqs.wild));
check('sequence math matches the renderer (colorIndexFor shared)',
  seqs.cadence[7] === m1[colorIndexFor('cadence', 7, 24, 5)].sku);

/* ---- 6. Full design: build, stability, serialization, fulfillment fields ---- */
const fixed = { now: () => '2026-08-04T00:00:00.000Z', designId: 'EM-TST-AAAAAA' };
const d1 = buildDesign({ match, arrangement: 'dusk', size: 'M', ...fixed });
const d2 = buildDesign({ match, arrangement: 'dusk', size: 'M', ...fixed });
check('design is fully deterministic when id/clock are pinned',
  JSON.stringify(d1) === JSON.stringify(d2));
const json = JSON.stringify(d1);
check('design serializes to JSON and round-trips losslessly',
  JSON.stringify(JSON.parse(json)) === json);
check('quantities sum to beadCount',
  Object.values(d1.physical.quantities).reduce((a, b) => a + b, 0) === d1.physical.beadCount);
check('sequence length equals beadCount',
  d1.physical.sequence.length === d1.physical.beadCount);
check('sequence contains only real V1 SKUs',
  d1.physical.sequence.every((sku) => V1_SKUS.includes(sku)));
check('bead diameters resolve to [6]',
  JSON.stringify(d1.physical.beadDiametersMm) === '[6]');
check('fulfillment fields present (id, size, pattern, count, quantities, sequence)',
  !!(d1.designId && d1.size && d1.arrangement
    && d1.physical.beadCount && d1.physical.quantities && d1.physical.sequence));
check('no image data anywhere in the recipe',
  !/data:image|base64/i.test(json));

/* ---- 7. Multi-bracelet: designs stay independent ---- */
const brown = buildMatch(hexToHsl('#7a5a32'));
const dBlue = buildDesign({ match, arrangement: 'dusk', size: 'S' });
const dBrown = buildDesign({ match: brown, arrangement: 'wild', size: 'L' });
check('two bracelets → two distinct design ids', dBlue.designId !== dBrown.designId);
check('two bracelets → independent bead selections',
  JSON.stringify(dBlue.physical.quantities) !== JSON.stringify(dBrown.physical.quantities));

/* ---- 8. Design IDs ---- */
const ids = new Set(Array.from({ length: 200 }, () => newDesignId('Aquamarine')));
check('design id format EM-AQU-XXXXXX', [...ids].every((id) => /^EM-AQU-[A-HJ-NP-Z2-9]{6}$/.test(id)));
check('200 generated ids are unique', ids.size === 200);

/* ---- 9. Lab sanity ---- */
check('Lab of white ≈ L*100', near(hexToLab('#ffffff')[0], 100, 0.01));

/* ---- 10. REPORT: which SKUs each eye category actually uses ---- */
// Not pass/fail — the honest V1 mapping, for the physical prototype test.
const CATEGORY_INPUTS = [
  ['BLUE  light', '#5a7fa0'], ['BLUE  dark ', '#31517a'],
  ['GREEN light', '#6b8f4f'], ['GREEN dark ', '#3d5c3a'],
  ['GREY  light', '#8a8d92'], ['GREY  dark ', '#565a60'],
  ['HAZEL      ', '#a98a4e'],
  ['BROWN light', '#a5723a'], ['BROWN dark ', '#7a5a32'],
];
console.log('\n--- V1 SKU usage by eye category (dusk, 24 beads) ---');
for (const [label, hex] of CATEGORY_INPUTS) {
  const m = buildMatch(hexToHsl(hex));
  const d = buildDesign({ match: m, arrangement: 'dusk', size: 'M', designId: 'EM-RPT-XXXXXX', now: () => '-' });
  const q = Object.entries(d.physical.quantities).map(([sku, n]) => `${sku}×${n}`).join(' ');
  const dEs = d.beadMatches.map((x) => `${x.sku}(${x.deltaE.toFixed(1)})`).join(' ');
  console.log(`${label} ${m.stone.padEnd(13)} → ${q}\n             matches: ${dEs}`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
