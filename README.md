# EyeMatch — Interactive Experience

A single-page, three-act WebGL experience: a living procedural iris framed by
the brand's wavy metal ring (Act I), an eye scan via camera or photo upload
(Act II), and a morph where the iris fibres stream outward and set into a
bracelet of polished natural gemstone beads in the exact colors sampled from
your eye (Act III).

Built with **Vite + Three.js + GSAP**. (No audio — sound was removed by
design decision.)

## Run it

Node.js lives in `~/.local/node22` on this machine (it is not on the default PATH):

```sh
export PATH="$HOME/.local/node22/bin:$PATH"
cd "~/Claude/Projects/Website/site"
npm install   # first time only
npm run dev   # → http://localhost:5173
npm run build # → dist/ (deploy anywhere static)
```

## Structure

| File | What it does |
| --- | --- |
| `src/home.js` | Boots the 3D stage + scroll-scrubbed landing story; wires BEGIN into the flow |
| `src/flow.js` | The BEGIN flow: bracelet count → capture → reveal → purchase; owns order state |
| `src/scan.js` | Camera, pupil/limbus estimation, iris sampling, contamination rejection |
| `src/config.js` | Brand palette, bead count, checkout knobs, petal silhouette math |
| `src/three/stage.js` | Renderer, camera, bloom, environment, parallax, specular sweep light |
| `src/three/iris.js` | The living iris — custom GLSL shader (fibres, corona, breathing pupil, dissolve) |
| `src/three/bracelet.js` | Polished natural-stone bead bracelet with procedural mineral textures |
| `src/domain/match.js` | Colour science: sRGB↔CIE Lab + CIEDE2000 (no inventory) |
| `reference/bead-inventory-v1.js` | Physical bead catalog — **fulfillment reference, imported by nothing** |
| `src/domain/patterns.js` | Shared Dusk/Cadence/Wild arrangement math (render + recipe use the same fn) |
| `src/domain/sizes.js` | Size architecture — physical dims/bead counts are open decisions (nulls) |
| `src/domain/recipe.js` | `BraceletDesign` — the serializable, buildable recipe + design IDs |
| `src/domain/palette.js` | Deterministic Lab clustering → the measured palette |
| `scripts/verify-domain.mjs` | No-framework verification (`node scripts/verify-domain.mjs`) |
| `public/brand/` | Official logo/icon SVGs (copied from `../Branding Elements/LOGO/`) |

## Domain model: measured-colour-first, inventory-independent

The physical bracelet is derived from the customer's **particular iris**, not
from an eye-colour category:

```
pixels (480² canvas, ephemeral)
→ deterministic pupil estimate (darkest compact disc; plausibility-gated)
→ iris annulus RELATIVE to the pupil (inner 1.15×pupilR; outer bounded by a
  limbus estimate when sclera is visible, else 2.3×pupilR) — never widened
→ adaptive contamination rejection: dark floor L*15 (pupil margin, eyelashes)
  plus a specular rule measured against THIS iris's own median lightness
  (reject L* > median+22 with C* < 25), so a window/sky highlight on the
  cornea cannot contaminate the palette, while light-grey and light-blue
  irises — just as bright, but not brighter than their own median — survive
→ deterministic CIE Lab clustering (merge ΔE 7)
→ measuredPalette: every significant colour (no cap), each with
  {hex, lab, weight, radialZone, radialMean}
→ weights → exact bead quantities per colour (largest remainder)
→ Dusk/Cadence/Wild weighted placement → position-by-position colour sequence
```

Pupil-anchored sampling means the same iris measures the same regardless of
pupil dilation, framing or position (verified: identical palettes across
pupil-size and offset fixture variants). A failed pupil/limbus estimate, a
starved annulus, glare or heavy contamination each produce an explicit
retake — never a guessed palette.

Classification (blue/green/brown/hazel/grey → stone name) is **metadata
only** — naming, UI copy, iris-shader styling. It can never create or
overwrite the physical palette. An unclear capture (too few iris pixels, or
too much glare/contamination) becomes an explicit **retake** — never a
guessed canonical palette. **Preview policy:** the 3-D bracelet renders the **measured iris colours**
directly, in the exact per-position order the recipe specifies. It is a
faithful picture of the measurement; the physical bracelet is assembled later
from whatever real beads best match those colours.

