// Central knobs for the experience. Drop Higgsfield-generated assets into
// /public/media and point these at them to swap procedural elements for video.
export const config = {
  // e.g. '/media/hero-loop.mp4' (asset A1 from the Higgsfield prompt library).
  // When set, it plays full-bleed behind the landing scene.
  heroVideo: null,

  // The landing ring slowly cycles through REAL eye colours and their natural
  // gemstone variants — only stones you could actually be matched to. Muted
  // and natural, never neon. Each inner array is 5 colour "slots".
  shiftPalettes: [
    ['#a6c4d6', '#7ba3c0', '#4f7896', '#5f87a6', '#88abc6'], // blue — aquamarine / sodalite
    ['#9fbf9a', '#74a075', '#4f7857', '#86ad84', '#5f8a66'], // green — jade / aventurine
    ['#c2a878', '#a08049', '#7a6038', '#b0a06a', '#8a7548'], // hazel — amber / gold-green
    ['#b08a5a', '#8a6638', '#664a2b', '#9c7a4a', '#7a5836'], // brown — citrine / tiger's eye
    ['#b9bdc2', '#949ca3', '#6f767e', '#a7adb3', '#838b93'], // grey — moonstone / labradorite
  ],

  // Fallback bead palette (used if a scan ever yields nothing).
  brandBeads: ['#a9c6d6', '#7fa9c4', '#3e7396', '#2b4a73', '#27355e'],

  // Reveal iris colors (overwritten per-scan; warm amber corona by default).
  brandIris: { core: '#8a6b38', mid: '#5d7791', edge: '#27384c' },

  beadCount: 24,

  // --- Commerce ---------------------------------------------------------
  // Shopify headless checkout: the website captures the bead sequence and
  // creates a Shopify order with it as custom line item properties. No backend
  // needed; the Storefront API handles checkout directly.
  checkout: {
    currency: 'SEK',
    price: 49,
    // Shopify Storefront API credentials (safe to expose; public access only)
    shopify: {
      storefrontToken: 'bb560265eaf48d43c7c2b412b5476edc',
      graphqlEndpoint: 'https://87b9xq-f1.myshopify.com/api/2024-01/graphql.json',
      productId: 'gid://shopify/Product/10873352061267', // EyeMatch Bracelet
    },
    // Legacy: Stripe Payment Links (keep for reference, not used)
    paymentLinks: { S: '', M: '', L: '' },
    reserveEndpoint: '',
  },
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
