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

  // ---------- results gallery: benchmark video and Plumb's reconstruction, side by side ----------
  const gTabs = document.getElementById('gal-tabs');
  const gSrc = document.getElementById('gal-src'), gSim = document.getElementById('gal-sim');
  const gPair = document.getElementById('gal-pair'), gCap = document.getElementById('gal-cap');
  if (gTabs && gSrc && gSim) {
    const setSrc = (v, url, posterUrl) => { v.poster = posterUrl; v.src = url; v.load(); };
    const pick = (c, btn) => {
      gTabs.querySelectorAll('.case-tab').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      gPair.style.setProperty('--aspect', String(c.aspect));
      setSrc(gSrc, c.media.source, c.media.source_poster);
      setSrc(gSim, c.media.sim, c.media.sim_poster);
      if (gCap) gCap.textContent = `${c.dataset} · ${c.category}`;
      let ready = 0;
      const go = () => { if (++ready === 2) syncGroup.gallery?.restart(); };
      [gSrc, gSim].forEach(v => v.addEventListener('loadeddata', go, { once: true }));
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
