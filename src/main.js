import './styles.css';
import gsap from 'gsap';
import { config, petalEdge } from './config.js';
import { Stage } from './three/stage.js';
import { Iris } from './three/iris.js';
import { Bracelet } from './three/bracelet.js';
import { Scanner, extractIrisColor, buildMatch, hexToHsl } from './scan.js';
import { AudioEngine } from './audio.js';

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

/* ============ audio ============ */
const audio = new AudioEngine();
const soundToggle = $('soundToggle');
soundToggle.addEventListener('click', () => {
  const on = audio.toggle();
  soundToggle.classList.toggle('on', on);
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
  document.querySelectorAll('.cta, .wordmark, .sound-toggle').forEach((n) => {
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
const acts = { landing: $('act-landing'), scan: $('act-scan'), reveal: $('act-reveal') };

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
  audio.whoosh();
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
    .add(() => {
      $('wordmark').classList.add('visible');
      soundToggle.classList.add('visible');
    }, 1)
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
  audio.click();
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
  audio.click();
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

$('captureBtn').addEventListener('click', () => { audio.click(); fireCapture(); });
// Tapping the live feed also captures — a forgiving, obvious target.
$('camVideo').addEventListener('click', () => {
  if ($('act-scan').classList.contains('live')) { audio.click(); fireCapture(); }
});

// --- Choice: upload a photo (from either screen) ---
const openUpload = () => { audio.click(); $('uploadInput').click(); };
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
  audio.scan(0.9);

  gsap.timeline()
    .set(flash, { opacity: 0, scale: 0.25, transformOrigin: '50% 50%' })
    .to(flash, { opacity: 1, scale: 1.15, duration: 0.5, ease: 'power2.in' })
    .add(() => {
      const hsl = extractIrisColor($('captureCanvas'));
      state.match = buildMatch(hsl ?? { h: 210, s: 0.28, l: 0.45 });
      audio.chime();
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
      .add(() => audio.chime(), '+=0.5')
      .to(iris, { basePupil: 0.05, duration: 1.2, ease: 'power3.inOut' }, '<')
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
  audio.click();
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

$('reserveBtn').addEventListener('click', (e) => {
  audio.click();
  scramble(e.currentTarget, 'COMING SOON', 600);
  setTimeout(() => scramble(e.currentTarget, 'RESERVE YOURS', 600), 2200);
});

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
