import './styles.css';
import gsap from 'gsap';
import { config, petalEdge } from './config.js';
import { Stage } from './three/stage.js';
import { Iris } from './three/iris.js';
import { Bracelet } from './three/bracelet.js';
import { Scanner, extractIrisColor, buildMatch, hexToHsl } from './scan.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduced) gsap.globalTimeline.timeScale(6);

const $ = (id) => document.getElementById(id);

/* ============ three.js scene ============ */
const stage = new Stage($('webgl'), { reducedMotion: reduced });

// The iris lives only inside the reveal now — hidden until then.
const iris = new Iris({ petals: config.petals });
iris.basePupil = 0.3;
iris.setColors(config.brandIris);
iris.uniforms.uAlpha.value = 0;
stage.world.add(iris.mesh);

const bracelet = new Bracelet({ count: config.beadCount, shiftPalettes: config.shiftPalettes });
bracelet.startColorShift();
stage.world.add(bracelet.group);

const state = { act: 'landing', spin: false, match: null };

stage.onTick.push((t, dt) => {
  iris.update(t);
  bracelet.update(t);
  if (state.spin) bracelet.group.rotation.z += dt * 0.1;
});

/* ============ atmosphere: grain tile ============ */
(function buildGrain() {
  const size = 192;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  $('grain').style.backgroundImage = `url(${c.toDataURL()})`;
})();

/* ============ brand petal path (capture focus indicators) ============ */
function petalPath(radius = 100) {
  const pts = [];
  for (let i = 0; i <= 256; i++) {
    const a = (i / 256) * Math.PI * 2;
    const r = radius * petalEdge(a);
    pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}
(function buildFocusPetals() {
  const d = petalPath(100);
  $('focusPetalBg').innerHTML = `<path d="${d}"/>`;
  $('focusPetalDraw').innerHTML = `<path d="${d}" pathLength="1"/>`;
  $('introPetal').innerHTML = `<path d="${d}"/>`;
})();
const drawPath = $('focusPetalDraw').querySelector('path');
function resetDrawPetal() {
  gsap.set(drawPath, { strokeDasharray: 1, strokeDashoffset: 1 });
}
resetDrawPetal();

/* ============ custom cursor (the brand icon) ============ */
(function cursor() {
  const el = $('cursor');
  if (window.matchMedia('(pointer: coarse)').matches) return;
  let mx = innerWidth / 2, my = innerHeight / 2, cx = mx, cy = my;
  addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY;
    el.style.opacity = 0.9;
  });
  (function loop() {
    cx += (mx - cx) * 0.2; cy += (my - cy) * 0.2;
    el.style.transform = `translate(${cx}px, ${cy}px) translate(-50%,-50%)`;
    requestAnimationFrame(loop);
  })();
  document.querySelectorAll('.cta, .wordmark, .text-link').forEach((n) => {
    n.addEventListener('mouseenter', () => el.classList.add('active'));
    n.addEventListener('mouseleave', () => el.classList.remove('active'));
  });
})();

/* ============ parallax ============ */
addEventListener('mousemove', (e) => {
  const nx = (e.clientX / innerWidth - 0.5) * 2;
  const ny = (e.clientY / innerHeight - 0.5) * 2;
  stage.setParallax(nx, ny);
  iris.setMouse(nx, -ny);
});

/* ============ act switching + iris wipe ============ */
const wipe = $('wipe');
const flash = $('flash');
const acts = {
  landing: $('act-landing'), scan: $('act-scan'),
  reveal: $('act-reveal'), reserve: $('act-reserve'),
};

function coverWipe() {
  return gsap.fromTo(wipe,
    { clipPath: 'circle(0% at 50% 50%)' },
    { clipPath: 'circle(75% at 50% 50%)', duration: 0.7, ease: 'power3.in' });
}
function uncoverWipe() {
  return gsap.fromTo(wipe,
    { clipPath: 'circle(75% at 50% 50%)' },
    { clipPath: 'circle(0% at 50% 50%)', duration: 0.9, ease: 'power3.out' });
}

async function goTo(act, setup) {
  await coverWipe();
  acts[state.act].classList.remove('active');
  acts[act].classList.add('active');
  state.act = act;
  setup?.();
  uncoverWipe();
}

