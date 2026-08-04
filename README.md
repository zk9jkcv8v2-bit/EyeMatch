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
| `src/scan.js` | Camera handling, iris color extraction, eye-color classification + palette |
| `src/config.js` | Brand palette, bead count, checkout knobs, petal silhouette math |
| `src/three/stage.js` | Renderer, camera, bloom, environment, parallax, specular sweep light |
| `src/three/iris.js` | The living iris — custom GLSL shader (fibres, corona, breathing pupil, dissolve) |
| `src/three/bracelet.js` | Polished natural-stone bead bracelet with procedural mineral textures |
| `src/domain/inventory.js` | Physical bead catalog — **DEV PLACEHOLDER, not real supplier SKUs** |
| `src/domain/match.js` | Palette → closest available bead (CIE Lab + CIEDE2000, deterministic) |
| `src/domain/patterns.js` | Shared Dusk/Cadence/Wild arrangement math (render + recipe use the same fn) |
| `src/domain/sizes.js` | Size architecture — physical dims/bead counts are open decisions (nulls) |
| `src/domain/recipe.js` | `BraceletDesign` — the serializable, buildable recipe + design IDs |
| `scripts/verify-domain.mjs` | No-framework verification of matching/recipes (`node scripts/verify-domain.mjs`) |
| `public/brand/` | Official logo/icon SVGs (copied from `../Branding Elements/LOGO/`) |

## Domain model: from scan to buildable bracelet

Each scanned bracelet gets a **`BraceletDesign`** (see `src/domain/recipe.js`):
a JSON-serializable recipe holding the eye classification, the generated
palette, the matched **physical bead SKUs** (with CIEDE2000 distance scores so
match quality is never hidden), the arrangement, size, and the full
position-by-position bead sequence + quantities. The design ID
(`EM-AQU-7K3M9Q` style, crypto-random, no personal data) is the handle a
future order/fulfillment process will reference; the recipe itself is the
source of truth. Inspect live designs in the console via
`__flow.designs()`.

**⚠️ The bead inventory is a development placeholder.** Real physical beads
have not been selected; `src/domain/inventory.js` ships stand-in `EM-DEV-*`
SKUs derived from the site's on-screen palettes. Replace that catalog (and the
placeholder 8 mm diameter + 24-bead size fallback in `src/domain/sizes.js`)
with confirmed supplier data before any real order is taken.

## Privacy boundary

- **Raw eye image** — browser-local and ephemeral. It is drawn to an in-memory
  `<canvas>`, read once for colour, and never persisted, never uploaded, never
  placed in a recipe. Closing the tab destroys it.
- **Derived design data** — eye-color classification, generated palette, bead
  matches, recipe, design ID. Contains nothing that can reconstruct the image.
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
