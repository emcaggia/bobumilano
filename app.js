// BOBU Milano: product frames that follow the swipe and the scroll, cards, and films that play when seen.

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

// Frame sequences. On the page, a product opens as it travels up the screen. In a card, it also
// opens as the card arrives in the middle and closes as it leaves, so the swipe plays the animation.

class Sequence {
  constructor(section) {
    this.section = section;
    this.name = section.dataset.frames;
    this.count = Number(section.dataset.count);
    this.rail = section.closest('.rail');
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
        if (i === 0 || i === this.count - 1 || i === this.target()) { this.shown = -1; this.draw(); wake(); }
      };
    }
  }

  measure(vh) {
    const rect = this.plate.getBoundingClientRect();
    const near = rect.top < vh * 2.5 && rect.bottom > -vh;
    let centred = 1;
    if (this.rail) {
      const rail = this.rail.getBoundingClientRect();
      const off = Math.abs(rect.left + rect.width / 2 - (rail.left + rail.width / 2)) / rect.width;
      centred = clamp(1 - off);
      this.section.style.setProperty('--p', centred.toFixed(3));
    }
    if (near) this.load();
    if (reduceMotion) return;
    const start = vh * 0.95;
    const end = vh * 0.5 - rect.height * 0.5;
    this.goal = clamp((start - rect.top) / (start - Math.min(end, start - 200))) * centred;
  }

  target() {
    return Math.round(this.now * (this.count - 1));
  }

  // Eases towards the goal; true while it still has somewhere to go.
  step() {
    const gap = this.goal - this.now;
    this.now = Math.abs(gap) < 0.0015 ? this.goal : this.now + gap * 0.2;
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

// Card rails: swipe on a phone, drag or use the arrows with a mouse.

document.querySelectorAll('.rail').forEach((rail) => {
  const cards = [...rail.children];
  const ui = rail.nextElementSibling;
  const ticks = [...ui.querySelectorAll('.rail-ticks button')];
  const current = () => {
    const mid = rail.getBoundingClientRect().left + rail.clientWidth / 2;
    let best = 0, gap = Infinity;
    cards.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (d < gap) { gap = d; best = i; }
    });
    return best;
  };
  const go = (i) => {
    const card = cards[Math.min(Math.max(i, 0), cards.length - 1)];
    rail.scrollTo({ left: card.offsetLeft - (rail.clientWidth - card.offsetWidth) / 2, behavior: reduceMotion ? 'auto' : 'smooth' });
  };
  const mark = () => {
    const now = current();
    ticks.forEach((t, i) => t.classList.toggle('on', i === now));
  };
  ticks.forEach((t, i) => t.addEventListener('click', () => go(i)));
  ui.querySelectorAll('.rail-arrow').forEach((a) => a.addEventListener('click', () => go(current() + Number(a.dataset.go))));
  rail.addEventListener('scroll', () => { mark(); onScroll(); }, { passive: true });
  rail.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(current() + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(current() - 1); }
  });

  let down = false, x0 = 0, left0 = 0;
  rail.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    down = true; x0 = e.clientX; left0 = rail.scrollLeft;
    rail.classList.add('dragging');
  });
  window.addEventListener('pointermove', (e) => { if (down) rail.scrollLeft = left0 - (e.clientX - x0); });
  window.addEventListener('pointerup', () => {
    if (!down) return;
    down = false;
    rail.classList.remove('dragging');
    go(current());
  });
  mark();
});

onScroll();