/* ============ text scramble ============ */
function scramble(el, finalText, duration = 800) {
  const chars = '·∙—–+~*';
  const start = performance.now();
  (function frame() {
    const p = Math.min((performance.now() - start) / duration, 1);
    const reveal = Math.floor(p * finalText.length);
    let out = '';
    for (let i = 0; i < finalText.length; i++) {
      out += i < reveal || finalText[i] === ' ' ? finalText[i]
        : chars[(Math.random() * chars.length) | 0];
    }
    el.textContent = out;
    if (p < 1) requestAnimationFrame(frame);
  })();
}

/* ============ ACT I — the living stone ============ */
function poseLanding() {
  bracelet.startColorShift(); // cycles vivid gemstone palettes
  bracelet.group.rotation.set(-1.0, 0, 0);
  bracelet.group.position.set(0, 0, 0);
  bracelet.group.scale.setScalar(0.9);
  iris.uniforms.uAlpha.value = 0;
  iris.uniforms.uDissolve.value = 0;
}

function intro() {
  acts.landing.classList.add('active');
  poseLanding();
  bracelet.gems.forEach((g) => g.scale.setScalar(0.0001));
  state.spin = true;

  const tl = gsap.timeline();
  tl.to(wipe, { clipPath: 'circle(0% at 50% 50%)', duration: 1.4, ease: 'power2.inOut' }, 0.2)
    .to(bracelet.gems.map((g) => g.scale), {
      x: (i) => bracelet.gems[i].userData.baseScale,
      y: (i) => bracelet.gems[i].userData.baseScale,
      z: (i) => bracelet.gems[i].userData.baseScale,
      duration: 1.5, ease: 'power3.out', stagger: 0.035,
    }, 0.5)
    .add(() => $('wordmark').classList.add('visible'), 1)
    .fromTo('#act-landing .copy > *',
      { y: 18, opacity: 0 },
      { y: 0, opacity: 1, duration: 1.1, ease: 'power3.out', stagger: 0.15 }, 1.2);
}

/* ============ ACT II — the reading (cinematic capture) ============ */
const scanner = new Scanner({
  video: $('camVideo'),
  placeholder: { textContent: '', style: {} }, // unused in this design
  captureCanvas: $('captureCanvas'),
});

let captured = false;
let holdTween = null;

$('beginBtn').addEventListener('click', () => {
  state.spin = false;
  goTo('scan', enterScan);
});

// Reset to the front-door choice screen (camera vs upload).
function enterScan() {
  captured = false;
  resetDrawPetal();
  $('camVideo').classList.remove('live');
  $('act-scan').classList.remove('reading', 'live');
  $('scanIntro').hidden = false;
  $('camControls').hidden = true;
  $('scanIntroSub').textContent =
    'Take a quick photo of your eye — or upload one you already have.';
}

// --- Choice: use the camera ---
$('useCameraBtn').addEventListener('click', () => {
  $('scanIntroSub').textContent = 'Starting your camera…';
  scanner.start().then(() => {
    if (state.act !== 'scan' || captured) return;
    if (scanner.ready) goLive();
    else cameraUnavailable();
  });
  // If the permission is never answered, nudge toward upload.
  gsap.delayedCall(8, () => {
    if (state.act === 'scan' && !captured && !scanner.ready) cameraUnavailable();
  });
});

function goLive() {
  $('scanIntro').hidden = true;
  $('camControls').hidden = false;
  $('camVideo').classList.add('live');
  $('act-scan').classList.add('live');
  scramble($('scanStatus'), 'Center your eye, then capture.');
  // Gentle auto-assist: the petal draws itself; if they never press, we
  // capture for them. Pressing CAPTURE (or tapping) fires immediately.
  resetDrawPetal();
  holdTween = gsap.fromTo(drawPath,
    { strokeDashoffset: 1 },
    { strokeDashoffset: 0, duration: 5.0, ease: 'none', delay: 1.2, onComplete: () => fireCapture() });
}

function cameraUnavailable() {
  $('scanIntroSub').textContent =
    "We couldn't reach your camera — no problem, just upload a photo of your eye.";
}

