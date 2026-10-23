// Motivation 03: a schematic to the left of the grid of views. Two cameras look at one scene (the double pendulum)
// from different sides; their view cones cross at the scene and run on until each one's base is the first video of
// its row: the input camera's cone ends on the top row, the third viewpoint's on the bottom row. Drawn into
// svg#view-cones (which spans the panel and the gap up to the grid) from the live layout, again on every resize.
(() => {
  const fig = document.querySelector(".views-figure"), svg = document.getElementById("view-cones");
  if (!fig || !svg) return;
  const videos = [...document.querySelectorAll("#views-pair video")];
  const cams = [{ id: "input", name: "Input view", video: videos[0] }, { id: "second", name: "Third viewpoint", video: videos[3] }];
  const f = v => v.toFixed(1);

  function draw() {
    const box = svg.getBoundingClientRect();
    if (box.width < 120 || !cams.every(c => c.video)) { svg.innerHTML = ""; return; }
    const W = box.width, H = box.height;
    svg.setAttribute("viewBox", `0 0 ${f(W)} ${f(H)}`);
    const rect = v => { const r = v.getBoundingClientRect(); return { x: r.left - box.left, y: r.top - box.top, h: r.height }; };
    const [top, bottom] = cams.map(c => rect(c.video));
    const S = { x: .44 * W, y: (top.y + top.h + bottom.y) / 2 };   // the scene, level with the gap between the rows
    let defs = "", cones = "", gear = "";
    cams.forEach((c, i) => {
      const r = i ? bottom : top, C = { x: r.x, y: r.y + r.h / 2 };
      // the camera sits beyond the scene on the far side from its video, as far as the panel allows
      const t = Math.min(.62, (S.x - 34) / (C.x - S.x));
      const A = { x: S.x + (S.x - C.x) * t, y: S.y + (S.y - C.y) * t };
      const deg = Math.atan2(C.y - A.y, C.x - A.x) * 180 / Math.PI;
      const col = `var(--${i ? "cam2" : "src"})`;
      defs += `<linearGradient id="vc-fill-${i}" gradientUnits="userSpaceOnUse" x1="${f(A.x)}" y1="${f(A.y)}" x2="${f(C.x)}" y2="${f(C.y)}">
        <stop offset="0" style="stop-color: ${col}" stop-opacity=".34"/><stop offset="1" style="stop-color: ${col}" stop-opacity=".07"/></linearGradient>`;
      cones += `<path d="M${f(A.x)} ${f(A.y)}L${f(r.x)} ${f(r.y)}V${f(r.y + r.h)}Z" fill="url(#vc-fill-${i})"/>
        <path class="vc-edge" style="stroke: ${col}" d="M${f(A.x)} ${f(A.y)}L${f(r.x)} ${f(r.y)}M${f(A.x)} ${f(A.y)}L${f(r.x)} ${f(r.y + r.h)}"/>
        <rect x="${f(r.x - 3)}" y="${f(r.y)}" width="3" height="${f(r.h)}" style="fill: ${col}"/>`;
      // a camera body behind the apex, lens towards the scene; its name above (upper camera) or below (lower one)
      gear += `<g transform="translate(${f(A.x)} ${f(A.y)}) rotate(${f(deg)}) scale(1.3)" style="fill: ${col}">
          <rect x="-27" y="-10" width="22" height="20" rx="3"/><path d="M-6 -5L3 -9V9L-6 5Z"/><circle cx="-21" cy="-13" r="3.2"/></g>
        <text class="vc-name" x="${f(Math.max(4, A.x - 30))}" y="${f(A.y + (i ? -36 : 44))}" style="fill: ${col}">${c.name}</text>`;
    });
    // the scene: a double pendulum hanging from a ceiling mount above a table; lanterns outlined in the colours
    // the bottom-row videos use for them (upper blue, lower orange)
    const x = S.x, y = S.y, k = 1.7;   // scene drawing scale
    const scene = `<g class="vc-scene" transform="translate(${f(x)} ${f(y)}) scale(${k})">
        <path class="vc-table" d="M-30 30h46l12 -10h-46z"/>
        <path class="vc-rod" d="M-12 -34h24M0 -34L9 -11L1 10"/>
        <rect class="vc-lantern" x="4" y="-14" width="10" height="12" rx="2" style="stroke: #3d7be0"/>
        <rect class="vc-lantern" x="-4" y="7" width="10" height="12" rx="2" style="stroke: #ec6a3a"/>
      </g>`;
    svg.innerHTML = `<defs>${defs}</defs>${cones}${scene}${gear}`;
  }
  new ResizeObserver(draw).observe(fig);
  addEventListener("resize", draw);
  for (const v of videos) v.addEventListener("loadedmetadata", draw);
  draw();
})();
