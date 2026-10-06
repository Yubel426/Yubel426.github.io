// Interactive run timeline: initialization -> official rounds -> delivery.
// Reads data/workflow-<case>.json (built by scripts/build_workflow_data.py from a real run directory).
(function () {
  'use strict';
  const CASE = 'pendulum';
  const STEP_MS = 6000;

  const $ = id => document.getElementById(id);
  const track = $('walk-track'), axis = $('walk-axis'), body = $('walk-body'), chart = $('walk-chart');
  const sub = $('walk-sub'), count = $('walk-count');
  const prevBtn = $('walk-prev'), nextBtn = $('walk-next'), playBtn = $('walk-play');
  if (!track || !body) return;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => (typeof v === 'number' && isFinite(v) ? v : null);
  const fmtNum = (v, d = 2) => (num(v) == null ? '—' : num(v).toFixed(d));
  const fmtInt = v => (num(v) == null ? '—' : Math.round(v).toLocaleString('en-US'));
  function clock(sec) {
    if (num(sec) == null) return '—';
    const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
  }
  function minutes(sec) { return num(sec) == null ? '—' : (sec / 60 < 10 ? (sec / 60).toFixed(1) : Math.round(sec / 60)) + ' min'; }

  let data = null, steps = [], current = 0, stageFocus = null, timer = null, playing = false;

  fetch(`data/workflow-${CASE}.json`).then(r => (r.ok ? r.json() : Promise.reject(r.status))).then(d => {
    data = d; build(); go(0);
  }).catch(() => {
    sub.textContent = 'Run data not available yet';
    [prevBtn, nextBtn, playBtn].forEach(b => b && (b.disabled = true));
  });

  // ---------- model ----------
  function build() {
    const c = data.case || {};
    sub.textContent = [c.dataset, c.display_name || c.name, `${c.frames || '?'} frames @ ${c.fps || '?'} fps`].filter(Boolean).join(' · ');
    const init = data.initialization || {};
    const rounds = (data.rounds || []);
    steps = [{ kind: 'init' }, ...rounds.map((r, i) => ({ kind: 'round', r, i })), { kind: 'deliver' }];

    // Segments: initialization, one per round, delivery. Equal widths: the panel shows steps, not time.
    const deliveredId = data.delivery?.round_id || data.delivery?.round;
    const segs = [{ step: 0, cls: 'init', label: 'Initialization' }];
    rounds.forEach((r, i) => segs.push({
      step: i + 1, cls: 'round', label: /conclusion/i.test(r.kind || '') ? 'Conclude' : `R${i + 1}`,
      concl: /conclusion/i.test(r.kind || ''), obs: /observation/i.test(r.kind || ''), delivered: r.id === deliveredId || r.round === deliveredId,
    }));
    segs.push({ step: steps.length - 1, cls: 'deliver', label: 'Deliver' });

    track.innerHTML = '';
    segs.forEach(sg => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `seg ${sg.cls}` + (sg.delivered ? ' delivered' : '') + (sg.concl ? ' concl' : '') + (sg.obs ? ' obs' : '');
      b.style.setProperty('--w', sg.cls === 'init' ? '1.6' : '1');
      b.dataset.step = sg.step;
      b.setAttribute('role', 'tab');
      b.title = sg.label;
      b.innerHTML = `<span class="fill"></span>${esc(sg.label)}`;
      b.setAttribute('aria-label', sg.label);
      b.addEventListener('click', () => { stop(); go(sg.step); });
      track.appendChild(b);
    });
    if (axis) axis.hidden = true;

    drawChart();
  }

  function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

  // ---------- navigation ----------
  function go(i) {
    current = Math.max(0, Math.min(steps.length - 1, i));
    if (steps[current].kind !== 'init') stageFocus = null;
    const segs = [...track.children];
    segs.forEach(el => {
      const s = Number(el.dataset.step);
      el.classList.toggle('done', s < current);
      el.classList.toggle('current', s === current && (stageFocus == null || el.dataset.stage == null || Number(el.dataset.stage) === stageFocus));
      el.setAttribute('aria-selected', String(s === current));
      const fill = el.querySelector('.fill');
      fill.style.transition = 'none';
      fill.style.width = s < current ? '100%' : '0';
      if (s === current && playing) {
        requestAnimationFrame(() => { fill.style.transition = `width ${STEP_MS}ms linear`; fill.style.width = '100%'; });
      }
    });
    // Keep the current segment visible inside the horizontally scrolling track, without moving the page.
    const curEl = segs.find(el => Number(el.dataset.step) === current), wrap = track.parentElement;
    if (curEl && wrap && wrap.scrollWidth > wrap.clientWidth) {
      const l = curEl.offsetLeft, r = l + curEl.offsetWidth;
      if (l < wrap.scrollLeft || r > wrap.scrollLeft + wrap.clientWidth) wrap.scrollLeft = Math.max(0, l - 24);
    }
    count.textContent = `Step ${current + 1} of ${steps.length}`;
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === steps.length - 1;
    render(steps[current]);
    highlightChart();
  }
  prevBtn?.addEventListener('click', () => { stop(); go(current - 1); });
  nextBtn?.addEventListener('click', () => { stop(); go(current + 1); });
  playBtn?.addEventListener('click', () => (playing ? stop() : play()));
  track.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { stop(); go(current + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { stop(); go(current - 1); e.preventDefault(); }
  });

  function play() {
    if (current === steps.length - 1) current = -1;
    playing = true; playBtn.setAttribute('aria-pressed', 'true'); playBtn.textContent = '❚❚ Pause';
    go(current + 1);
    timer = setInterval(() => {
      if (current >= steps.length - 1) return stop();
      go(current + 1);
    }, STEP_MS);
  }
  function stop() {
    playing = false; clearInterval(timer); timer = null;
    if (playBtn) { playBtn.setAttribute('aria-pressed', 'false'); playBtn.textContent = '▶ Play'; }
    track.querySelectorAll('.seg.current .fill').forEach(f => { const w = getComputedStyle(f).width; f.style.transition = 'none'; f.style.width = w; });
  }

  // ---------- detail views ----------
  function video(src, poster, caption) {
    if (!src) return '';
    return `<figure class="walk-media" style="margin:0"><video muted playsinline loop autoplay controls preload="metadata" ${poster ? `poster="${esc(poster)}"` : ''}><source src="${esc(src)}" type="video/mp4"></video><button type="button" class="zoom-btn" aria-label="Enlarge video" title="Enlarge">⤢</button>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
  }

  // ---------- enlarge a figure: click an image, or the button on a video ----------
  const box = document.createElement('dialog');
  box.className = 'lightbox';
  box.setAttribute('aria-label', 'Enlarged figure');
  document.body.appendChild(box);
  const closeBox = () => (typeof box.close === 'function' ? box.close() : (box.removeAttribute('open'), box.innerHTML = ''));
  box.addEventListener('click', e => { if (e.target === box || e.target.closest('.lb-close')) closeBox(); });
  box.addEventListener('close', () => { box.innerHTML = ''; });
  function enlarge(el) {
    const cap = el.closest('figure')?.querySelector('figcaption')?.textContent || '';
    let media;
    if (el.tagName === 'VIDEO') {
      media = document.createElement('video');
      Object.assign(media, { muted: true, loop: true, autoplay: true, controls: true, playsInline: true });
      media.src = el.currentSrc || el.querySelector('source')?.src || '';
      media.addEventListener('loadedmetadata', () => { media.currentTime = el.currentTime || 0; }, { once: true });
    } else {
      media = document.createElement('img');
      media.src = el.currentSrc || el.src;
      media.alt = el.alt || cap;
    }
    box.innerHTML = '<button type="button" class="lb-close" aria-label="Close">×</button>';
    box.append(media);
    if (cap) { const p = document.createElement('p'); p.className = 'lb-cap'; p.textContent = cap; box.append(p); }
    if (typeof box.showModal === 'function') box.showModal(); else box.setAttribute('open', '');
  }
  body.addEventListener('click', e => {
    const btn = e.target.closest('.zoom-btn');
    const img = btn ? null : e.target.closest('.walk-media img');
    if (!btn && !img) return;
    stop();
    enlarge(btn ? btn.closest('figure').querySelector('video') : img);
  });
  function metric(label, value, cls) { return `<span class="metric ${cls || ''}">${esc(label)} ${esc(value)}</span>`; }

  function render(step) {
    if (step.kind === 'init') return renderInit();
    if (step.kind === 'round') return renderRound(step.r, step.i);
    return renderDeliver();
  }

  function renderInit() {
    const init = data.initialization || {};
    const stages = init.stages || [];
    // Only the stages that produce the scene itself; review and bookkeeping stages are left out.
    const hidden = /completeness review|SAM3 grounding|seed rollout|evidence bundle|reference frames/i;
    const rows = stages.filter(s => !hidden.test(s.name || '')).map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.output || '')}</td></tr>`).join('');
    const img = init.images || {};
    const pics = [['masks', 'SAM3 masks'], ['depth', 'Pi3X depth'], ['seed', 'Initial scene']]
      .filter(([k]) => img[k]).map(([k, cap]) => `<figure><img src="${esc(img[k])}" alt="${esc(cap)}" loading="lazy"><figcaption>${esc(cap)}</figcaption></figure>`).join('');
    const media = pics ? `<div class="walk-media img-pair img-row">${pics}</div>` : video(data.case?.source_video, null, 'Input video');
    body.className = 'walk-body';
    body.innerHTML = `
      <div>
        <div class="walk-title"><h4>Initialization</h4><span class="when">no agent yet, tools only${num(init.vlm_calls) ? ` · ${init.vlm_calls} VLM calls` : ''}</span></div>
        ${media}
        <div class="table-wrap" style="margin:14px 0 0"><table class="init-stages"><tbody>${rows || '<tr><td>Stages</td><td>not recorded</td><td></td></tr>'}</tbody></table></div>
      </div>`;
  }

  function renderRound(r, i) {
    const res = r.result || {};
    const ms = [];
    if (num(res.ade_pct_diag) != null) ms.push(metric('ADE', fmtNum(res.ade_pct_diag) + '% diag'));
    if (num(res.iou) != null) ms.push(metric('IoU', fmtNum(res.iou)));
    if (num(res.checks_passed) != null || num(res.checks_failed) != null) {
      const unk = num(res.checks_unknown) ? ` / ${fmtInt(res.checks_unknown)} unknown` : '';
      ms.push(metric('checks', `${fmtInt(res.checks_passed)} passed / ${fmtInt(res.checks_failed)} failed${unk}`, res.checks_failed ? 'bad' : 'good'));
    }
    if (res.accepted === true) ms.push(metric('accepted', '', 'good'));
    if (res.review_verdict) ms.push(metric('review', res.review_verdict));
    const exps = (r.experiments || []).map(x => `<li>${esc(x.what)}${num(x.rollouts) != null ? ` · ${fmtInt(x.rollouts)} rollouts` : ''}${x.outcome ? ` → ${esc(x.outcome)}` : ''}</li>`).join('');
    body.className = 'walk-body' + (r.media?.video ? ' has-media' : '');
    body.innerHTML = `
      <div>
        <div class="walk-title"><h4>Round ${i + 1} · ${esc(r.kind || 'official evaluation')}</h4></div>
        <div class="rer">
          ${r.decision ? `<div class="rer-item decide"><b>Decision</b><div>${esc(r.decision)}</div></div>` : ''}
          <div class="rer-item why"><b>Why</b><div>${esc(r.reason || '—')}</div></div>
          <div class="rer-item expect"><b>Expected</b><div>${esc(r.hypothesis || '')}${r.expectation ? `<div style="margin-top:6px">${esc(r.expectation)}</div>` : ''}</div></div>
          <div class="rer-item result"><b>Result</b><div>${esc(res.summary || '—')}<div class="metrics">${ms.join('')}</div></div></div>
        </div>
        ${exps ? `<details class="more"><summary>${/observation/i.test(r.kind || '') ? 'Requested observations' : 'Sandbox experiments before this submission'} (${(r.experiments || []).length})</summary><ul>${exps}</ul></details>` : ''}
      </div>
      ${r.media?.video || r.scene_edit?.diff || r.scene_edit?.items ? `<div class="walk-side">${video(r.media?.video, r.media?.poster, `Left: input video. Right: round ${i + 1} rollout from its t = 0 state.`)}${sceneEdit(r)}</div>` : ''}`;
  }

  // What the agent changed in the scene this round: counted by the data builder against the scene it was
  // edited from, described in plain words.
  function sceneEdit(r) {
    const e = r.scene_edit;
    if (!e || (!e.diff?.length && !e.items?.length)) return '';
    const rounds = data.rounds || [];
    const base = e.base_round ? rounds.findIndex(x => x.id === e.base_round) : -1;
    const sub = e.changed == null ? `first full scene · ${fmtInt(e.total)} model parameters`
      : `${fmtInt(e.changed)} of ${fmtInt(e.total)} model parameters${e.camera_poses ? ', plus the camera' : ''}${base >= 0 ? ` · edited from round ${base + 1}` : ''}`;
    if (e.diff?.length) {
      const cls = { '-': 'del', '+': 'add', meta: 'meta' };
      const lines = e.diff.map(l => `<span class="${cls[l.op] || ''}">${l.op === 'meta' ? '' : esc(l.op)}${esc(l.text)}</span>`).join('');
      return `<div class="scene-edit"><h5>Scene changes <span>${esc(sub)}</span></h5><pre class="diff"><code>${lines}</code></pre></div>`;
    }
    const rows = e.items.map(it => `<tr><th scope="row">${esc(it.what)}</th><td>${it.from ? `${esc(it.from)} <span class="arrow">→</span> ` : ''}${esc(it.to || '')}</td></tr>`).join('');
    return `<div class="scene-edit"><h5>Scene changes <span>${esc(sub)}</span></h5><table><tbody>${rows}</tbody></table></div>`;
  }

  function renderDeliver() {
    const d = data.delivery || {};
    const tot = d.totals || {};
    const deliveredId = d.round_id || d.round;
    const idx = (data.rounds || []).findIndex(r => r.id === deliveredId || r.round === deliveredId);
    const ms = [];
    if (num(tot.official_evaluations) != null) ms.push(metric('official evaluations', fmtInt(tot.official_evaluations)));
    if (num(tot.rollouts) != null) ms.push(metric('local-fit rollouts', fmtInt(tot.rollouts)));
    const dm = d.metrics || {};
    if (num(dm.ade_pct_diag) != null) ms.push(metric('ADE', fmtNum(dm.ade_pct_diag) + '% diag'));
    if (num(dm.iou) != null) ms.push(metric('IoU', fmtNum(dm.iou)));
    const review = d.review?.verdict ? `<div style="margin-top:8px"><b style="font:600 11px/1.6 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Independent review · ${esc(d.review.verdict)}</b><br>${esc(d.review.summary || '')}</div>` : '';
    const dr = (data.rounds || []).find(r => r.id === deliveredId || r.round === deliveredId);
    const side = dr?.media?.video || (data.case?.id ? `media/cases/${data.case.id}/side.mp4` : null);
    body.className = 'walk-body has-media';
    body.innerHTML = `
      <div>
        <div class="walk-title"><h4>Delivery · ${idx >= 0 ? 'round ' + (idx + 1) : esc(d.round || '—')}</h4><span class="when">${esc((d.termination_reason || '').replace(/_/g, ' '))}${d.accepted != null ? (d.accepted ? ' · accepted' : ' · not accepted') : ''}</span></div>
        <div class="rer"><div class="rer-item result"><b>Why this</b><div>${esc(d.why || '—')}<div class="metrics">${ms.join('')}</div>${review}</div></div></div>
      </div>
      ${video(side, dr?.media?.poster || null, 'The delivered scene, rolled out over the whole video.')}`;
  }

  // ---------- accuracy by round: two small multiples ----------
  function drawChart() {
    const rounds = (data.rounds || []);
    const evals = rounds.map((r, i) => ({ i, r })).filter(({ r }) => num(r.result?.ade_pct_diag) != null || num(r.result?.iou) != null);
    if (evals.length < 2 || !chart) return;
    const panel = (key, title, lowerBetter) => {
      const pts = evals.map(({ i, r }) => ({ i, v: num(r.result?.[key]) })).filter(p => p.v != null);
      const W = 320, H = 132, L = 40, R = 14, T = 12, B = 24;
      const maxV = Math.max(...pts.map(p => p.v));
      const step = niceStep(maxV / 3), top = Math.ceil(maxV / step) * step || 1;
      const xs = evals.map(e => e.i);
      const x = i => L + (xs.length === 1 ? 0 : (xs.indexOf(i) / (xs.length - 1)) * (W - L - R));
      const y = v => T + (1 - v / top) * (H - T - B);
      let g = '';
      for (let v = 0; v <= top + 1e-9; v += step) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${+v.toFixed(2)}</text>`;
      const xl = xs.map(i => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">R${i + 1}</text>`).join('');
      const line = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.v)}`).join('');
      const dots = pts.map(p => `<circle class="dot" data-i="${p.i}" cx="${x(p.i)}" cy="${y(p.v)}" r="5"><title>Round ${p.i + 1}: ${title} ${p.v.toFixed(3)}</title></circle>`).join('');
      return `<figure style="margin:0;min-width:0"><figcaption style="font:600 12px/1.4 var(--mono);color:var(--ink);margin-bottom:2px">${title} <span style="font-weight:400;color:var(--muted)">${lowerBetter ? 'lower is better' : 'higher is better'}</span></figcaption>
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title} by round">${g}${xl}<path class="line" d="${line}"/>${dots}</svg></figure>`;
    };
    chart.innerHTML = `<h4 style="margin:0 0 8px">Accuracy of each official evaluation <span style="font-weight:400;color:var(--muted)">(against SAM3 tracks of the input video)</span></h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px 24px">${panel('ade_pct_diag', 'Trajectory ADE, % of diagonal', true)}${panel('iou', 'Mask IoU', false)}</div>`;
    chart.hidden = false;
    chart.querySelectorAll('.dot').forEach(c => c.addEventListener('click', () => { stop(); go(Number(c.dataset.i) + 1); }));
  }
  function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function highlightChart() {
    chart?.querySelectorAll('.dot').forEach(c => c.classList.toggle('on', steps[current]?.kind === 'round' && Number(c.dataset.i) === steps[current].i));
  }
})();