Each scanned bracelet gets a **`BraceletDesign`** (`src/domain/recipe.js`,
schemaVersion 3): the measured palette, arrangement, size, and the exact
per-position colour sequence (`sequence` + `sequenceHex`) and per-colour
`quantities` an assembler needs. The design ID (`EM-GOL-7K3M9Q` style,
crypto-random, no personal data) is the future order handle; the recipe is
the source of truth. Inspect live designs via `__flow.designs()`.

### Physical inventory — deliberately outside the app

EyeMatch owns six real 6 mm bead families (`B001`–`B006`). That catalog lives
in **`reference/bead-inventory-v1.js`** and is **imported by nothing**. The
scanner, the personalization pipeline, the 3-D preview and order creation are
all **inventory-independent**: a measured colour is never replaced, merged or
discarded because current stock lacks a near match, and the scanner does not
know which beads we own. A verification check enforces the no-import rule.

Colour→bead matching happens at **assembly time**, by a human, against
whatever stock actually exists then — not at scan time against a snapshot.
The design hands them a per-position colour sequence and per-colour bead
counts; they pick the closest bead they physically hold.

## Privacy boundary

- **Raw eye image** — browser-local and ephemeral. It is drawn to an in-memory
  `<canvas>`, read once for colour, and never persisted, never uploaded, never
  placed in a recipe. Closing the tab destroys it.
- **Derived design data** — eye-color classification, measured palette,
  recipe, design ID. Contains nothing that can reconstruct the image.
  Currently lives only in page memory (no localStorage, no network).
- **Future order data** — when commerce is built, an order may carry the
  derived design/recipe, but must never include the raw eye image.

## Brand assets

Source-of-truth brand files live in `~/Claude/Projects/Branding Elements/`.
The site uses copies in `public/brand/`: the full logo lockup (header), the
icon (favicon + custom cursor). The 8-petal star opening of the icon drives
the iris silhouette, the 3D metal ring, and the scan viewfinder frame —
one shape everywhere (`petalEdge()` in `src/config.js`).

## Dropping in Higgsfield assets

Generated media goes in `public/media/`. Point `config.heroVideo` in
`src/config.js` at e.g. `/media/hero-loop.mp4` to play it full-bleed behind
the landing scene. Everything else is procedural and color-matched to the
visitor's eye, so video is optional.

## Checkout (no backend, no secret keys)

Real payment runs through **Stripe Payment Links** — no server, no secret keys
in the client:

1. In Stripe, create the product and a **Payment Link** for each wrist size.
2. Paste the URLs into `config.checkout.paymentLinks` (`S` / `M` / `L`) in
   `src/config.js`, and set `currency` / `price` for the displayed amount.

**Current state:** while the links are empty, CHECKOUT only logs a console
warning — there is **no reservation fallback implemented** (the
`reserveEndpoint` knob in config is scaffolding for a future decision).
Note also that Payment Links alone cannot carry the per-design data a real
order needs (see the design-ID / recipe section) — commerce architecture is a
pending decision.

## Demo without a camera

In the browser console:

```js
__flow.simulate('#4a7da8')                 // one bracelet: any hex → reveal
__flow.simulateSet(['#4a7da8', '#7a5a32']) // multi-bracelet order → purchase
__flow.designs()                           // inspect the full recipes
```

## Notes

- The repo is under git — commit before risky changes, and nothing is ever
  more than a `git checkout` away from recovery.
- `prefers-reduced-motion` collapses all animation to near-instant states.
- Color extraction samples an annulus around frame centre, rejecting pupil
  darkness, specular highlights and sclera, then takes the dominant
  saturation-weighted hue bucket.
- The stone name (Aquamarine, Emerald, Citrine, …) comes from hue/lightness
  classification; the bead colors are generated from the sampled color
  itself, so every bracelet is unique.
