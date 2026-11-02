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

// On wide screens the product cards loop: a copy of the set sits either side of it, so there are always cards on both
// sides. On phones the copies stay hidden. They're made before the sequences below, so each copy animates too.

const wide = window.matchMedia('(min-width: 821px)');
document.querySelectorAll('.rail').forEach((rail) => {
  const originals = [...rail.children];
  const copies = () => originals.map((card) => {
    const copy = card.cloneNode(true);
    copy.removeAttribute('id');
    copy.classList.add('is-copy');
    copy.setAttribute('aria-hidden', 'true');
    return copy;
  });
  rail.prepend(...copies());
  rail.append(...copies());
});

// Frame sequences. On the page, a product opens as it travels up the screen. In a card, it also
// opens as the card arrives in the middle and closes as it leaves, so the swipe plays the animation.

// Frames are shared by name, so the looping copies don't load or hold anything extra.
const frameStore = {};

class Sequence {
  constructor(section) {
    this.section = section;
    this.name = section.dataset.frames;
    this.count = Number(section.dataset.count);
    this.rail = section.closest('.rail');
    this.plate = section.querySelector('.plate');
    this.canvas = section.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.store = frameStore[this.name] ||= { frames: new Array(this.count), loaded: false, sequences: [] };
    this.store.sequences.push(this);
    this.frames = this.store.frames;
    this.goal = reduceMotion ? 1 : 0;
    this.now = this.goal;
    this.shown = -1;
  }

  load() {
    if (this.store.loaded) return;
    this.store.loaded = true;
    // The ends first, so something sensible shows straight away.
    const order = [0, this.count - 1, ...Array.from({ length: this.count - 2 }, (_, i) => i + 1)];
    for (const i of order) {
      const img = new Image();
      img.decoding = 'async';
      img.src = `assets/frames/${this.name}/${i}.webp`;
      img.onload = () => {
        this.frames[i] = img;
        for (const s of this.store.sequences) {
          if (i === 0 || i === this.count - 1 || i === s.target()) { s.shown = -1; s.draw(); }
        }
        wake();
      };
    }
  }

  measure(vh) {
    const rect = this.plate.getBoundingClientRect();
    if (!rect.width) { this.goal = this.now; return; } // A copy, hidden on phones.
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
    if (best < 0 || best === this.shown || !this.canvas.clientWidth) return;
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

// "How IDs work" opens in place.

const idsToggle = document.querySelector('.ids-toggle');
if (idsToggle) {
  const panel = document.getElementById(idsToggle.getAttribute('aria-controls'));
  idsToggle.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    idsToggle.setAttribute('aria-expanded', String(open));
  });
}

// Card rails: swipe on a phone; on wide screens drag or use the arrows, and the set loops.

document.querySelectorAll('.rail').forEach((rail) => {
  const all = [...rail.children];
  const count = all.length / 3;
  const ui = rail.nextElementSibling;
  const ticks = [...ui.querySelectorAll('.rail-ticks button')];
  const sequencesOf = all.map((card) => sequences.find((s) => s.section === card));
  const shown = () => (wide.matches ? all : all.slice(count, count * 2));
  const offsetFor = (card) => card.offsetLeft - (rail.clientWidth - card.offsetWidth) / 2;

  const current = () => {
    const mid = rail.getBoundingClientRect().left + rail.clientWidth / 2;
    let best = null, gap = Infinity;
    for (const c of shown()) {
      const r = c.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (d < gap) { gap = d; best = c; }
    }
    return all.indexOf(best);
  };
  const go = (i) => {
    const list = shown();
    const card = all[Math.min(Math.max(i, all.indexOf(list[0])), all.indexOf(list[list.length - 1]))];
    rail.scrollTo({ left: offsetFor(card), behavior: reduceMotion ? 'auto' : 'smooth' });
  };
  const mark = () => {
    const now = current() % count;
    ticks.forEach((t, i) => t.classList.toggle('on', i === now));
  };

  // After a move ends on a copy, jump to the same place in the middle set. The cards look identical, so it can't be seen.
  let down = false, settle = 0;
  const wrap = () => {
    if (down || !wide.matches) return;
    const i = current();
    const shift = i < count ? count : i >= count * 2 ? -count : 0;
    if (!shift) return;
    const was = sequencesOf.map((s) => s.now);
    rail.scrollLeft += Math.sign(shift) * (all[count].offsetLeft - all[0].offsetLeft);
    sequencesOf.forEach((s, n) => { s.now = was[n - shift] ?? 0; s.shown = -1; s.draw(); });
    onScroll();
  };
  const start = () => { rail.scrollLeft = offsetFor(all[count]); mark(); onScroll(); };

  ticks.forEach((t, i) => t.addEventListener('click', () => {
    // The nearest copy of that card, so the loop always takes the short way round.
    const here = current();
    const options = wide.matches ? [i, i + count, i + count * 2] : [i + count];
    go(options.reduce((a, b) => (Math.abs(b - here) < Math.abs(a - here) ? b : a)));
  }));
  ui.querySelectorAll('.rail-arrow').forEach((a) => a.addEventListener('click', () => go(current() + Number(a.dataset.go))));
  rail.addEventListener('scroll', () => {
    mark();
    onScroll();
    clearTimeout(settle);
    settle = setTimeout(wrap, 160);
  }, { passive: true });
  rail.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(current() + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(current() - 1); }
  });

  let x0 = 0, left0 = 0;
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
  wide.addEventListener('change', start);
  start();
});

onScroll();
