// Page-level behaviour: contents highlighting, featured case switcher, BibTeX copy. Colours follow the system theme.
(function () {
  'use strict';

  // ---------- contents highlighting ----------
  const links = [...document.querySelectorAll('.toc a[href^="#"]')];
  const targets = links.map(a => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  if ('IntersectionObserver' in window && targets.length) {
    const visible = new Map();
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => visible.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : null));
      let best = null, bestTop = Infinity;
      for (const t of targets) {
        const top = visible.get(t.id);
        if (top != null && Math.abs(top) < bestTop) { best = t.id; bestTop = Math.abs(top); }
      }
      if (best) {
        links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + best));
        // Inside a collapsed group, its parent entry carries the highlight.
        document.querySelectorAll('.toc-group').forEach(g => {
          const parent = g.previousElementSibling?.querySelector('a');
          if (parent && g.hidden && g.querySelector('a.active')) parent.classList.add('active');
        });
      }
    }, { rootMargin: '-10% 0px -70% 0px' });
    targets.forEach(t => io.observe(t));
  }

  // ---------- contents: collapsible groups (the tools list starts collapsed) ----------
  document.querySelectorAll('.toc-toggle').forEach(btn => btn.addEventListener('click', () => {
    const group = document.getElementById(btn.getAttribute('aria-controls'));
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Hide the tools' : 'Show the tools');
    if (group) group.hidden = !open;
    if (group?.querySelector('a.active')) btn.previousElementSibling?.classList.toggle('active', !open);
  }));

  // ---------- collapsed tools: open the one a link or the URL points to ----------
  const openTarget = hash => {
    let el = null;
    try { el = hash && hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null; } catch (e) { /* bad hash */ }
    const d = el && (el.querySelector(':scope > details') || el.closest('details'));
    if (d && !d.open) d.open = true;
  };
  document.addEventListener('click', e => { const a = e.target.closest('a[href^="#"]'); if (a) openTarget(a.getAttribute('href')); });
  window.addEventListener('hashchange', () => openTarget(location.hash));
  openTarget(location.hash);

  // ---------- synchronized video pairs ----------
  // Videos with the same data-sync group autoplay muted and loop; followers are locked to the first
  // video's clock. Clicking any of them pauses or resumes the group; groups pause off screen.
  const groups = {};
  document.querySelectorAll('video[data-sync]').forEach(v => (groups[v.dataset.sync] ||= []).push(v));
  const syncGroup = {};
  Object.entries(groups).forEach(([name, vids]) => {
    if (vids.length < 2) return;
    const lead = vids[0];
    let userPaused = false, onScreen = false;
    const play = v => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };
    const playAll = () => vids.forEach(v => { v.currentTime = lead.currentTime; play(v); });
    const pauseAll = () => vids.forEach(v => v.pause());
    lead.addEventListener('timeupdate', () => {
      vids.slice(1).forEach(v => { if (Math.abs(v.currentTime - lead.currentTime) > 0.08) v.currentTime = lead.currentTime; });
    });
    lead.addEventListener('play', () => vids.slice(1).forEach(v => { if (v.paused) play(v); }));
    vids.forEach(v => v.addEventListener('click', () => {
      if (lead.paused) { userPaused = false; playAll(); } else { userPaused = true; pauseAll(); }
    }));
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => es.forEach(e => {
        onScreen = e.isIntersecting;
        if (onScreen && !userPaused) playAll(); else if (!onScreen) pauseAll();
      }), { threshold: 0.25 }).observe(lead);
    }
    syncGroup[name] = { restart: () => { vids.forEach(v => { v.currentTime = 0; }); if (!userPaused) playAll(); } };
  });

  // ---------- showcase: latest reconstructions, input and simulation side by side ----------
  const tabs = document.getElementById('case-tabs');
  const src = document.getElementById('show-src'), sim = document.getElementById('show-sim');
  const blender = document.getElementById('show-blender'), blenderFig = document.getElementById('show-blender-fig');
  const pair = document.getElementById('show-pair');
  if (tabs && src && sim) {
    const setSource = (v, url, posterUrl) => { v.poster = posterUrl; v.src = url; v.load(); };
    const select = (c, btn) => {
      tabs.querySelectorAll('.case-tab').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      pair.style.setProperty('--aspect', String(c.aspect));
      setSource(src, c.media.source, c.media.source_poster);
      setSource(sim, c.media.sim, c.media.sim_poster);
      // The Blender render is optional per case; without one the pair goes back to two columns.
      const vids = [src, sim];
      if (blender && c.media.blender) { setSource(blender, c.media.blender, c.media.blender_poster); vids.push(blender); }
      else if (blender) { blender.removeAttribute('src'); blender.removeAttribute('poster'); blender.load(); }
      if (blenderFig) blenderFig.hidden = !c.media.blender;
      pair.dataset.n = String(vids.length);
      let ready = 0;
      const go = () => { if (++ready === vids.length) syncGroup.hero?.restart(); };
      vids.forEach(v => v.addEventListener('loadeddata', go, { once: true }));
      window.__showcase = { slug: c.slug, poster: c.media.source_poster };
      window.dispatchEvent(new CustomEvent('showcase:select', { detail: window.__showcase }));
    };
    fetch('data/showcase.json').then(r => (r.ok ? r.json() : Promise.reject(r.status))).then(cases => {
      tabs.innerHTML = '';
      cases.forEach((c, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'case-tab'; b.setAttribute('aria-pressed', String(i === 0));
        const img = document.createElement('img'); img.src = c.media.thumb; img.alt = ''; img.width = 64; img.height = 40;
        b.title = c.name; b.setAttribute('aria-label', c.name);
        b.append(img);
        b.addEventListener('click', () => select(c, b));
        tabs.appendChild(b);
      });
      if (cases.length) select(cases[0], tabs.firstElementChild);
    }).catch(() => { tabs.textContent = 'The examples could not load. Reload the page to try again.'; });
  }

  // ---------- overview video: starts only when asked; native controls once it plays ----------
  const demo = document.getElementById('demo-video'), demoBtn = document.getElementById('demo-play');
  if (demo && demoBtn) {
    const frame = demo.parentElement;
    demoBtn.addEventListener('click', () => {
      frame.classList.add('playing');
      demo.controls = true;
      const p = demo.play(); if (p && p.catch) p.catch(() => {});
      demo.focus({ preventScroll: true });
    });
    demo.addEventListener('ended', () => {
      frame.classList.remove('playing');
      demo.controls = false;
      demo.load();   // back to the poster
      demoBtn.querySelector('.demo-play-text').textContent = 'Watch again';
    });
  }

  // ---------- results gallery: benchmark video, Codex's and Plumb's reconstructions, side by side ----------
  const gTabs = document.getElementById('gal-tabs');
  const gSrc = document.getElementById('gal-src'), gSim = document.getElementById('gal-sim'), gCodex = document.getElementById('gal-codex');
  const gPair = document.getElementById('gal-pair');
  if (gTabs && gSrc && gSim) {
    const setSrc = (v, url, posterUrl) => { v.poster = posterUrl; v.src = url; v.load(); };
    const pick = (c, btn) => {
      gTabs.querySelectorAll('.case-tab').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      gPair.style.setProperty('--aspect', String(c.aspect));
      setSrc(gSrc, c.media.source, c.media.source_poster);
      setSrc(gSim, c.media.sim, c.media.sim_poster);
      const vids = [gSrc, gSim];
      if (gCodex) { setSrc(gCodex, c.media.codex, c.media.codex_poster); vids.push(gCodex); }
      let ready = 0;
      const go = () => { if (++ready === vids.length) syncGroup.gallery?.restart(); };
      vids.forEach(v => v.addEventListener('loadeddata', go, { once: true }));
    };
    fetch('data/gallery.json').then(r => (r.ok ? r.json() : Promise.reject(r.status))).then(cases => {
      gTabs.innerHTML = '';
      cases.forEach((c, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'case-tab'; b.setAttribute('aria-pressed', String(i === 0));
        const img = document.createElement('img'); img.src = c.media.thumb; img.alt = ''; img.width = 64; img.height = 40;
        b.title = `${c.dataset} · ${c.category}`; b.setAttribute('aria-label', b.title);
        b.append(img);
        b.addEventListener('click', () => pick(c, b));
        gTabs.appendChild(b);
      });
      if (cases.length) pick(cases[0], gTabs.firstElementChild);
    }).catch(() => { gTabs.textContent = 'The gallery could not load. Reload the page to try again.'; });
  }

  // ---------- Motivation 04: one Codex run, its fits in order (the exploration as a line) ----------
  const plot = document.getElementById('search-plot');
  if (plot) fetch('data/codex-search.json').then(r => (r.ok ? r.json() : Promise.reject(r.status))).then(d => {
    const draw = () => {
      const W = Math.max(300, plot.clientWidth), H = 270, m = { l: 48, r: 64, t: 30, b: 42 };
      const x1 = Math.ceil(d.run_minutes / 10) * 10, y0 = 90, y1 = 160;
      const X = v => m.l + v / x1 * (W - m.l - m.r), Y = v => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);
      const best = d.fits.reduce((a, f) => (f.rmse_px < a.rmse_px ? f : a));
      const last = d.fits.find(f => f.delivered);
      let s = '';
      for (let v = 100; v <= y1; v += 20) s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
      for (let v = 0; v <= x1; v += 10) s += `<text x="${X(v)}" y="${H - m.b + 18}" text-anchor="middle">${v}</text>`;
      s += `<text x="${(m.l + W - m.r) / 2}" y="${H - 4}" text-anchor="middle">minutes into the run</text>`;
      // best level carried to the end, and the gap the delivery leaves
      s += `<line class="best" x1="${X(best.minute)}" x2="${X(last.minute)}" y1="${Y(best.rmse_px)}" y2="${Y(best.rmse_px)}"/>`;
      s += `<line class="gap" x1="${X(last.minute) + 14}" x2="${X(last.minute) + 14}" y1="${Y(best.rmse_px)}" y2="${Y(last.rmse_px)}"/>`;
      s += `<text class="gap-l" x="${X(last.minute) + 20}" y="${(Y(best.rmse_px) + Y(last.rmse_px)) / 2 + 4}">+${Math.round(last.rmse_px - best.rmse_px)} px</text>`;
      // the exploration: fits joined in the order Codex made them
      s += `<path class="explore" d="${d.fits.map((f, i) => `${i ? 'L' : 'M'}${X(f.minute).toFixed(1)},${Y(f.rmse_px).toFixed(1)}`).join('')}"/>`;
      d.fits.forEach((f, i) => {
        const cls = f.delivered ? ' delivered' : f === best ? ' best-dot' : '';
        s += `<circle class="dot${cls}" cx="${X(f.minute)}" cy="${Y(f.rmse_px)}" r="${cls ? 7 : 5}"><title>Fit ${i + 1} of ${d.fits.length}: ${Math.round(f.rmse_px)} px at minute ${Math.round(f.minute)}${f.delivered ? ', delivered' : ''}</title></circle>`;
      });
      s += `<text class="note" x="${X(best.minute)}" y="${Y(best.rmse_px) + 24}" text-anchor="middle">best: ${Math.round(best.rmse_px)} px</text>`;
      s += `<text class="note bad" x="${X(last.minute)}" y="${Y(last.rmse_px) - 14}" text-anchor="end">delivered: ${Math.round(last.rmse_px)} px</text>`;
      plot.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${s}</svg>`;
    };
    draw();
    let raf = 0;
    window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); });
  }).catch(() => { plot.textContent = 'The chart could not load. Reload the page to try again.'; });

  // ---------- BibTeX copy ----------
  const copy = document.getElementById('copy-bib');
  copy?.addEventListener('click', () => {
    const text = document.getElementById('bibtex').innerText;
    const done = ok => { copy.textContent = ok ? 'Copied' : 'Select and copy'; setTimeout(() => (copy.textContent = 'Copy'), 1600); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => done(true), () => fallback());
    else fallback();
    function fallback() {
      const range = document.createRange(); range.selectNodeContents(document.getElementById('bibtex'));
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); done(false);
    }
  });
})();
