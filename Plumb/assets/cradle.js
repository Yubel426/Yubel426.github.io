// The Plumb wordmark as a Newton's cradle without its frame, drawn into svg#cradle: five balls hang one diameter apart
// on strings that run up to the top of the page, so two balls touch exactly when their angles are equal. The pivots
// sit at the top of the document, so the string length is measured from the layout (again on resize). Contacts are
// resolved as sequential equal-mass impulses, which sends a strike through the row in one step; restitution just
// below 1 lets the middle balls pick up motion over time, as a real cradle does. One light, above and to the left in
// front of the page, shades every ball and casts the balls' and strings' shadows down and to the right onto the page.
// Binds #cradle-play and, if present, #cradle-sound.
(() => {
  const svg = document.getElementById("cradle");
  if (!svg) return;
  const NS = "http://www.w3.org/2000/svg", DEG = Math.PI / 180;
  const N = 5, R = 34, D = 2 * R, REST = 160;          // ball radius; height of the ball centres at rest (svg units)
  const VW = N * D, VH = REST + R + 22;                 // the box holds the row at rest; strings and swings overflow it
  const DROP = [5, 8];                                 // offset of the soft neutral shadows on the page
  const W2 = (2 * Math.PI / 1.0) ** 2;   // g / L for a 1 s period
  const AIR = 0.06, E = 0.997;            // air drag (1/s); restitution of a ball-ball contact
  const SUB = 1 / 1000, MAX_DRAG = 50 * DEG;
  const EMAX = W2 * (1 - Math.cos(52 * DEG));         // energy cap: no free swing passes 52 degrees
  const PLAN = [[1, -1], [2, -1], [1, 1], [3, -1]];   // automatic swings: balls lifted, side (-1 = left); only the
                                                      // first plays, on load, then the cradle waits for a drag
  const LIFT = [0, 38, 32, 27];                       // lift angle in degrees, by the number of balls
  const SWING = 7.5;                                  // seconds of free swinging before the balls are brought to rest
  const ax = i => R + i * D;
  const th = new Float64Array(N), om = new Float64Array(N);
  // pivot height (svg units; negative, the top of the page), string length, and the sine of the widest automatic
  // lift that keeps the end balls on screen
  let pivot = 0, L = REST, room = 1;

  svg.setAttribute("viewBox", `0 0 ${VW} ${VH}`);
  // Four silver balls and a muted teal P, the first ball lifted on load. A broad reflection and a restrained
  // edge shade describe the solid spheres; all five cast neutral shadows and carry clean, unoutlined letters.
  const stops = (...c) => c.map(([o, v, a = 1]) => `<stop offset="${o}" style="stop-color: ${v}" stop-opacity="${a}"/>`).join("");
  svg.innerHTML = `<defs>
      ${["steel", "accent"].map(finish => `<linearGradient id="cr-${finish}" x1=".2" y1="0" x2=".7" y2="1">${
        stops([0, `var(--cr-${finish}-1)`], [.36, `var(--cr-${finish}-2)`], [.72, `var(--cr-${finish}-3)`], [1, `var(--cr-${finish}-4)`])
      }</linearGradient>`).join("")}
      <radialGradient id="cr-form" cx=".34" cy=".26" r=".78">${
        stops([0, "#fff", .16], [.45, "#fff", 0], [1, "#172e24", .18])
      }</radialGradient>
      <radialGradient id="cr-spec">${
        stops([0, "#fff", .45], [.5, "#fff", .16], [1, "#fff", 0])
      }</radialGradient>
      <filter id="cr-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
    </defs>
    <g class="cr-shadows"><g class="cr-string-shadows"></g><g class="cr-ball-shadows" filter="url(#cr-soft)"></g></g>
    <g class="cr-strings"></g><g class="cr-balls"></g>`;
  const make = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return parent.appendChild(e);
  };
  const parts = [..."PLUMB"].map((ch, i) => {
    const shadows = svg.querySelector(".cr-ball-shadows");
    const shadow = make("circle", { class: "cr-ball-shadow", r: .94 * R }, shadows);
    const shade = make("line", { class: "cr-string-shadow", x1: ax(i) + DROP[0] }, svg.querySelector(".cr-string-shadows"));
    const string = make("line", { class: "cr-string", x1: ax(i) }, svg.querySelector(".cr-strings"));
    const ball = make("g", { class: `cr-ball${i === 0 ? " cr-ball-accent" : ""}`, "data-i": i }, svg.querySelector(".cr-balls"));
    const cap = make("g", {}, ball);   // the screw eye and the letter turn with the string; the shading does not
    make("rect", { class: "cr-eye", x: -1.6, y: -R - 3, width: 3.2, height: 4 }, cap);
    make("circle", { class: "cr-eye-ring", cy: -R - 5.5, r: 3 }, cap);
    make("circle", { r: R, fill: `url(#cr-${i === 0 ? "accent" : "steel"})` }, ball);
    make("circle", { r: R, fill: "url(#cr-form)" }, ball);
    make("ellipse", { cx: -10, cy: -19, rx: 20, ry: 10, transform: "rotate(-28 -10 -19)", fill: "url(#cr-spec)" }, ball);
    const glyph = make("g", {}, ball);
    make("text", { class: "cr-letter", y: 12 }, glyph).textContent = ch;
    make("circle", { class: "cr-rim", r: R - .4 }, ball);
    return { shadow, shade, string, ball, cap, glyph };
  });

  // The strings reach the top of the document: the pivot height follows from where the svg sits and how it is scaled.
  function measure() {
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    const s = r.width / VW;
    pivot = -(r.top + scrollY) / s;
    L = REST - pivot;
    room = Math.max(0, Math.min(r.left, document.documentElement.clientWidth - r.right)) / (s * L);
    for (const p of parts) {
      p.string.setAttribute("y1", pivot.toFixed(2));
      p.shade.setAttribute("y1", (pivot + DROP[1]).toFixed(2));
    }
  }
  new ResizeObserver(measure).observe(svg);
  addEventListener("resize", measure);
  measure();

  function render() {
    for (let i = 0; i < N; i++) {
      const s = Math.sin(th[i]), c = Math.cos(th[i]), p = parts[i];
      const x = ax(i) + L * s, y = pivot + L * c, rot = `rotate(${(-th[i] / DEG).toFixed(2)})`;
      p.string.setAttribute("x2", (x - R * s).toFixed(2));
      p.string.setAttribute("y2", (y - R * c).toFixed(2));
      p.ball.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      p.cap.setAttribute("transform", rot);
      p.glyph.setAttribute("transform", rot);
      p.shadow.setAttribute("cx", (x + DROP[0]).toFixed(2));
      p.shadow.setAttribute("cy", (y + DROP[1]).toFixed(2));
      p.shade.setAttribute("x2", (x - R * s + DROP[0]).toFixed(2));
      p.shade.setAttribute("y2", (y - R * c + DROP[1]).toFixed(2));
    }
  }

  // A held ball (by the automatic lift or by a pointer) follows hand.a and pushes the balls in its way along.
  let hand = null;
  function collide() {
    let hit = 0;
    for (let pass = 0; pass < 4 * N; pass++) {
      let any = false;
      for (let i = 0; i < N - 1; i++) {
        const rel = om[i] - om[i + 1];
        if (th[i] < th[i + 1] - 1e-4 || rel <= 1e-9) continue;
        hit = Math.max(hit, rel);
        any = true;
        if (hand && hand.k === i) om[i + 1] = om[i] + E * rel;
        else if (hand && hand.k === i + 1) om[i] = om[i + 1] - E * rel;
        else {
          const m = (om[i] + om[i + 1]) / 2;
          om[i] = m - E * rel / 2;
          om[i + 1] = m + E * rel / 2;
        }
      }
      if (!any) break;
    }
    return hit;
  }
  function carry() {
    const k = hand.k;
    for (let j = k - 1; j >= 0; j--) if (th[j] > th[j + 1]) { th[j] = th[j + 1]; om[j] = Math.min(om[j], om[j + 1]); }
    for (let j = k + 1; j < N; j++) if (th[j] < th[j - 1]) { th[j] = th[j - 1]; om[j] = Math.max(om[j], om[j - 1]); }
  }
  function substep(h, damp, frac) {
    for (let i = 0; i < N; i++) {
      om[i] += (-W2 * Math.sin(th[i]) - damp * om[i]) * h;
      th[i] += om[i] * h;
    }
    if (hand) {
      th[hand.k] = hand.a0 + (hand.a - hand.a0) * frac;
      om[hand.k] = hand.v;
    }
    const hit = collide();
    if (hand) carry();
    for (let i = 0; i < N; i++) {
      if (hand && hand.k === i) continue;
      const room = EMAX - W2 * (1 - Math.cos(th[i]));
      if (room <= 0) { if (th[i] * om[i] > 0) om[i] = 0; }
      else if (om[i] * om[i] > 2 * room) om[i] = Math.sign(om[i]) * Math.sqrt(2 * room);
    }
    return hit;
  }

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let running = true, auto = !reduce, fonts = false;
  let mode = "rest", t = 0, plan = 0;
  document.fonts.ready.then(() => { fonts = true; });
  const go = m => { mode = m; t = 0; };
  const steer = (a, dt) => { hand.a = a; hand.v = (a - hand.a0) / dt; };
  const calm = () => th.every(a => Math.abs(a) < 4e-3) && om.every(w => Math.abs(w) < 3e-2);

  function update(dt) {
    t += dt;
    if (hand) { hand.a0 = hand.a; hand.v = 0; }
    let damp = AIR;
    if (mode === "rest" && auto && fonts && t > 1) {
      const [n, side] = PLAN[plan % PLAN.length], k = side < 0 ? n - 1 : N - n;
      hand = { k, a: th[k], a0: th[k], v: 0, lift: side * Math.min(LIFT[n] * DEG, Math.asin(Math.min(1, room))) };
      go("lift");
    }
    if (mode === "lift") {
      steer(hand.lift * (1 - Math.cos(Math.PI * Math.min(t / 0.8, 1))) / 2, dt);
      if (t > 1.1) { hand = null; go("swing"); }
    }
    if (mode === "drag") steer(hand.a + (hand.target - hand.a) * (1 - Math.exp(-dt / 0.035)), dt);
    if (mode === "swing" && auto && t > SWING) go("settle");
    if (mode === "settle") {
      damp += 11 * Math.min(t / 0.8, 1);   // brake every ball to rest before the next lift
      if (calm() || t > 4) { th.fill(0); om.fill(0); plan++; auto = false; go("rest"); }   // one automatic swing only
    }
    let hit = 0;
    const n = Math.max(1, Math.ceil(dt / SUB));
    for (let s = 1; s <= n; s++) hit = Math.max(hit, substep(dt / n, damp, s / n));
    return hit;
  }

  // Sound: a short metallic click per impact, louder for faster ones; off until asked for.
  let ac = null, lastClick = 0;
  function click(v) {
    const t0 = ac.currentTime;
    if (t0 - lastClick < 0.05) return;
    lastClick = t0;
    const out = ac.createGain();
    out.gain.setValueAtTime(0.35 * Math.min(1, v / 5), t0);
    out.gain.exponentialRampToValueAtTime(1e-4, t0 + 0.12);
    out.connect(ac.destination);
    for (const [f, g] of [[2870, 1], [6110, 0.4], [9230, 0.15]]) {
      const o = ac.createOscillator(), og = ac.createGain();
      o.frequency.value = f * (0.98 + 0.04 * Math.random());
      og.gain.setValueAtTime(g, t0);
      og.gain.exponentialRampToValueAtTime(1e-4, t0 + 0.12 / (1 + f / 4000));
      o.connect(og).connect(out);
      o.start(t0);
      o.stop(t0 + 0.13);
    }
    const buf = ac.createBuffer(1, Math.round(ac.sampleRate * 0.012), ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-5 * i / d.length);
    const src = ac.createBufferSource(), hp = ac.createBiquadFilter();
    src.buffer = buf;
    hp.type = "highpass";
    hp.frequency.value = 1800;
    src.connect(hp).connect(out);
    src.start(t0);
  }

  // The loop runs only while the cradle is on screen.
  let last = 0, raf = 0, visible = true;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    if (running) {
      const hit = update(dt);
      if (ac && hit > 0.3) click(hit);
    }
    render();
    raf = visible ? requestAnimationFrame(frame) : 0;
  }
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }).observe(svg);

  const play = document.getElementById("cradle-play"), sound = document.getElementById("cradle-sound");
  const label = () => {
    if (!play) return;
    const on = running && auto;
    play.textContent = on ? "Pause" : "Play";
    play.setAttribute("aria-label", on ? "Pause the cradle animation" : "Play the cradle animation");
  };
  play?.addEventListener("click", () => {
    if (running && auto) running = false;
    else running = auto = true;
    label();
  });
  sound?.addEventListener("click", () => {
    const on = sound.getAttribute("aria-pressed") !== "true";
    if (on && !ac) ac = new AudioContext();
    if (ac) on ? ac.resume() : ac.suspend();
    sound.setAttribute("aria-pressed", on);
    sound.textContent = on ? "Sound on" : "Sound off";
  });

  function aim(e) {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    hand.target = Math.min(MAX_DRAG, Math.max(-MAX_DRAG, Math.atan2(p.x - ax(hand.k), p.y - pivot)));
  }
  svg.addEventListener("pointerdown", e => {
    const b = e.target.closest(".cr-ball");
    if (!b || mode === "drag") return;
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    svg.classList.add("dragging");
    const k = +b.dataset.i;
    hand = { k, a: th[k], a0: th[k], v: 0, pointer: e.pointerId };
    aim(e);
    go("drag");
    running = true;
    label();
  });
  // Leaving the cradle lets go of the ball, as does a move with no button down (a release the page never saw,
  // e.g. outside the window), a lost capture or the window losing focus.
  svg.addEventListener("pointermove", e => {
    if (mode !== "drag" || e.pointerId !== hand.pointer) return;
    const r = svg.getBoundingClientRect();
    if (!e.buttons || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) drop();
    else aim(e);
  });
  function drop() {
    if (mode !== "drag") return;
    const id = hand.pointer;
    hand = null;   // the ball keeps the hand's last angular velocity, so a flick throws it
    svg.classList.remove("dragging");
    go("swing");
    if (svg.hasPointerCapture(id)) svg.releasePointerCapture(id);
  }
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    svg.addEventListener(type, e => { if (mode === "drag" && e.pointerId === hand.pointer) drop(); });
  }
  addEventListener("blur", drop);

  label();
  render();
})();
