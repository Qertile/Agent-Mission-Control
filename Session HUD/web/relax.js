// Relax mode: the Tasks and Sessions columns become a camp seen from above, one
// building per session, with its person walking about near it.
//
// It costs nothing while it is off, and little while it is on. The page's 1-second
// refresh calls relax.update(); the camp (grass, trees, buildings, names) is drawn into a
// background canvas only when what it shows changed (or its size did). The people move
// on a 5 Hz timer that redraws only the small squares they leave and enter, from that
// background. Nothing runs while the window is hidden or Office mode is on.
// The pictures are PNGs made once by tools/relax_art.py from Kenney's kits (CC0).
const relax = (() => {
  const KEY = 'amc-mode';                  // 'relax' or 'office', per computer
  const PICS = ['level0', 'level1', 'level2', 'level3', 'level4', 'ruin', 'meeting', 'tree', 'tree-autumn', 'rock', 'people'];
  // people.png: a row per tool, 28 frames of 128 px: 14 facing lower right, then the same
  // facing lower left; of each 14, F says which (relax_art.html's ACTS).
  const PEOPLE_ROW = {claude: 0, codex: 1, agy: 2}, CELL = 128, TICK = 200;   // 5 Hz
  const PER_DIR = 14, F = {stand: 0, walk: 1, work: 5, wave: 9, sit: 13};
  // The logs around a discussion's fire (relax_art.html's 'meeting'): [x, z] in world
  // units, and the way the one sitting there faces.
  const SEATS = [[-1.1, 0.15, 0], [0.15, -1.1, 1], [-0.85, -0.85, 0]];
  const ANCHOR = 0.88;                     // where the ground point is in each picture (y)
  const TOP = {level0: 0.80, level1: 0.66, level2: 0.56, level3: 0.29, level4: 0.10, ruin: 0.72, meeting: 0.70};  // its top
  const TOOL_COLORS = {claude: '#d97757', codex: '#e6e6e6', agy: '#4f8cff', disc: '#ffc400'};
  const STATUS_COLORS = {busy: '#00dcff', running: '#00dcff', waiting: '#ffc400', idle: '#8cff8c', ended: '#8c96a0'};
  // The building grows with the messages typed into the session (agy: its hours open):
  // a campfire at 0, then a tent, a cabin, a house, a tower.
  const LEVELS = [[200, 'level4'], [50, 'level3'], [10, 'level2'], [1, 'level1'], [0, 'level0']];
  const BOARD_MAX = 8;                     // tasks on the board; the rest are counted
  const TASK_COLORS = {Ongoing: '#0b5a7a', Checking: '#8a5a00', Pending: '#3a2a1a'};
  const img = {};
  let on = false, sig = '', spots = [], hover = null, msgTimer = 0;
  let bg = null, dpr = 1, plot = 150, timer = 0;
  const people = new Map();                // session id (a participant: discussion id#i) -> its person
  let fires = [];                          // the discussions under way: {x, y} of their fire

  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(mode) { try { localStorage.setItem(KEY, mode); } catch (e) {} }

  // The pictures load once, the first time Relax mode is shown.
  let loading = null;
  function load() {
    loading = loading || Promise.all(PICS.map(n => new Promise(ok => {
      const im = new Image();
      im.onload = () => { img[n] = im; ok(); };
      im.onerror = ok;
      im.src = 'relax/' + n + '.png';
    })));
    return loading;
  }

  // One building per session: the running ones (the session list's rows), then the
  // agents.json sessions that are not running (ended). A discussion is a fire instead.
  function buildings() {
    const list = rows.map(r => r.disc
      ? {id: r.sid, name: r.name, tool: 'disc', status: r.status, row: r, level: 'meeting', kind: 'meeting',
         people: r.people || []}
      : {id: r.sid, name: r.name, tool: r.tool || 'claude', status: r.status, row: r, level: level(r.turns || 0)});
    const seen = new Set(list.map(b => b.id));
    for (const t of amc.stopped || [])
      if (!seen.has(t.id)) list.push({id: t.id, name: t.name, tool: t.tool || 'claude', status: 'ended', row: null});
    return list;
  }

  function level(turns) { return LEVELS.find(([n]) => turns >= n)[1]; }

  // A random number source that gives the same numbers for the same seed.
  function rng(seed) {
    seed = seed % 2147483646 + 1;
    return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  }
  function hash(text) {
    let h = 2166136261;
    for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    return h;
  }

  // Where each building stands: scattered, but each session always tries the same spots
  // (from its id), so it keeps its place from one draw to the next. Sessions are placed in
  // agents.json order, so a new one does not push the older ones around. A spot must be
  // clear of the buildings placed before it; after 80 tries the clearest one is taken.
  function place(list, w, h, plot) {
    const order = amc.order || [];
    const rank = b => { const i = order.indexOf(b.id); return i < 0 ? order.length : i; };
    const placed = [];
    for (const b of [...list].sort((a, c) => rank(a) - rank(c))) {
      const rnd = rng(hash(b.id));
      let best = null, bestGap = -1;
      for (let t = 0; t < 80; t++) {
        const x = plot * 0.55 + rnd() * (w - plot * 1.1), y = plot * 0.95 + rnd() * (h - plot * 0.95 - 50);
        const gap = Math.min(Infinity, ...placed.map(p => Math.hypot((p.x - x) / (plot * 1.05), (p.y - y) / (plot * 0.95))));
        if (gap > bestGap) { best = {x, y}; bestGap = gap; }
        if (gap >= 1) break;
      }
      placed.push({...best, b});
    }
    return placed;
  }

  // Trees and rocks, the same ones every time (a fixed seed), not on a building's ground.
  function scenery(g, w, h, placed, plot) {
    const rnd = rng(7);
    const n = Math.max(6, Math.round(w * h / 22000));
    for (let i = 0; i < n; i++) {
      const pic = img[['tree', 'tree', 'tree-autumn', 'rock'][Math.floor(rnd() * 4)]];
      const x = rnd() * w, y = 30 + rnd() * (h - 30), s = 70 + rnd() * 30;
      if (!pic || placed.some(p => Math.abs(p.x - x) < plot * 0.6 && y > p.y - plot * 0.9 && y < p.y + plot * 0.45 + s * 0.8)) continue;
      g.drawImage(pic, x - s / 2, y - s * ANCHOR, s, s);
    }
  }

  function draw(list) {
    const box = $('relax'), cv = $('relax-canvas'), w = box.clientWidth;
    const cols = Math.max(2, Math.floor(w / 150));
    plot = w / cols;
    // Room for every building with space around it; past that, the camp scrolls.
    const h = Math.max(box.clientHeight - $('relax-top').offsetHeight, Math.ceil(list.length / cols) * plot * 1.6 + 60);
    const placed = place(list, w, h, plot);
    dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    bg = bg || document.createElement('canvas');
    bg.width = cv.width; bg.height = cv.height;
    const g = bg.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#4b7a46';
    g.fillRect(0, 0, w, h);
    scenery(g, w, h, placed, plot);
    spots = [];
    g.textAlign = 'center';
    // Back to front, so a building lower on the screen stands in front of one above it.
    for (const {x: cx, y: ground, b} of [...placed].sort((a, c) => a.y - c.y)) {
      // An ended session is a wreck.
      const level = b.status === 'ended' ? 'ruin' : b.level;
      const s = plot * 1.5, pic = img[level];
      // A patch of earth under each building.
      g.fillStyle = 'rgba(120, 90, 50, 0.35)';
      g.beginPath(); g.ellipse(cx, ground - 4, plot * 0.4, plot * 0.14, 0, 0, Math.PI * 2); g.fill();
      if (pic) g.drawImage(pic, cx - s / 2, ground - s * ANCHOR, s, s);
      const top = ground - s * (ANCHOR - TOP[level]);
      // Status: busy a tool sign, waiting a "!" flag; ended is the wreck.
      if ((b.status === 'busy' || b.status === 'running') && b.kind !== 'meeting') badge(g, cx + plot * 0.18, top - 4, '⚒', STATUS_COLORS.busy);
      if (b.status === 'waiting') badge(g, cx + plot * 0.18, top - 4, '!', STATUS_COLORS.waiting);
      // The name, with the tool's colour as a dot, and the status under it; an ended
      // session's name is dark grey on a pale label, with no status.
      g.font = "bold 12px 'DejaVu Sans Mono', Consolas, monospace";
      const name = b.name.length > 16 ? b.name.slice(0, 15) + '…' : b.name;
      const nw = g.measureText(name).width, ended = b.status === 'ended';
      g.fillStyle = ended ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.55)';
      const ly = ground + plot * 0.2;
      g.fillRect(cx - nw / 2 - 14, ly, nw + 22, ended ? 18 : 30);
      g.fillStyle = TOOL_COLORS[b.tool] || TOOL_COLORS.claude;
      if (b.kind === 'meeting') { g.font = "12px 'DejaVu Sans Mono', Consolas, monospace"; g.fillText('⚖', cx - nw / 2 - 5, ly + 13);
                                  g.font = "bold 12px 'DejaVu Sans Mono', Consolas, monospace"; }
      else { g.beginPath(); g.arc(cx - nw / 2 - 5, ly + 9, 4, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = ended ? '#3a3a3a' : '#ffffff';
      g.fillText(name, cx + 4, ly + 13);
      if (!ended) {
        g.font = "11px 'DejaVu Sans Mono', Consolas, monospace";
        g.fillStyle = STATUS_COLORS[b.status] || STATUS_COLORS.ended;
        g.fillText(b.status || '-', cx, ly + 26);
      }
      spots.unshift({x: cx - plot / 2, y: ground - plot * 0.9, w: plot, h: ly + 32 - (ground - plot * 0.9), b});
    }
    settle(placed);
    const out = cv.getContext('2d');
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.drawImage(bg, 0, 0);
    out.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const f of fires) flames(out, f);
    for (const p of [...people.values()].sort((a, c) => a.y - c.y)) person(out, p);
  }

  // --- the people: one per building that is not ended, and one per participant around
  // each discussion's fire.
  //
  // A session's person works by the building while it is busy, waves in front of it while
  // it waits for you, and otherwise sits in front of it, getting up now and then for a
  // walk of two or three stops. Where they go is kept relative to the building (home), so
  // a resize that moves the building takes them along.

  // Each spot: [dx, dy] in building widths from the ground point, and the way it faces.
  const SPOTS = {work: [0.34, 0.02, 1], wave: [0.05, 0.16, 0], seat: [-0.3, 0.12, 0]};
  function want(status) { return status === 'busy' || status === 'running' ? 'work' : status === 'waiting' ? 'wave' : 'rest'; }
  function spot(name) { const [dx, dy, dir] = SPOTS[name]; return {dx: dx * plot, dy: dy * plot, dir}; }
  function stroll() { const t = target({x: 0, y: 0}); return {dx: t.x, dy: t.y, dir: null}; }

  // A participant's place by the fire: SEATS in relax_art.html's world units, moved a
  // little towards the fire, then onto the screen as that camera sees the ground.
  function seat(cx, ground, i) {
    const [x, z, dir] = SEATS[i % SEATS.length], k = plot * 1.5 / 256 * 256 / 4.6 * 0.85;
    return {x: cx + (x - z) / Math.SQRT2 * k, y: ground + 0.364 * (x + z) * k, dir};
  }

  function settle(placed) {
    const keep = new Set();
    fires = [];
    for (const {x, y, b} of placed) {
      if (b.kind === 'meeting') {
        if (b.status === 'busy') fires.push({x, y});
        (b.people || []).forEach((m, i) => {
          const id = b.id + '#' + i, at = seat(x, y, i);
          keep.add(id);
          const p = people.get(id) || {frame: -1, tick: 0};
          people.set(id, Object.assign(p, {fixed: true, x: at.x, y: at.y, dir: at.dir, tool: m.tool, talking: m.talking}));
        });
        continue;
      }
      if (b.status === 'ended') continue;
      keep.add(b.id);
      const home = {x, y}, p = people.get(b.id);
      if (p) {
        p.x += x - p.home.x; p.y += y - p.home.y;
        Object.assign(p, {home, tool: b.tool, status: b.status});
      } else {
        // A new person starts where its status puts it, already at it.
        const w = want(b.status), g = spot(w === 'rest' ? 'seat' : w);
        people.set(b.id, {home, x: x + g.dx, y: y + g.dy, dir: g.dir, frame: -1, tick: 0, tool: b.tool, status: b.status,
                          want: w, mode: 'at', goal: g, wait: 5 + Math.random() * 30, laps: 0, pause: 0});
      }
    }
    for (const id of [...people.keys()]) if (!keep.has(id)) people.delete(id);
    clock();
  }
  // Somewhere in front of the building, a little to either side.
  function target(home) {
    return {x: home.x + (Math.random() - 0.5) * plot * 0.9, y: home.y + (Math.random() * 0.2 - 0.04) * plot};
  }
  function size() { return plot * 0.75; }
  function box(p) {
    const s = size();
    return [Math.floor(p.x - s / 2) - 1, Math.floor(p.y - s * ANCHOR) - 1, Math.ceil(s) + 2, Math.ceil(s) + 2];
  }
  function person(g, p) {
    const pic = img.people, s = size();
    if (!pic || p.frame < 0) return;
    const row = PEOPLE_ROW[p.tool] ?? 0, col = p.dir * PER_DIR + p.frame;
    g.drawImage(pic, col * CELL, row * CELL, CELL, CELL, p.x - s / 2, p.y - s * ANCHOR, s, s);
  }

  // One step of a session's person. Returns whether it looks different now.
  function step(p, dt) {
    const before = [p.x, p.y, p.dir, p.frame].join();
    const w = want(p.status);
    if (w !== p.want) {                    // the status changed: off to that spot
      p.want = w; p.mode = 'go'; p.goal = spot(w === 'rest' ? 'seat' : w); p.pause = 0;
    }
    if (p.pause > 0) {                     // a stop on a walk: standing
      p.pause -= dt; p.frame = F.stand;
    } else if (p.mode === 'at') {
      p.tick++;
      if (w === 'work') p.frame = F.work + p.tick % 4;
      else if (w === 'wave') p.frame = F.wave + p.tick % 4;
      else {
        p.frame = F.sit;
        p.wait -= dt;
        if (p.wait <= 0) { p.mode = 'stroll'; p.laps = 2 + Math.floor(Math.random() * 2); p.goal = stroll(); }
      }
    } else {                               // walking to p.goal
      const speed = plot * 0.2 * dt;
      const tx = p.home.x + p.goal.dx, ty = p.home.y + p.goal.dy, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
      if (d <= speed) {
        p.x = tx; p.y = ty; p.frame = F.stand;
        if (p.mode === 'stroll' && --p.laps > 0) { p.goal = stroll(); p.pause = 1 + Math.random() * 2; }
        else if (p.mode === 'stroll') { p.mode = 'go'; p.goal = spot('seat'); p.pause = 1 + Math.random() * 2; }
        else { p.mode = 'at'; p.dir = p.goal.dir; p.wait = 20 + Math.random() * 20; }
      } else {
        p.x += dx / d * speed; p.y += dy / d * speed;
        p.dir = dx >= 0 ? 0 : 1;
        p.tick++;
        p.frame = F.walk + p.tick % 4;
      }
    }
    return [p.x, p.y, p.dir, p.frame].join() !== before;
  }

  // A burning fire's flames: three tongues, their heights changing each tick.
  function flameBox(f) { const w = plot * 0.22, h = plot * 0.3; return [Math.floor(f.x - w / 2), Math.floor(f.y - h), Math.ceil(w), Math.ceil(h)]; }
  function flames(g, f) {
    const base = f.y - plot * 0.035, w = plot * 0.05;
    for (const [dx, color, tall] of [[-0.7, '#e8542a', 0.13], [0.7, '#e8542a', 0.12], [0, '#f6a623', 0.17], [0, '#ffe066', 0.09]]) {
      const h = plot * tall * (0.75 + Math.random() * 0.4), x = f.x + dx * w;
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(x - w, base);
      g.quadraticCurveTo(x - w * 0.9, base - h * 0.5, x, base - h);
      g.quadraticCurveTo(x + w * 0.9, base - h * 0.5, x + w, base);
      g.closePath(); g.fill();
    }
  }

  // One step for everyone. Only the squares that changed are drawn again, from the
  // background, then the flames and people on top.
  function tick() {
    if (!bg) return;
    const cv = $('relax-canvas'), g = cv.getContext('2d'), dirty = [], dt = TICK / 1000;
    for (const p of people.values()) {
      const before = box(p);
      if (p.fixed) {                       // around a fire: sitting, or up and talking
        const frame = p.talking ? F.work + p.tick++ % 4 : F.sit;
        if (frame === p.frame) continue;
        p.frame = frame;
      } else if (!step(p, dt)) continue;
      dirty.push(before, box(p));
    }
    for (const f of fires) dirty.push(flameBox(f));
    if (!dirty.length) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    for (const [x, y, w, h] of dirty) {
      const sx = Math.max(0, Math.floor(x * dpr)), sy = Math.max(0, Math.floor(y * dpr));
      const sw = Math.min(bg.width - sx, Math.ceil(w * dpr)), sh = Math.min(bg.height - sy, Math.ceil(h * dpr));
      if (sw > 0 && sh > 0) g.drawImage(bg, sx, sy, sw, sh, sx, sy, sw, sh);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hit = ([x, y, w, h]) => dirty.some(([a, b, c, d]) => x < a + c && a < x + w && y < b + d && b < y + h);
    for (const f of fires) if (hit(flameBox(f))) flames(g, f);
    for (const p of [...people.values()].filter(p => hit(box(p))).sort((a, c) => a.y - c.y)) person(g, p);
  }
  // The timer runs only while it has something to move and someone to see it.
  function clock() {
    const want = on && !document.hidden && (people.size > 0 || fires.length > 0);
    if (want && !timer) timer = setInterval(tick, TICK);
    if (!want && timer) { clearInterval(timer); timer = 0; }
  }

  function badge(g, x, y, text, color) {
    g.fillStyle = 'rgba(0, 0, 0, 0.6)';
    g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fill();
    g.strokeStyle = color; g.lineWidth = 2; g.stroke();
    g.fillStyle = color;
    g.font = "bold 13px 'DejaVu Sans Mono', Consolas, monospace";
    g.fillText(text, x, y + 5);
  }

  function at(e) {
    const r = $('relax-canvas').getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const s = spots.find(s => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
    return s ? s.b : null;
  }
  function say(text) {
    $('relax-msg').textContent = text;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { $('relax-msg').textContent = ''; }, 4000);
  }

  // Redraws when the buildings, their status or the size changed; otherwise nothing.
  function update(force) {
    if (!on || document.hidden) return;
    const list = buildings(), box = $('relax');
    const now = JSON.stringify([box.clientWidth, box.clientHeight, $('relax-top').offsetHeight,
                                list.map(b => [b.id, b.name, b.tool, b.status, b.level, b.people])]);
    if (now === sig && !force) return;
    sig = now;
    draw(list);
  }

  // --- above the camp: the open tasks on a board, and each tool's limits as stamina

  let boardTasks = [], staminaSig = '';
  async function loadTasks() {
    const {tasks, remaining} = await api().task_list();
    boardTasks = tasks;
    const shown = tasks.slice(0, BOARD_MAX), more = tasks.length - shown.length + (remaining || 0);
    $('board').innerHTML = '<div class="h">📋 Tasks</div>' + (shown.length ? shown.map((t, i) =>
      `<div class="board-row"><span class="what" title="${esc(t.text)}">${esc(t.text.charAt(0).toUpperCase() + t.text.slice(1))}</span>` +
      (t.due ? `<span class="due">${esc(t.due)}</span>` : '') +
      `<span class="st" data-i="${i}" style="color:${TASK_COLORS[t.status] || TASK_COLORS.Pending}">${esc(t.status || 'Pending')}</span></div>`).join('')
      : '<div class="more">No open tasks</div>') + (more > 0 ? `<div class="more">+${more} more</div>` : '');
  }
  // The limits left, as the Office usage panel's pies show them used: green, then
  // yellow under half, red under a fifth.
  function stamina(u) {
    const bars = [];
    if (u && !u.message) {
      for (const p of (u.claude && u.claude.pies) || []) bars.push(['Claude ' + p.caption, p.frac]);
      for (const w of (u.codex && u.codex.windows) || []) bars.push(['Codex ' + w.caption, w.frac]);
      for (const g of (u.agy && u.agy.groups) || []) bars.push([g.caption, g.frac]);
    }
    const now = JSON.stringify(bars);
    if (now === staminaSig) return;
    staminaSig = now;
    $('stamina').innerHTML = '<div class="h">⚡ Stamina</div>' + (bars.length ? bars.map(([k, used]) => {
      const left = Math.max(0, Math.min(1, 1 - used)), pct = Math.round(left * 100);
      const color = left < 0.2 ? '#e05a4a' : left < 0.5 ? '#e6b422' : '#6cc04a';
      return `<div class="bar" title="${esc(k)}: ${Math.round(used * 100)}% used"><span class="k">${esc(k)}</span>` +
        `<span class="track"><span class="fill" style="display:block;width:${pct}%;background:${color}"></span></span>` +
        `<span class="v">${pct}%</span></div>`;
    }).join('') : '<div>reading usage…</div>');
  }

  function set(mode) {
    on = mode === 'relax';
    save(on ? 'relax' : 'office');
    document.body.classList.toggle('relax', on);
    sig = '';
    clock();
    if (on) { loadTasks(); load().then(() => update(true)); }
  }

  function wire() {
    const cv = $('relax-canvas');
    cv.addEventListener('dblclick', e => {
      const b = at(e);
      if (!b) return;
      if (b.kind === 'meeting') amc.openDiscussion(b.row.disc);
      else if (b.status === 'ended') amc.start(b.id);
      else if (b.row && b.row.tab) amc.select(b.id);
      else say(b.row && b.row.headless ? `${b.name} is a background job (no window)` : `${b.name} runs outside this window`);
    });
    cv.addEventListener('contextmenu', e => {
      e.preventDefault();
      const b = at(e);
      rowMenu(b ? b.row : null, e);
    });
    cv.addEventListener('mousemove', e => {
      const b = at(e);
      if (b === hover) return;
      hover = b;
      cv.style.cursor = b ? 'pointer' : '';
      cv.title = !b ? '' : b.kind === 'meeting' ? `⚖ ${b.name} · ${b.status === 'busy' ? 'under way' : 'done'} (double-click to open)`
        : b.status === 'ended' ? `${b.name} · ended (double-click to start)`
        : `${b.name} · ${b.status} · ${b.tool === 'agy' ? (b.row.up || '') + ' open' : (b.row.turns || 0) + ' messages'}`;
    });
    // A task's status on the board opens the same menu as in the Tasks column.
    $('board').addEventListener('click', e => {
      const i = e.target.dataset.i;
      if (i === undefined) return;
      e.stopPropagation();
      taskEdit = boardTasks[+i];
      showAt($('status-menu'), e.clientX, e.clientY);
    });
    new ResizeObserver(() => update()).observe($('relax'));
    document.addEventListener('visibilitychange', () => { update(); clock(); });
    set(saved() === 'relax' ? 'relax' : 'office');
  }

  return {wire, set, update, stamina, loadTasks, get on() { return on; },
          _people: () => people, _fires: () => fires.length};   // for tests
})();
