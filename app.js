// BOBU Milano: product frames that follow the scroll, with no pinning, and films that play when seen.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const nav = document.querySelector('.nav');
const clamp = (v) => Math.min(Math.max(v, 0), 1);

// The films play only while they're on screen.

const films = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting && !reduceMotion) e.target.play().catch(() => {});
    else e.target.pause();
  }
}, { threshold: 0.25 });
document.querySelectorAll('video').forEach((v) => films.observe(v));

// Frame sequences. A product opens as its plate travels up the screen: starting as the plate
// comes in at the bottom, finished once it reaches the middle. The page never stops moving.

class Sequence {
  constructor(section) {
    this.name = section.dataset.frames;
    this.count = Number(section.dataset.count);
    this.plate = section.querySelector('.plate');
    this.canvas = section.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.frames = new Array(this.count);
    this.loaded = false;
    this.goal = reduceMotion ? 1 : 0;
    this.now = this.goal;
    this.shown = -1;
  }

  load() {
    if (this.loaded) return;
    this.loaded = true;
    // The ends first, so something sensible shows straight away.
    const order = [0, this.count - 1, ...Array.from({ length: this.count - 2 }, (_, i) => i + 1)];
    for (const i of order) {
      const img = new Image();
      img.decoding = 'async';
      img.src = `assets/frames/${this.name}/${i}.webp`;
      img.onload = () => {
        this.frames[i] = img;
        if (i === 0 || i === this.count - 1 || i === this.target()) { this.shown = -1; wake(); }
      };
    }
  }

  measure(vh) {
    const rect = this.plate.getBoundingClientRect();
    if (rect.top < vh * 2.5 && rect.bottom > -vh) this.load();
    if (reduceMotion) return;
    const start = vh * 0.95;
    const end = vh * 0.5 - rect.height * 0.5;
    this.goal = clamp((start - rect.top) / (start - Math.min(end, start - 200)));
  }

  target() {
    return Math.round(this.now * (this.count - 1));
  }

  // Eases towards the scroll position; true while it still has somewhere to go.
  step() {
    const gap = this.goal - this.now;
    this.now = Math.abs(gap) < 0.0015 ? this.goal : this.now + gap * 0.16;
    this.draw();
    return this.now !== this.goal;
  }

  draw() {
    const i = this.target();
    let best = -1;
    for (let d = 0; d < this.count; d++) {
      if (this.frames[i - d]) { best = i - d; break; }
      if (this.frames[i + d]) { best = i + d; break; }
    }
    if (best < 0 || best === this.shown) return;
    this.shown = best;
    const img = this.frames[best];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const scale = Math.min(w / img.width, h / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    this.ctx.clearRect(0, 0, w, h);
    // Stands on the foot of its box, so a product stays on its plinth at any screen size.
    this.ctx.drawImage(img, (w - dw) / 2, h - dh, dw, dh);
  }
}

const sequences = [...document.querySelectorAll('[data-frames]')].map((s) => new Sequence(s));

let running = false;
function loop() {
  let moving = false;
  for (const s of sequences) if (s.step()) moving = true;
  if (moving) requestAnimationFrame(loop);
  else running = false;
}
function wake() {
  if (!running) { running = true; requestAnimationFrame(loop); }
}
function onScroll() {
  const vh = window.innerHeight;
  nav.classList.toggle('scrolled', window.scrollY > 8);
  for (const s of sequences) s.measure(vh);
  wake();
}
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', () => { for (const s of sequences) s.shown = -1; onScroll(); });
onScroll();
