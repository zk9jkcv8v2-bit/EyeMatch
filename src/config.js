// Central knobs for the experience. Drop Higgsfield-generated assets into
// /public/media and point these at them to swap procedural elements for video.
export const config = {
  // e.g. '/media/hero-loop.mp4' (asset A1 from the Higgsfield prompt library).
  // When set, it plays full-bleed behind the landing scene.
  heroVideo: null,

  // The landing ring is ALIVE — it cycles through these curated vivid gemstone
  // palettes (one harmonious set at a time, never a chaotic rainbow). Each
  // inner array is 5 colour "slots" the beads draw from.
  shiftPalettes: [
    ['#2f74dd', '#4a93e6', '#7ab6f2', '#274aa8', '#1f3a82'], // sapphire / aquamarine
    ['#19b6c4', '#3fd2dd', '#74e6ec', '#13929e', '#0e7480'], // turquoise / teal
    ['#1fb079', '#2fcd8d', '#65e0ad', '#138a5d', '#0d6b48'], // emerald / jade
    ['#c2a52e', '#e6c24a', '#f2d36a', '#d18f24', '#b5701a'], // citrine / amber
    ['#d8814a', '#ec9a5e', '#f3b27f', '#c05f2a', '#9a481f'], // sunstone / carnelian
    ['#cf3f6a', '#e8627f', '#f08fa6', '#b62747', '#8f1d38'], // rubellite / rose
    ['#8a52d6', '#a96fe6', '#c79bf0', '#6c39b0', '#52298a'], // amethyst / violet
  ],

  // Fallback bead palette (used if a scan ever yields nothing).
  brandBeads: ['#a9c6d6', '#7fa9c4', '#3e7396', '#2b4a73', '#27355e'],

  // Reveal iris colors (overwritten per-scan; warm amber corona by default).
  brandIris: { core: '#8a6b38', mid: '#5d7791', edge: '#27384c' },

  beadCount: 24,
  // The brand icon's inner opening is an 8-petal soft star — the iris
  // silhouette and the 3D metal ring both derive from this.
  petals: 8,
};

// Shared silhouette math (GLSL mirrors this): normalized radius of the
// scalloped edge at angle `a`, in 0..1 disc space.
export function petalEdge(a, petals = config.petals) {
  const wave = Math.pow(0.5 + 0.5 * Math.cos(a * petals), 1.35);
  return 0.86 + 0.115 * wave;
}
