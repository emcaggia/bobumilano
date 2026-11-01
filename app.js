// BOBU Milano: product frames that play as the page scrolls, and a few small motions.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Nav border once the page has moved

const nav = document.querySelector('.nav');

// Things that come up as they enter the screen

const seen = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) { e.target.classList.add('seen'); seen.unobserve(e.target); }
  }
}, { rootMargin: '0px 0px -10% 0px' });
document.querySelectorAll('.reveal').forEach((el) => seen.observe(el));

// The films play only while they're on screen.

const films = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting && !reduceMotion) e.target.play().catch(() => {});
    else e.target.pause();
  }
}, { threshold: 0.25 });
document.querySelectorAll('video').forEach((v) => films.observe(v));

// Frame sequences

class Scrub {
  constructor(section) {
    this.section = section;
    this.name = section.dataset.frames;
    this.count = Number(section.dataset.count);
    this.canvas = section.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.frames = new Array(this.count);
    this.loaded = false;
    this.current = -1;
    this.target = 0;
  }

  load() {
    if (this.loaded) return;
    this.loaded = true;
    // The first and last frames first, so something sensible shows straight away.
    const order = [0, this.count - 1, ...Array.from({ length: this.count - 2 }, (_, i) => i + 1)];
    for (const i of order) {
      const img = new Image();
      img.decoding = 'async';
      img.src = `assets/frames/${this.name}/${i}.webp`;
      img.onload = () => {
        this.frames[i] = img;
        if (this.current === -1 || i === this.target) this.draw(true);
      };
    }
  }

  update() {
    const rect = this.section.getBoundingClientRect();
    const vh = window.innerHeight;
    if (rect.top < vh * 2 && rect.bottom > -vh) this.load();
    const run = rect.height - vh;
    const p = reduceMotion ? 1 : (run > 0 ? Math.min(Math.max(-rect.top / run, 0), 1) : 0);
    // Opens over the first 80% of the section, then holds open.
    this.target = Math.round(Math.min(p / 0.8, 1) * (this.count - 1));
    this.section.style.setProperty('--in', rect.top < vh * 0.45 ? '1' : '0');
    this.section.style.setProperty('--p', p.toFixed(3));
    this.draw();
  }

  draw(force = false) {
    // The nearest frame that has arrived.
    const i = this.target;
    let best = -1;
    for (let d = 0; d < this.count; d++) {
      if (this.frames[i - d]) { best = i - d; break; }
      if (this.frames[i + d]) { best = i + d; break; }
    }
    if (best < 0 || (best === this.current && !force)) return;
    this.current = best;
    const img = this.frames[best];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    // Contain, centred: the whole pack always shows, and the frames are transparent.
    const scale = Math.min(w / img.width, h / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
}

const scrubs = [...document.querySelectorAll('.scrub')].map((s) => new Scrub(s));

let ticking = false;
function tick() {
  ticking = false;
  nav.classList.toggle('scrolled', window.scrollY > 8);
  scrubs.forEach((s) => s.update());
}
function request() {
  if (!ticking) { ticking = true; requestAnimationFrame(tick); }
}
window.addEventListener('scroll', request, { passive: true });
window.addEventListener('resize', () => { scrubs.forEach((s) => (s.current = -1)); request(); });
tick();