function fireCapture() {
  if (captured || state.act !== 'scan' || !scanner.ready) return;
  if (!scanner.captureFromVideo()) return;
  captured = true;
  holdTween?.kill();
  doReading();
}

$('captureBtn').addEventListener('click', () => fireCapture());
// Tapping the live feed also captures — a forgiving, obvious target.
$('camVideo').addEventListener('click', () => {
  if ($('act-scan').classList.contains('live')) fireCapture();
});

// --- Choice: upload a photo (from either screen) ---
const openUpload = () => $('uploadInput').click();
$('useUploadBtn').addEventListener('click', openUpload);
$('switchUploadBtn').addEventListener('click', openUpload);

$('uploadInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file || captured) return;
  const img = new Image();
  img.onload = () => {
    scanner.captureFromImage(img);
    URL.revokeObjectURL(img.src);
    if (captured) return;
    captured = true;
    holdTween?.kill();
    $('scanIntro').hidden = true;
    $('camControls').hidden = true;
    doReading();
  };
  img.src = URL.createObjectURL(file);
});

// The light-sweep that lifts your color out, then carries into the reveal.
function doReading() {
  $('act-scan').classList.add('reading');
  scramble($('scanStatus'), 'Reading your color…', 700);

  gsap.timeline()
    .set(flash, { opacity: 0, scale: 0.25, transformOrigin: '50% 50%' })
    .to(flash, { opacity: 1, scale: 1.15, duration: 0.5, ease: 'power2.in' })
    .add(() => {
      const hsl = extractIrisColor($('captureCanvas'));
      state.match = buildMatch(hsl ?? { h: 210, s: 0.28, l: 0.45 });
    })
    .to(flash, { opacity: 0, duration: 0.55, ease: 'power2.out' }, '+=0.05')
    .add(() => { $('act-scan').classList.remove('reading'); reveal(); });
}

/* ============ ACT III — the reveal: iris reborn → bracelet ============ */
function reveal() {
  const match = state.match;
  goTo('reveal', () => {
    gsap.killTweensOf([iris.uniforms.uAlpha, iris.uniforms.uDissolve, iris, ...bracelet.gems.map((g) => g.scale)]);
    scanner.stop();

    // Stage the scene: iris in *their* colors, beads in *their* stones, hidden.
    iris.setColors(match.iris);
    iris.uniforms.uAlpha.value = 0;
    iris.uniforms.uDissolve.value = 0;
    iris.basePupil = 0.3;
    iris.mesh.scale.set(1, 1, 1);
    bracelet.setColors(match.gems);
    bracelet.gems.forEach((g) => g.scale.setScalar(0.0001));
    bracelet.group.rotation.set(0, 0, 0);
    bracelet.group.position.set(0, 0, 0);
    bracelet.group.scale.setScalar(1);
    state.spin = false;

    $('stoneName').innerHTML = '<em>&nbsp;</em>';
    gsap.set('#act-reveal .copy > *', { opacity: 0 });

    const tl = gsap.timeline({ delay: 0.3 });

    // 1 — their iris re-forms out of the dark
    tl.to(iris.uniforms.uAlpha, { value: 1, duration: 1.6, ease: 'power2.out' })
      .fromTo(iris.mesh.scale, { x: 0.9, y: 0.9 }, { x: 1, y: 1, duration: 1.8, ease: 'power3.out' }, '<')

      // 2 — pupil contracts, fibres stream outward and crystallize into stones
      .to(iris, { basePupil: 0.05, duration: 1.2, ease: 'power3.inOut' }, '+=0.5')
      .to(iris.uniforms.uDissolve, { value: 1.45, duration: 2.0, ease: 'power2.inOut' }, '<+=0.3')
      .to(bracelet.gems.map((g) => g.scale), {
        x: (i) => bracelet.gems[i].userData.baseScale,
        y: (i) => bracelet.gems[i].userData.baseScale,
        z: (i) => bracelet.gems[i].userData.baseScale,
        duration: 1.3, ease: 'back.out(1.8)', stagger: 0.05,
      }, '<+=0.5')

      // 3 — the ring of stones tips over into jewellery
      .to(bracelet.group.rotation, { x: -1.02, duration: 1.8, ease: 'power3.inOut' }, '<+=0.6')
      .to(bracelet.group.position, { y: 0.22, duration: 1.8, ease: 'power3.inOut' }, '<')
      .to(bracelet.group.scale, { x: 0.86, y: 0.86, z: 0.86, duration: 1.8, ease: 'power3.inOut' }, '<')
      .add(() => { state.spin = true; }, '<+=0.9')

      // 4 — name the stone
      .to('#revealEyebrow', { opacity: 0.45, duration: 0.8 }, '<')
      .add(() => {
        $('stoneName').innerHTML = `<em>${match.stone}</em>`;
        gsap.fromTo('#stoneName', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 1, ease: 'power3.out' });
      }, '<+=0.2')
      .to('#revealSub', { opacity: 0.5, duration: 0.9 }, '<+=0.5')
      .to('#act-reveal .actions', { opacity: 1, duration: 0.9 }, '<+=0.3');
  });
}

