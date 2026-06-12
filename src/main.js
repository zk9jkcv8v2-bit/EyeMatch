import './styles.css';
import gsap from 'gsap';
import { config, petalEdge } from './config.js';
import { Stage } from './three/stage.js';
import { Iris } from './three/iris.js';
import { Bracelet } from './three/bracelet.js';
import { BrandRing } from './three/brandring.js';
import { Scanner, extractIrisColor, buildMatch, hexToHsl } from './scan.js';
import { AudioEngine } from './audio.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduced) gsap.globalTimeline.timeScale(6);

const $ = (id) => document.getElementById(id);

/* ============ three.js scene ============ */
const stage = new Stage($('webgl'), { reducedMotion: reduced });

const iris = new Iris({ petals: config.petals });
iris.basePupil = 0.3;
iris.setColors(config.brandIris);
stage.world.add(iris.mesh);

const ring = new BrandRing();
stage.world.add(ring.mesh);

const bracelet = new Bracelet({ count: config.beadCount });
bracelet.setColors(config.brandBeads);
stage.world.add(bracelet.group);

const state = { act: 'landing', spin: false, match: null };

stage.onTick.push((t, dt) => {
  iris.update(t);
  bracelet.update(t, dt);
  if (state.spin) bracelet.group.rotation.z += dt * 0.12;
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

/* ============ brand-shaped viewfinder frame (8-petal star) ============ */
(function buildScallopFrame() {
  const pts = [];
  for (let i = 0; i <= 256; i++) {
    const a = (i / 256) * Math.PI * 2;
    const r = 100 * petalEdge(a);
    pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
  }
  $('scallopFrame').innerHTML =
    `<path d="M${pts.join('L')}Z" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
})();

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

/* ============ ACT I — landing intro + the "two truths" tease ============ */
let tease = null;

function startTease() {
  if (reduced) return;
  stopTease();
  tease = gsap.timeline({ repeat: -1, repeatDelay: 7, delay: 2.4 });
  tease
    .to(iris.uniforms.uDissolve, { value: 0.34, duration: 1.4, ease: 'power2.inOut' }, 0)
    .to(iris, { basePupil: 0.2, duration: 1.4, ease: 'power2.inOut' }, 0)
    .to(bracelet.gems.map((g) => g.scale), {
      x: 0.55, y: 0.55, z: 0.55, duration: 1.1, ease: 'back.out(2)', stagger: 0.025,
    }, 0.25)
    .to(iris.uniforms.uDissolve, { value: 0, duration: 1.3, ease: 'power2.inOut' }, 2.1)
    .to(iris, { basePupil: 0.3, duration: 1.3, ease: 'power2.inOut' }, 2.1)
    .to(bracelet.gems.map((g) => g.scale), {
      x: 0.0001, y: 0.0001, z: 0.0001, duration: 0.9, ease: 'power3.in', stagger: 0.018,
    }, 2.0);
}
function stopTease() {
  tease?.kill();
  tease = null;
}

function intro() {
  acts.landing.classList.add('active');
  const tl = gsap.timeline();
  tl.to(wipe, { clipPath: 'circle(0% at 50% 50%)', duration: 1.4, ease: 'power2.inOut' }, 0.2)
    .to(iris.uniforms.uAlpha, { value: 1, duration: 1.8, ease: 'power2.out' }, 0.4)
    .to(ring.material, { opacity: 1, duration: 1.8, ease: 'power2.out' }, 0.6)
    .fromTo(iris.mesh.scale, { x: 0.86, y: 0.86 }, { x: 1, y: 1, duration: 2, ease: 'power3.out' }, 0.4)
    .fromTo(ring.mesh.scale, { x: 0.92, y: 0.92, z: 0.92 }, { x: 1, y: 1, z: 1, duration: 2, ease: 'power3.out' }, 0.4)
    .add(() => {
      $('wordmark').classList.add('visible');
      soundToggle.classList.add('visible');
    }, 1)
    .fromTo('#act-landing .copy > *',
      { y: 18, opacity: 0 },
      { y: 0, opacity: 1, duration: 1.1, ease: 'power3.out', stagger: 0.15 }, 1.2)
    .add(startTease, 1.6);
}

/* ============ ACT II — scan ============ */
const scanner = new Scanner({
  video: $('camVideo'),
  placeholder: $('camPlaceholder'),
  captureCanvas: $('captureCanvas'),
});

$('beginBtn').addEventListener('click', () => {
  audio.click();
  stopTease();
  gsap.to(iris.uniforms.uDissolve, { value: 0, duration: 0.3 });
  bracelet.gems.forEach((g) => g.scale.setScalar(0.0001));
  goTo('scan', () => {
    gsap.to(iris.uniforms.uAlpha, { value: 0.08, duration: 0.6 });
    gsap.to(ring.material, { opacity: 0.1, duration: 0.6 });
    scramble($('scanStatus'), 'Come closer. Let it see you.');
    scanner.start();
  });
});

let scanning = false;

function runMatch() {
  if (scanning) return;
  scanning = true;
  $('scanOverlay').classList.add('active');
  audio.scan(1.9);
  scramble($('scanStatus'), 'Reading your iris…', 700);

  setTimeout(() => {
    const hsl = extractIrisColor($('captureCanvas'));
    state.match = buildMatch(hsl ?? { h: 210, s: 0.28, l: 0.45 });
    scramble($('scanStatus'), `Matched: ${state.match.stone}`, 700);
    setTimeout(() => {
      $('scanOverlay').classList.remove('active');
      scanning = false;
      reveal();
    }, 1100);
  }, 1900);
}

$('captureBtn').addEventListener('click', () => {
  audio.click();
  if (scanner.captureFromVideo()) runMatch();
  else scramble($('scanStatus'), 'Camera not ready — try uploading a photo', 700);
});

$('uploadBtn').addEventListener('click', () => {
  audio.click();
  $('uploadInput').click();
});
$('uploadInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    scanner.captureFromImage(img);
    URL.revokeObjectURL(img.src);
    runMatch();
  };
  img.src = URL.createObjectURL(file);
});

/* ============ ACT III — the reveal: iris reborn → bracelet ============ */
function reveal() {
  const match = state.match;
  goTo('reveal', () => {
    stopTease();
    gsap.killTweensOf([iris.uniforms.uAlpha, iris.uniforms.uDissolve, iris, ring.material, ...bracelet.gems.map((g) => g.scale)]);
    scanner.stop();

    // Stage the scene: iris in *their* colors, beads in *their* stones, hidden.
    iris.setColors(match.iris);
    iris.uniforms.uAlpha.value = 0;
    iris.uniforms.uDissolve.value = 0;
    iris.basePupil = 0.3;
    ring.material.opacity = 0;
    ring.mesh.scale.setScalar(1);
    bracelet.setColors(match.gems);
    bracelet.gems.forEach((g) => g.scale.setScalar(0.0001));
    bracelet.group.rotation.set(0, 0, 0);
    bracelet.group.position.set(0, 0, 0);
    bracelet.group.scale.setScalar(1);
    state.spin = false;

    $('stoneName').innerHTML = '<em>&nbsp;</em>';
    gsap.set('#act-reveal .copy > *', { opacity: 0 });

    const tl = gsap.timeline({ delay: 0.3 });

    // 1 — their iris re-forms out of the dark, framed by the brand ring
    tl.to(iris.uniforms.uAlpha, { value: 1, duration: 1.6, ease: 'power2.out' })
      .to(ring.material, { opacity: 1, duration: 1.6, ease: 'power2.out' }, '<')
      .fromTo(iris.mesh.scale, { x: 0.9, y: 0.9 }, { x: 1, y: 1, duration: 1.8, ease: 'power3.out' }, '<')

      // 2 — pupil contracts, fibres stream outward and set into stones
      .add(() => audio.chime(), '+=0.5')
      .to(iris, { basePupil: 0.05, duration: 1.2, ease: 'power3.inOut' }, '<')
      .to(iris.uniforms.uDissolve, { value: 1.45, duration: 2.0, ease: 'power2.inOut' }, '<+=0.3')
      // the brand ring releases the stones: it brightens, then lets go
      .to(ring.material, { opacity: 0, duration: 1.6, ease: 'power2.inOut' }, '<+=0.7')
      .to(ring.mesh.scale, { x: 1.12, y: 1.12, z: 1.12, duration: 1.8, ease: 'power2.inOut' }, '<')
      .to(bracelet.gems.map((g) => g.scale), {
        x: (i) => bracelet.gems[i].userData.baseScale,
        y: (i) => bracelet.gems[i].userData.baseScale,
        z: (i) => bracelet.gems[i].userData.baseScale,
        duration: 1.3, ease: 'back.out(1.8)', stagger: 0.04,
      }, '<-=0.2')

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
    state.spin = false;
    iris.setColors(config.brandIris);
    iris.uniforms.uAlpha.value = 1;
    iris.uniforms.uDissolve.value = 0;
    iris.basePupil = 0.3;
    iris.mesh.scale.set(1, 1, 1);
    ring.material.opacity = 1;
    ring.mesh.scale.setScalar(1);
    bracelet.setColors(config.brandBeads);
    bracelet.gems.forEach((g) => g.scale.setScalar(0.0001));
    bracelet.group.rotation.set(0, 0, 0);
    bracelet.group.position.set(0, 0, 0);
    bracelet.group.scale.setScalar(1);
    startTease();
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
  gsap, stage, iris, bracelet, ring, state,
};

/* ============ go ============ */
intro();
