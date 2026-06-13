# EyeMatch — Interactive Experience

A single-page, three-act WebGL experience: a living procedural iris framed by
the brand's wavy metal ring (Act I), an eye scan via camera or photo upload
(Act II), and a morph where the iris fibres stream outward and set into a
bracelet of polished natural gemstone beads in the exact colors sampled from
your eye (Act III).

Built with **Vite + Three.js + GSAP**, plus a procedural WebAudio soundscape
(muted by default — toggle top-right).

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
| `src/main.js` | Act state machine, GSAP choreography (intro, tease, reveal), UI wiring |
| `src/config.js` | Brand palette, bead count, petal silhouette math, asset hooks |
| `src/three/stage.js` | Renderer, camera, bloom, environment, parallax, specular sweep light |
| `src/three/iris.js` | The living iris — custom GLSL shader (fibres, amber corona, golden flecks, breathing pupil, 8-petal brand silhouette, dissolve) |
| `src/three/brandring.js` | The brand icon as 3D champagne metal, undulating around the iris |
| `src/three/bracelet.js` | Polished natural-stone bead bracelet with procedural mineral textures |
| `src/scan.js` | Camera handling, iris color extraction, bead palette + stone naming |
| `src/audio.js` | Procedural drone / scan sweep / chime / clicks — no audio files |
| `public/brand/` | Official logo/icon SVGs (copied from `../Branding Elements/LOGO/`) |

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

While the links are empty, the button captures an **email reservation**
instead (stored in `localStorage`, or POSTed to `config.checkout.reserveEndpoint`
if you set one — e.g. a Formspree URL). To go fully live, just fill in the
Payment Links.

## Sharing

The reveal's **SHARE** button renders a portrait result card to canvas
(`drawShareCard()` in `src/main.js`) — SAVE IMAGE downloads a PNG; SHARE… uses
the Web Share API on supported devices. Update the `og-image.png` in
`public/brand/` with a proper 1200×630 social preview before launch.

## Demo without a camera

In the browser console:

```js
__eyematch.simulate('#4a7da8') // any hex — blue #4a7da8, brown #7a5a32, green #3f6b4f
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