$('againBtn').addEventListener('click', () => {
  goTo('landing', () => {
    poseLanding();
    bracelet.gems.forEach((g) => g.scale.setScalar(0.0001));
    gsap.to(bracelet.gems.map((g) => g.scale), {
      x: (i) => bracelet.gems[i].userData.baseScale,
      y: (i) => bracelet.gems[i].userData.baseScale,
      z: (i) => bracelet.gems[i].userData.baseScale,
      duration: 1.2, ease: 'power3.out', stagger: 0.03,
    });
    state.spin = true;
  });
});

/* ============ ACT IV — reserve / checkout ============ */
const sizeState = { size: 'M' };

function swatchGradient(c) {
  return `radial-gradient(circle at 34% 28%, rgba(255,255,255,0.6), ${c} 42%, ${c} 70%, rgba(0,0,0,0.35) 100%)`;
}

$('reserveBtn').addEventListener('click', () => {
  if (!state.match) return;
  goTo('reserve', () => {
    const m = state.match;
    $('reserveStoneName').textContent = m.stone;

    const row = $('reserveBeads');
    row.innerHTML = '';
    m.gems.forEach((c) => {
      const s = document.createElement('span');
      s.style.background = swatchGradient(c);
      row.appendChild(s);
    });

    refreshCheckoutUI();
    gsap.fromTo('#act-reserve .reserve-card > *',
      { y: 16, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', stagger: 0.07 });
  });
});

$('sizeOptions').addEventListener('click', (e) => {
  const btn = e.target.closest('.opt');
  if (!btn) return;
  document.querySelectorAll('#sizeOptions .opt').forEach((o) => o.classList.remove('active'));
  btn.classList.add('active');
  sizeState.size = btn.dataset.size;
  refreshCheckoutUI();
});

function refreshCheckoutUI() {
  const { currency, price, paymentLinks } = config.checkout;
  $('priceVal').textContent = `${currency}${price}`;
  const hasLink = !!paymentLinks[sizeState.size];
  const form = $('reserveForm');
  const btn = $('checkoutBtn');
  if (hasLink) {
    form.classList.add('checkout-mode');
    btn.textContent = `CHECKOUT · ${currency}${price}`;
    $('reserveNote').textContent = 'Secure checkout via Stripe. Your eye photo is never stored.';
  } else {
    form.classList.remove('checkout-mode');
    btn.textContent = 'RESERVE YOURS';
    $('reserveNote').textContent = "Join the list — we'll email you the moment it's ready.";
  }
}

$('reserveForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { paymentLinks, reserveEndpoint } = config.checkout;
  const link = paymentLinks[sizeState.size];

  // Real checkout path — hand off to Stripe (it collects payment + email).
  if (link) {
    window.location.href = link;
    return;
  }

  // Email-reservation fallback (no backend required).
  const email = $('emailInput').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    $('emailInput').focus();
    $('reserveNote').textContent = 'Please enter a valid email.';
    return;
  }
  const reservation = {
    email, stone: state.match.stone, size: sizeState.size,
    colors: state.match.gems, at: new Date().toISOString(),
  };
  try {
    if (reserveEndpoint) {
      await fetch(reserveEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reservation),
      });
    } else {
      const list = JSON.parse(localStorage.getItem('eyematch_reservations') || '[]');
      list.push(reservation);
      localStorage.setItem('eyematch_reservations', JSON.stringify(list));
    }
    $('checkoutBtn').textContent = 'YOU’RE ON THE LIST ✦';
    $('reserveNote').textContent = `We'll reach out at ${email}.`;
  } catch {
    $('reserveNote').textContent = 'Something went wrong — please try again.';
  }
});

