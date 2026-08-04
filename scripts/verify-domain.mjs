// Lightweight verification of the domain layer — no test framework needed.
// Run:  node scripts/verify-domain.mjs   (exits non-zero on any failure)

import { hexToLab, deltaE2000, matchPaletteToBeads, matchColorToBead } from '../src/domain/match.js';
import { BEAD_INVENTORY, activeBeads } from '../src/domain/inventory.js';
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

/* ---- 2. Determinism: same inputs → identical bead mapping ---- */
const match = buildMatch(hexToHsl('#5a7fa0')); // a blue eye
const beads = activeBeads();
const m1 = matchPaletteToBeads(match.gems, beads);
const m2 = matchPaletteToBeads(match.gems, beads);
check('same palette + inventory → identical matches',
  JSON.stringify(m1) === JSON.stringify(m2));
check('every palette slot got a SKU with a distance score',
  m1.length === 5 && m1.every((m) => m.sku && Number.isFinite(m.deltaE)));

/* ---- 3. Inactive beads can never be selected ---- */
const retired = BEAD_INVENTORY.find((b) => !b.active);
const perfect = matchColorToBead(retired.hex, activeBeads()); // '#ff00ff' exactly
check('inactive bead exists in catalog for this test', !!retired);
check('exact-colour match on an INACTIVE bead is refused',
  perfect.sku !== retired.sku, `got ${perfect.sku}`);
check('nothing in any match ever references an inactive SKU',
  m1.every((m) => m.sku !== retired.sku));

/* ---- 4. Sequences: deterministic per pattern, distinct across patterns ---- */
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

/* ---- 5. Full design: build, stability, serialization ---- */
const fixed = { now: () => '2026-08-04T00:00:00.000Z', designId: 'EM-TST-AAAAAA' };
const d1 = buildDesign({ match, arrangement: 'dusk', size: 'M', ...fixed });
const d2 = buildDesign({ match, arrangement: 'dusk', size: 'M', ...fixed });
check('design is fully deterministic when id/clock are pinned',
  JSON.stringify(d1) === JSON.stringify(d2));
const json = JSON.stringify(d1);
const revived = JSON.parse(json);
check('design serializes to JSON and round-trips losslessly',
  JSON.stringify(revived) === json);
check('quantities sum to beadCount',
  Object.values(d1.physical.quantities).reduce((a, b) => a + b, 0) === d1.physical.beadCount);
check('sequence length equals beadCount',
  d1.physical.sequence.length === d1.physical.beadCount);
check('no image data anywhere in the recipe',
  !/data:image|base64/i.test(json));

/* ---- 6. Multi-bracelet: designs stay independent ---- */
const brown = buildMatch(hexToHsl('#7a5a32'));
const dBlue = buildDesign({ match, arrangement: 'dusk', size: 'S' });
const dBrown = buildDesign({ match: brown, arrangement: 'wild', size: 'L' });
check('two bracelets → two distinct design ids', dBlue.designId !== dBrown.designId);
check('two bracelets → independent bead selections',
  JSON.stringify(dBlue.physical.sequence) !== JSON.stringify(dBrown.physical.sequence));

/* ---- 7. Design IDs ---- */
const ids = new Set(Array.from({ length: 200 }, () => newDesignId('Aquamarine')));
check('design id format EM-AQU-XXXXXX', [...ids].every((id) => /^EM-AQU-[A-HJ-NP-Z2-9]{6}$/.test(id)));
check('200 generated ids are unique', ids.size === 200);

/* ---- 8. Lab sanity ---- */
const [L] = hexToLab('#ffffff');
check('Lab of white ≈ L*100', near(L, 100, 0.01));

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
