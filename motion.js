// The card carousel, products that swipe through their shots, and films that play when seen.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wide = matchMedia('(min-width: 821px)');

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
  // copies stay hidden.
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
      rail.scrollLeft += Math.sign(shift) * (all[count].offsetLeft - all[0].offsetLeft);
    };
    const start = () => { rail.scrollLeft = offsetFor(all[count]); mark(); };

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

  // A finger swipes through the shots on a phone. With a mouse they swipe by themselves while it's over the product.
  function setupSwipe(swipe) {
    const count = swipe.children.length;
    const dots = [...swipe.nextElementSibling.children];
    const area = swipe.closest('.product-card, .product-gallery') || swipe;
    const go = (i) => swipe.scrollTo({ left: i * swipe.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
    const mark = () => {
      const now = Math.round(swipe.scrollLeft / (swipe.clientWidth || 1));
      dots.forEach((d, i) => d.classList.toggle('on', i === now));
    };
    swipe.addEventListener('scroll', mark, { passive: true });
    mark();
    let timer = 0, at = 0;
    const next = () => {
      if (!swipe.isConnected) { clearInterval(timer); return; }
      at = (at + 1) % count;
      go(at);
    };
    area.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearInterval(timer);
      next();
      timer = setInterval(next, 1500);
    });
    area.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearInterval(timer);
      at = 0;
      go(0);
    });
  }

  // The store renders its pages and dialogs from code, so new carousels and shots are picked up as they appear.
  function scan() {
    document.querySelectorAll('.rail:not([data-ready])').forEach((rail) => {
      rail.dataset.ready = '1';
      copyCards(rail);
      setupRail(rail);
    });
    document.querySelectorAll('.swipe:not([data-ready])').forEach((swipe) => {
      swipe.dataset.ready = '1';
      setupSwipe(swipe);
    });
    document.querySelectorAll('.film-plate video:not([data-seen])').forEach((v) => { v.dataset.seen = '1'; films.observe(v); });
  }
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan(); });
  }).observe(document.body, { childList: true, subtree: true });

  scan();
})();