$('reserveBackBtn').addEventListener('click', () => goTo('reveal'));

/* ============ shareable result card ============ */
const shareSheet = $('shareSheet');

function drawShareCard() {
  const m = state.match;
  const c = $('shareCanvas');
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;

  // Background.
  ctx.fillStyle = '#07070a';
  ctx.fillRect(0, 0, W, H);
  const bg = ctx.createRadialGradient(W / 2, H * 0.42, 60, W / 2, H * 0.42, W * 0.8);
  bg.addColorStop(0, 'rgba(222,182,128,0.12)');
  bg.addColorStop(1, 'rgba(7,7,10,0)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Ring of stones.
  const cx = W / 2, cy = H * 0.4, R = W * 0.26;
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    const col = m.gems[(i * 7 + Math.floor(i / 5)) % m.gems.length];
    const br = W * 0.046;
    const g = ctx.createRadialGradient(x - br * 0.3, y - br * 0.4, br * 0.1, x, y, br);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.4, col);
    g.addColorStop(1, shade(col, -60));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, br, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyebrow.
  ctx.fillStyle = 'rgba(216,211,218,0.55)';
  ctx.font = '600 26px Manrope, sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '12px';
  ctx.fillText('MY STONE IS', cx, H * 0.72);

  // Stone name.
  ctx.fillStyle = '#f3e6cf';
  ctx.font = 'italic 500 116px Fraunces, serif';
  ctx.letterSpacing = '0px';
  ctx.shadowColor = 'rgba(222,182,128,0.5)';
  ctx.shadowBlur = 50;
  ctx.fillText(m.stone, cx, H * 0.80);
  ctx.shadowBlur = 0;

  // Tagline + wordmark.
  ctx.fillStyle = 'rgba(216,211,218,0.5)';
  ctx.font = '300 30px Manrope, sans-serif';
  ctx.fillText('No two irises are alike. Neither is this.', cx, H * 0.86);

  ctx.fillStyle = 'rgba(226,212,189,0.85)';
  ctx.font = '600 30px Manrope, sans-serif';
  ctx.letterSpacing = '10px';
  ctx.fillText('EYEMATCH', cx, H * 0.93);
}

function openShare() {
  if (!state.match) return;
  // Fonts may need a beat on first use.
  (document.fonts?.ready || Promise.resolve()).then(() => {
    drawShareCard();
    shareSheet.hidden = false;
    $('shareNativeBtn').hidden = !navigator.canShare;
  });
}

$('shareBtn').addEventListener('click', openShare);
$('shareCloseBtn').addEventListener('click', () => { shareSheet.hidden = true; });
shareSheet.addEventListener('click', (e) => { if (e.target === shareSheet) shareSheet.hidden = true; });

$('shareDownloadBtn').addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = `eyematch-${(state.match?.stone || 'stone').toLowerCase().replace(/\s+/g, '-')}.png`;
  a.href = $('shareCanvas').toDataURL('image/png');
  a.click();
});

$('shareNativeBtn').addEventListener('click', async () => {
  $('shareCanvas').toBlob(async (blob) => {
    const file = new File([blob], 'eyematch.png', { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'EyeMatch',
          text: `My stone is ${state.match.stone}. Find yours.`,
        });
      }
    } catch { /* user cancelled */ }
  });
});

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

/* ============ optional Higgsfield hero video (config.heroVideo) ============ */
if (config.heroVideo) {
  const v = $('heroVideo');
  v.src = config.heroVideo;
  v.hidden = false;
}

/* ============ dev hook: simulate a match without a camera ============ */
window.__eyematch = {
  simulate: (hex = '#7a5a32') => {
    state.match = buildMatch(hexToHsl(hex));
    reveal();
  },
  // Internals for headless/hidden-tab debugging (rAF is suspended there,
  // so frames must be driven manually).
  gsap, stage, iris, bracelet, state,
};

/* ============ go ============ */
intro();
