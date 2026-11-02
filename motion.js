// Our animations on the store: the card carousel, products that open as they arrive or as a swipe brings them to the
// middle, and films that play when seen.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wide = matchMedia('(min-width: 821px)');
  const clamp = (v) => Math.min(Math.max(v, 0), 1);
  const stores = {};
  const sequences = new Map();

  // Frames are shared by name, so the carousel's copies and the open dialogs load nothing extra.
  class Sequence {
    constructor(stage) {
      this.stage = stage;
      this.name = stage.dataset.frames;
      this.count = Number(stage.dataset.count);
      this.plate = stage.querySelector('.plate');
      this.canvas = stage.querySelector('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.rail = stage.closest('.rail');
      this.card = stage.closest('.product-card');
      // A pack in a dialog or on its own page opens by itself.
      this.auto = Boolean(stage.closest('dialog, .product-gallery'));
      this.store = stores[this.name] ||= { frames: new Array(this.count), left: this.count, ready: false, loading: false, sequences: new Set() };
      this.store.sequences.add(this);
      this.now = reduce ? 1 : 0;
      this.goal = this.auto || reduce ? 1 : 0;
      this.ease = this.rail ? 0.2 : this.auto ? 0.07 : 0.12;
      this.rate = this.ease;
      this.shown = -1;
      // Outside the carousel, passing a mouse over a pack plays it again.
      if (!this.rail) {
        stage.addEventListener('pointerenter', (e) => {
          if (e.pointerType === 'mouse' && !reduce && this.goal > 0.9) { this.now = 0; this.rate = 0.09; wake(); }
        });
      }
    }

    load() {
      const store = this.store;
      if (store.loading) return;
      store.loading = true;
      // It only starts to move once its frames are in, or the opening would be over before anyone saw it.
      const release = () => { store.ready = true; wake(); };
      setTimeout(release, 2500);
      const order = [0, this.count - 1, ...Array.from({ length: this.count - 2 }, (_, i) => i + 1)];
      for (const i of order) {
        const img = new Image();
        img.decoding = 'async';
        img.src = `assets/frames/${this.name}/${i}.webp`;
        img.onload = () => {
          store.frames[i] = img;
          if (--store.left === 0) release();
          for (const s of store.sequences) if (i === 0 || i === this.count - 1 || i === s.target()) { s.shown = -1; s.draw(); }
          wake();
        };
        img.onerror = () => { if (--store.left === 0) release(); };
      }
    }

    measure(vh) {
      const rect = this.plate.getBoundingClientRect();
      if (!rect.width) { this.goal = this.now; return; } // A copy, hidden on phones.
      let centred = 1;
      if (this.rail) {
        const rail = this.rail.getBoundingClientRect();
        centred = clamp(1 - Math.abs(rect.left + rect.width / 2 - (rail.left + rail.width / 2)) / rect.width);
        this.card.style.setProperty('--p', centred.toFixed(3));
      }
      if (rect.top < vh * 2.5 && rect.bottom > -vh) this.load();
      if (reduce || this.auto) return;
      const start = vh * 0.95;
      const end = vh * 0.5 - rect.height * 0.5;
      this.goal = clamp((start - rect.top) / (start - Math.min(end, start - 200))) * centred;
    }

    target() { return Math.round(this.now * (this.count - 1)); }

    step() {
      if (!this.store.ready && !reduce) { this.draw(); return false; }
      const gap = this.goal - this.now;
      this.now = Math.abs(gap) < 0.0015 ? this.goal : this.now + gap * this.rate;
      if (this.now === this.goal) this.rate = this.ease;
      this.draw();
      return this.now !== this.goal;
    }

    draw() {
      const frames = this.store.frames, i = this.target();
      let best = -1;
      for (let d = 0; d < this.count; d++) {
        if (frames[i - d]) { best = i - d; break; }
        if (frames[i + d]) { best = i + d; break; }
      }
      if (best < 0 || best === this.shown || !this.canvas.clientWidth) return;
      this.shown = best;
      const img = frames[best];
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
      const scale = Math.min(w / img.width, h / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      this.ctx.clearRect(0, 0, w, h);
      this.ctx.drawImage(img, (w - dw) / 2, h - dh, dw, dh);
    }
  }

  let running = false;
  function loop() {
    let moving = false;
    for (const s of sequences.values()) if (s.step()) moving = true;
    if (moving) requestAnimationFrame(loop); else running = false;
  }
  function wake() { if (!running) { running = true; requestAnimationFrame(loop); } }
  function onScroll() {
    for (const s of sequences.values()) s.measure(innerHeight);
    wake();
  }

  // ---- Films ----
  // Low Power Mode, data savers and some in-app browsers won't let a film start by itself. Then the poster stays with a
  // play button on it, and the next tap anywhere starts the film.
  const waiting = new Set();
  function playFilm(v) {
    const plate = v.closest('.film-plate');
    const shown = v.play();
    if (!shown) return;
    shown.then(() => { waiting.delete(v); plate.classList.remove('film-waiting'); }).catch((e) => {
      if (e.name !== 'NotAllowedError') return;
      waiting.add(v);
      plate.classList.add('film-waiting');
    });
  }
  const films = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) { e.target.pause(); continue; }
      if (reduce) { waiting.add(e.target); e.target.closest('.film-plate').classList.add('film-waiting'); continue; }
      playFilm(e.target);
    }
  }, { threshold: 0.25 });
  const retry = () => { if (!reduce) waiting.forEach(playFilm); };
  addEventListener('touchend', retry, { passive: true });
  addEventListener('click', (e) => {
    const button = e.target.closest('.film-play');
    if (button) { button.closest('.film-plate').classList.remove('film-waiting'); playFilm(button.closest('.film-plate').querySelector('video')); }
    else retry();
  });

  // ---- The carousel ----
  // On wide screens a copy of the set sits either side of it, so there are always cards on both sides. On phones the
  // copies stay hidden. They're made before the sequences, so each copy animates too.
  function copyCards(rail) {
    const originals = [...rail.children];
    const copies = () => originals.map((card) => {
      const copy = card.cloneNode(true);
      copy.classList.add('is-copy');
      copy.setAttribute('aria-hidden', 'true');
      copy.querySelectorAll('a, button').forEach((el) => el.setAttribute('tabindex', '-1'));
      return copy;
    });
    rail.prepend(...copies());
    rail.append(...copies());
  }

  function setupRail(rail) {
    const all = [...rail.children];
    const count = all.length / 3;
    const ui = rail.nextElementSibling;
    const ticks = [...ui.querySelectorAll('.rail-ticks button')];
    const sequencesOf = all.map((card) => sequences.get(card.querySelector('[data-frames]')));
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
      rail.scrollTo({ left: offsetFor(card), behavior: reduce ? 'auto' : 'smooth' });
    };
    const mark = () => {
      const now = current();
      ticks.forEach((t, i) => t.classList.toggle('on', i === now % count));
      ui.querySelector('[data-go="-1"]').disabled = !wide.matches && now === count;
      ui.querySelector('[data-go="1"]').disabled = !wide.matches && now === count * 2 - 1;
    };

    // After a move ends on a copy, jump to the same place in the middle set. The cards look identical, so it can't be seen.
    let down = false, moved = false, settle = 0;
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
      clearTimeout(settle);
      settle = setTimeout(wrap, 160);
    }, { passive: true });
    rail.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(current() + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(current() - 1); }
    });

    // Dragging with a mouse. A drag that ends on a link doesn't follow it.
    let x0 = 0, left0 = 0;
    rail.addEventListener('dragstart', (e) => e.preventDefault());
    rail.addEventListener('pointerdown', (e) => {
      stopNudge();
      if (e.pointerType !== 'mouse') return;
      down = true; moved = false; x0 = e.clientX; left0 = rail.scrollLeft;
    });
    addEventListener('pointermove', (e) => {
      if (!down) return;
      if (Math.abs(e.clientX - x0) > 5) { moved = true; rail.classList.add('dragging'); }
      if (moved) rail.scrollLeft = left0 - (e.clientX - x0);
    });
    addEventListener('pointerup', () => {
      if (!down) return;
      down = false;
      if (!moved) return;
      rail.classList.remove('dragging');
      go(current());
    });
    rail.addEventListener('click', (e) => {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
    }, true);

    // The cards lean over once when they first come into view, to show they move.
    function stopNudge() { rail.classList.remove('nudge'); }
    rail.addEventListener('animationend', stopNudge);
    if (!reduce) {
      const seen = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        seen.disconnect();
        rail.classList.add('nudge');
      }, { threshold: 0.6 });
      seen.observe(rail);
    }

    wide.addEventListener('change', start);
    start();
  }

  // The store renders its pages and dialogs from code, so new packs and films are picked up as they appear.
  function scan() {
    for (const [el, s] of sequences) if (!el.isConnected) { s.store.sequences.delete(s); sequences.delete(el); }
    const rails = [...document.querySelectorAll('.rail:not([data-ready])')];
    rails.forEach((rail) => { rail.dataset.ready = '1'; copyCards(rail); });
    document.querySelectorAll('[data-frames]').forEach((el) => { if (!sequences.has(el)) sequences.set(el, new Sequence(el)); });
    rails.forEach(setupRail);
    document.querySelectorAll('.film-plate video:not([data-seen])').forEach((v) => { v.dataset.seen = '1'; films.observe(v); });
    onScroll();
  }
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan(); });
  }).observe(document.body, { childList: true, subtree: true });

  addEventListener('scroll', onScroll, { passive: true, capture: true });
  addEventListener('resize', () => { for (const s of sequences.values()) s.shown = -1; onScroll(); });
  scan();
})();
