// Relax mode: the Tasks and Sessions columns become a camp seen from above, one
// building per session, with its person walking about near it.
//
// It costs nothing while it is off, and little while it is on. The map has one fixed size,
// the same on every window; the wheel zooms it and dragging pans it. The page's 1-second
// refresh calls relax.update(); the map (land, roads, buildings) is drawn into a background
// canvas only when what it shows changed, and scaled from there into a window-sized one
// when the view changes. The people move on a 5 Hz timer that redraws only the small squares
// they leave and enter, from that. The names are a layer of their own, the same size at any
// zoom. Nothing runs while the window is hidden or Office mode is on.
// The pictures are PNGs made once by tools/relax_art.py from Kenney's kits (CC0).
const relax = (() => {
  const KEY = 'amc-mode';                  // 'relax' or 'office', per computer
  const PICS_BASE = ['level0', 'level1', 'level2', 'level3', 'level4', 'ruin', 'meeting', 'tree', 'tree-autumn', 'rock', 'people',
                'fence', 'signpost', 'lantern', 'stall', 'stall-green', 'fountain', 'tree-city',
                'house-a', 'house-b', 'house-c', 'house-d', 'house-e', 'house-f', 'house-g', 'house-h',
                'house-i', 'house-j', 'house-k', 'house-l', 'house-m', 'house-n',
                'shop', 'tavern', 'smithy', 'sawmill', 'warehouse', 'farm', 'windmill', 'watermill', 'church', 'townhall',
                'metro-a', 'metro-b', 'metro-c', 'metro-d', 'metro-e', 'metro-f', 'metro-g', 'metro-h', 'metro-tower-a', 'metro-tower-b', 'metro-tower-c', 'metro-tower-d', 'metro-tower-e', 'metro-mall', 'metro-cafe', 'metro-park', 'metro-lot', 'metro-level0', 'metro-level1', 'metro-level2', 'metro-level3', 'metro-level4', 'metro-ruin'];
  const LIT_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'tower-a', 'tower-b', 'tower-c', 'tower-d', 'tower-e', 'mall', 'cafe', 'level1', 'level2', 'level3', 'level4'].map(k => `metro-${k}-lit`);
  const PICS = [...PICS_BASE, 'metro-meeting', ...LIT_NAMES];
  // people.png: a row per tool, 28 frames of 128 px: 14 facing lower right, then the same
  // facing lower left; of each 14, F says which (relax_art.html's ACTS).
  const PEOPLE_ROW = {claude: 0, codex: 1, agy: 2}, CELL = 128, TICK = 200;   // 5 Hz
  const PER_DIR = 14, F = {stand: 0, walk: 1, work: 5, wave: 9, sit: 13};
  // The logs around a discussion's fire (relax_art.html's 'meeting'): [x, z] in world
  // units, and the way the one sitting there faces.
  const SEATS = [[-1.1, 0.15, 0], [0.15, -1.1, 1], [-0.85, -0.85, 0]];
  const ANCHOR = 0.88;                     // where the ground point is in each picture (y)
  const TOP = {level0: 0.80, level1: 0.66, level2: 0.56, level3: 0.29, level4: 0.10, ruin: 0.72, meeting: 0.70,
               'house-a': 0.52, 'house-b': 0.36, 'house-c': 0.3, 'house-d': 0.49, 'house-e': 0.07, 'house-f': 0.2, 'house-g': 0.3, 'house-h': 0.25,
               'house-i': 0.52, 'house-j': 0.36, 'house-k': 0.49, 'house-l': 0.2, 'house-m': 0.25, 'house-n': 0.07,
               shop: 0.28, tavern: 0.14, smithy: 0.38, sawmill: 0.43, warehouse: 0.23, farm: 0.33, windmill: 0.26, watermill: 0.3, church: 0.05, townhall: 0.18,
               'metro-a': 0.656, 'metro-b': 0.717, 'metro-c': 0.734, 'metro-cafe': 0.68, 'metro-d': 0.6, 'metro-e': 0.656, 'metro-f': 0.652, 'metro-g': 0.523, 'metro-h': 0.59, 'metro-level0': 0.742, 'metro-level1': 0.693, 'metro-level2': 0.607, 'metro-level3': 0.58, 'metro-level4': 0.338, 'metro-lot': 0.777, 'metro-mall': 0.627, 'metro-park': 0.57, 'metro-ruin': 0.723, 'metro-meeting': 0.762, 'metro-tower-a': 0.387, 'metro-tower-b': 0.094, 'metro-tower-c': 0.119, 'metro-tower-d': 0.098, 'metro-tower-e': 0.074};  // its top
  const TOOL_COLORS = {claude: '#d97757', codex: '#e6e6e6', agy: '#4f8cff', disc: '#ffc400'};
  const STATUS_COLORS = {busy: '#00dcff', running: '#00dcff', waiting: '#ffc400', idle: '#8cff8c', ended: '#8c96a0'};
  // The building grows with the messages typed into the session (agy: its hours open):
  // a campfire at 0, then a tent, a cabin, a house, a tower.
  const LEVELS = [[200, 'level4'], [50, 'level3'], [10, 'level2'], [1, 'level1'], [0, 'level0']];
  // The whole camp grows with the messages typed into all agents.json sessions, ended
  // ones too (snapshot's 'camp'): a tribe on grass, a village with dirt paths, a town
  // with stone roads, lanterns, a fountain and stalls, a city with a plaza, avenues and side streets inside a wall, then a metropolis of towers
  // and asphalt, the wall gone.
  // [from, name, ground, road colour (null: none), road width (building widths), edge,
  //  the trees kept, the props it puts in the free spots, how much its roads bend]
  const ERAS = [
    [5000, 'Metropolis', '#587a50', '#54575c', 0.17, '#a3a29a', 0.2, ['fountain'], 0.1],
    [1500, 'City', '#4f7d44', '#8f8b80', 0.17, '#5f5c57', 0.1, ['fountain', 'stall', 'stall-green', 'stall'], 0.1],
    [500, 'Town', '#4f7d44', '#a8a497', 0.13, '#7d796e', 0.5, ['fountain', 'stall', 'stall-green', 'fence'], 0.16],
    [100, 'Village', '#4b7a46', '#8a6d45', 0.1, null, 0.8, ['signpost', 'fence', 'fence'], 0.24],
    [0, 'Tribe', '#4b7a46', null, 0, null, 1, [], 0]];
  const ICON = {Tribe: '🏕', Village: '🏘', Town: '🏰', City: '🏯', Metropolis: '🏙'};
  const urban = e => e[1] === 'City' || e[1] === 'Metropolis';
  const metro = e => e[1] === 'Metropolis';
  const shown = (e, level) => (metro(e) && /^(level|ruin|meeting)/.test(level) ? 'metro-' + level : level);   // a session's picture
  const scaleOf = kind => (kind && kind.startsWith('metro-') ? 2 : 1);     // a metro picture shows twice the world
  const BOARD_MAX = 8;                     // tasks on the board; the rest are counted
  const TASK_COLORS = {Ongoing: '#0b5a7a', Checking: '#8a5a00', Pending: '#3a2a1a'};
  const MAP_W = 1800, MAP_H = 1350, ZOOM_MAX = 1.6;   // the map, in world units; a building's plot is 150
  const img = {};
  let on = false, sig = '', spots = [], hover = null, msgTimer = 0;
  const plot = 150;
  let bg = null, view = null, res = 1, dpr = 1, timer = 0, camp = 0;
  let zoom = 0, ox = 0, oy = 0, viewW = 0, viewH = 0, viewDirty = false, tags = [];
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
  function era(turns) { return ERAS.find(([n]) => turns >= n); }

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

  // What a thing on the ground takes up, as [left, top, right, bottom]. A session's base is
  // its footprint, person and name; its body is the room for a tower, the tallest it can
  // grow to, kept from the start so that growing never moves anything. Bodies may overlap
  // (one tower stands behind another), but none may cover a base.
  let bodyTop = 1.17;                      // how high a session's building can grow, in plots
  function room(x, y, prop) {
    const p = plot;
    if (prop) return {base: [x - p * 0.45, y - p * 0.55, x + p * 0.45, y + p * 0.22]};
    return {base: [x - p * 0.5, y - p * 0.35, x + p * 0.5, y + p * 0.2 + 38],
            body: [x - p * 0.3, y - p * bodyTop, x + p * 0.3, y - p * 0.35]};
  }
  const hits = (a, b) => a && b && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const clash = (a, b) => hits(a.base, b.base) || hits(a.body, b.base) || hits(b.body, a.base);

  // Where each building stands: scattered, more of them near the middle of the map, but each
  // session always tries the same spots (from its id), so it keeps its place from one draw to
  // the next. Sessions are placed in agents.json order. A spot must be clear of what was
  // placed before it and of the river; with no such spot left the clearest one is taken.
  function sorted(list) {
    const order = amc.order || [];
    const rank = b => { const i = order.indexOf(b.id); return i < 0 ? order.length : i; };
    return [...list].sort((a, c) => rank(a) - rank(c));
  }
  const LOW = plot * 1.25, HIGH = MAP_H - plot * 0.2 - 44, LEFT = plot * 0.55, RIGHT = MAP_W - plot * 0.55;
  function place(list, props) {
    const placed = [], midX = (LEFT + RIGHT) / 2, midY = (LOW + HIGH) / 2;
    // The era's props come after the sessions, so they never move a building; one with
    // no clear spot left is left out.
    for (const b of [...sorted(list), ...props]) {
      const rnd = rng(hash(b.id));
      let best = null, bestScore = Infinity;
      for (let t = 0; t < 200; t++) {
        const x = midX + (rnd() + rnd() - 1) * (RIGHT - LEFT) / 2, y = midY + (rnd() + rnd() - 1) * (HIGH - LOW) / 2;
        const r = room(x, y, b.prop), n = placed.reduce((sum, q) => sum + (clash(r, q.r) ? 1 : 0), 0);
        if (n >= bestScore) continue;
        const score = n + (wet(x, y) ? 100 : 0);
        if (score < bestScore) { best = {x, y, r}; bestScore = score; }
        if (!score) break;
      }
      if (bestScore && b.prop) continue;
      placed.push({...best, b});
    }
    return placed;
  }
  // A city's roads, grown like a real town's: a plaza, avenues from it out through the wall,
  // a road along each river bank, then side streets branching off those. A street stops where
  // it meets another (a T), at the river, or after a while, so no two blocks are the same.
  // Only avenues cross the river. Distances are on the ground: KY squashes y as the picture does.
  // The same every time, as the map never changes size.
  const KY = 0.62, PLAZA = {x: MAP_W * 0.64, y: MAP_H * 0.62};
  const AVENUES = [
    [[0, 0.42], [0.2, 0.47], [0.4, 0.53], [0.64, 0.62], [0.82, 0.59], [1, 0.66]],
    [[0.88, 0.13], [0.8, 0.35], [0.64, 0.62], [0.59, 0.82], [0.66, 1]],
    [[0.34, 0.13], [0.44, 0.27], [0.64, 0.62], [0.84, 0.8], [1, 0.93]],
    [[0.64, 0.62], [0.46, 0.84], [0.3, 1]],
    [[0.3, 0.13], [0.22, 0.34], [0.26, 0.62], [0.17, 0.82], [0.2, 1]]];
  const groundGap = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) / KY);
  // Evenly spaced points along a smooth line through the given ones (Catmull-Rom).
  function spline(ctrl, step = 20) {
    const line = [ctrl[0]];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
      for (let k = 1; k <= 40; k++) {
        const t = k / 40, t2 = t * t, t3 = t2 * t;
        const at = v => 0.5 * (2 * p1[v] + (p2[v] - p0[v]) * t + (2 * p0[v] - 5 * p1[v] + 4 * p2[v] - p3[v]) * t2 + (3 * p1[v] - p0[v] - 3 * p2[v] + p3[v]) * t3);
        const q = {x: at('x'), y: at('y')};
        if (groundGap(q, line[line.length - 1]) >= step) line.push(q);
      }
    }
    return line;
  }
  function growStreets() {
    const rnd = rng(23), all = [], pts = [];
    const add = (line, width, gen) => {
      const r = {line, width, gen};
      all.push(r);
      for (const q of line) pts.push({x: q.x, y: q.y, r, half: width * plot / 2});
      return r;
    };
    for (const a of AVENUES) add(spline(a.map(([x, y]) => ({x: x * MAP_W, y: y * MAP_H}))), 0.22, 0);
    // Along each bank, from below the mountains down.
    for (const side of [-1, 1]) {
      const bank = river.map((q, i) => {
        const p = river[Math.max(0, i - 1)], n = river[Math.min(river.length - 1, i + 1)], d = Math.hypot(n.x - p.x, n.y - p.y);
        return {x: q.x - (n.y - p.y) / d * 42 * side, y: q.y + (n.x - p.x) / d * 42 * side};
      }).filter(q => q.y > plot * 1.1 && q.y < MAP_H - 15 && q.x > 15 && q.x < MAP_W - 15);
      add(spline(bank), 0.13, 0);
    }
    const outside = q => q.x < 25 || q.x > MAP_W - 25 || q.y < plot * 1.1 || q.y > MAP_H - 25;
    // One street from a point on the road it leaves, or null if it would get nowhere.
    const walk = (from, h, most, parent) => {
      const line = [from];
      let q = from, turn = 0;
      for (let len = 20; len <= most; len += 20) {
        turn = turn * 0.8 + (rnd() - 0.5) * 0.09;
        h += turn;
        q = {x: q.x + Math.cos(h) * 20, y: q.y + Math.sin(h) * 20 * KY};
        if (outside(q) || riverGap(q.x, q.y) < 48) return len > 140 ? line : null;
        let best = null, gap = Infinity;
        for (const p of pts) {
          if (len < 100 && p.r === parent) continue;
          const d = groundGap(p, q);
          if (d < gap) { gap = d; best = p; }
        }
        if (gap < 80) {
          if (len < 100) return null;                    // too near another road to make a block
          let a = Math.atan2((best.y - q.y) / KY, best.x - q.x) - h;
          a = Math.atan2(Math.sin(a), Math.cos(a));
          if (Math.abs(a) < 1.1) { line.push(q, {x: best.x, y: best.y}); return line; }
          return len > 140 ? line : null;                // alongside another road: stop here
        }
        line.push(q);
      }
      return line;
    };
    for (let n = 0; n < all.length; n++) {
      const r = all[n];
      if (r.gen > 2) continue;
      for (const side of [-1, 1]) {
        for (let i = 5 + Math.floor(rnd() * 6); i < r.line.length - 4; i += 8 + Math.floor(rnd() * 6)) {
          const q = r.line[i], p = r.line[i - 1], m = r.line[i + 1];
          if (rnd() > 1.2 - groundGap(q, PLAZA) / 1100) continue;   // fewer further out
          const h = Math.atan2((m.y - p.y) / KY, m.x - p.x) + side * (Math.PI / 2 + (rnd() - 0.5) * 0.7);
          const line = walk(q, h, [700, 460, 300][r.gen], r);
          if (line) add(line, 0.12, r.gen + 1);
        }
      }
    }
    return {all, pts};
  }
  // Where a building can stand: along both sides of every road. The lots nearest the plaza
  // are taken first and packed closest, so the middle is the densest. No tower may hide a bridge.
  function streetLots({all, pts}) {
    const rx = plot * 0.36, ry = plot * 0.2, free = [], lots = [];
    const bridge = pts.filter(p => riverGap(p.x, p.y) < riverWidth() / 2 + plot * 0.05);
    const clear = (x, y) => !pts.some(p => Math.hypot((p.x - x) / (rx + p.half), (p.y - y) / (ry + p.half)) < 1) && !wet(x, y);
    // Round the plaza first.
    for (let a = 0; a < 32; a++) {
      const x = PLAZA.x + Math.cos(a / 32 * Math.PI * 2) * 188, y = PLAZA.y + Math.sin(a / 32 * Math.PI * 2) * 112;
      if (clear(x, y)) free.push({x, y, far: 0});
    }
    for (const r of all) for (const side of [-1, 1]) for (let i = 2; i < r.line.length - 2; i++) {
      const a = r.line[i - 1], c = r.line[i + 1], d = Math.hypot(c.x - a.x, c.y - a.y) || 1;
      const nx = -(c.y - a.y) / d * side, ny = (c.x - a.x) / d * side;
      const off = plot * r.width / 2 + 6 + Math.hypot(rx * nx, ry * ny);
      const x = r.line[i].x + nx * off, y = r.line[i].y + ny * off;
      if (x < LEFT || x > RIGHT || y < LOW || y > HIGH || !clear(x, y)) continue;
      if (Math.hypot((x - PLAZA.x) / 170, (y - PLAZA.y) / 100) < 1) continue;
      if (bridge.some(p => Math.abs(p.x - x) < plot * 0.5 && p.y > y - plot * 1.3 && p.y < y)) continue;
      free.push({x, y, far: groundGap({x, y}, PLAZA) / 1100});
    }
    free.sort((a, c) => a.far - c.far);
    for (const l of free) {
      if (lots.some(q => groundGap(q, l) < 96 + 50 * l.far)) continue;
      l.n = lots.length;
      lots.push(l);
    }
    return lots;
  }
  // [picture, how far from the plaza it may stand (0 to 1; further out above that), how many,
  //  beside the river]. LANDMARKS are placed before the sessions, so they always stand where they do.
  const LANDMARKS = [['townhall', 0, 0.45, 1], ['church', 0.2, 0.7, 1]];
  const WORKS = [['shop', 0, 0.65, 3], ['tavern', 0, 0.65, 2], ['smithy', 0.3, 0.85, 1], ['watermill', 0, 2, 1, true],
                 ['sawmill', 0.4, 0.95, 1], ['warehouse', 0.3, 0.95, 2], ['windmill', 0.7, 2, 2], ['farm', 0.75, 2, 3]];
  const METRO_LANDMARKS = [['metro-tower-c', 0, 0.3, 1], ['metro-tower-e', 0, 0.4, 1], ['metro-mall', 0, 0.45, 1]];
  const METRO_WORKS = [['metro-tower-b', 0, 0.5, 2], ['metro-cafe', 0, 0.6, 3], ['metro-park', 0.15, 0.9, 3], ['metro-lot', 0.3, 1, 2], ['metro-tower-a', 0.2, 0.6, 2]];
  const BIG = new Set(['farm', 'windmill', 'sawmill', 'warehouse', 'tavern', 'townhall', 'church', 'metro-mall', 'metro-park', 'metro-lot', 'metro-f', 'metro-g', 'metro-h']);
  // Where a wider building can stand: the same, further from the road.
  function wideSpots({all, pts}) {
    const rx = plot * 0.5, ry = plot * 0.3, list = [];
    for (const r of all) for (const side of [-1, 1]) for (let i = 2; i < r.line.length - 2; i += 2) {
      const a = r.line[i - 1], c = r.line[i + 1], d = Math.hypot(c.x - a.x, c.y - a.y) || 1;
      const nx = -(c.y - a.y) / d * side, ny = (c.x - a.x) / d * side;
      const off = plot * r.width / 2 + 6 + Math.hypot(rx * nx, ry * ny);
      const x = r.line[i].x + nx * off, y = r.line[i].y + ny * off;
      if (x < LEFT || x > RIGHT || y < LOW || y > HIGH || wet(x, y)) continue;
      if (Math.hypot((x - PLAZA.x) / 190, (y - PLAZA.y) / 115) < 1) continue;
      if (pts.some(p => Math.hypot((p.x - x) / (rx + p.half), (p.y - y) / (ry + p.half)) < 1)) continue;
      list.push({x, y, far: groundGap({x, y}, PLAZA) / 1100});
    }
    return list.sort((p, q) => p.far - q.far).map((l, n) => ({...l, n: `w${n}`}));
  }
  let cityMemo = null;
  function cityPlan() {
    if (cityMemo) return cityMemo;
    const grown = growStreets(), edges = [];
    // In stretches, for the lanterns and trees beside them.
    for (const r of grown.all)
      for (let i = 0; i < r.line.length - 1; i += 15)
        edges.push({line: r.line.slice(i, i + 16), width: r.width});
    return (cityMemo = {edges, lots: streetLots(grown), wide: wideSpots(grown), bridge: grown.pts.filter(p => riverGap(p.x, p.y) < riverWidth() / 2 + plot * 0.05)});
  }
  // The fountain stands on the plaza. The sessions and props each take the first free lot,
  // nearest the plaza give or take a little (from the id).
  function city(list, props, e) {
    const {lots, wide} = cityPlan(), placed = [], used = new Set(), houses = [], m = metro(e);
    bodyTop = m ? 1.85 : 1.17;
    for (const b of props.filter(q => q.kind === 'fountain')) placed.push({...PLAZA, r: {base: [PLAZA.x - plot * 0.45, PLAZA.y - plot * 0.25, PLAZA.x + plot * 0.45, PLAZA.y + plot * 0.16]}, b});
    let named = placed;
    // A building on a spot, if it hides no session's door or person, and fits among the others.
    const build = (l, kind) => {
      const tall = (ANCHOR - TOP[kind]) * plot * 1.5 * scaleOf(kind), half = plot * (BIG.has(kind) ? 0.46 : 0.36);
      const r = {base: [l.x - half, l.y - plot * 0.24, l.x + half, l.y + plot * 0.16],
                 body: [l.x - plot * 0.3, l.y - tall, l.x + plot * 0.3, l.y - plot * 0.24]};
      if (named.some(q => clash(r, q.r)) || houses.some(h => hits(r.base, h))) return false;
      houses.push(r.base);
      used.add(l);
      placed.push({x: l.x, y: l.y, r, b: {id: `~h${l.n}`, prop: true, house: true, kind}});
      return true;
    };
    const works = list2 => {
      for (const [kind, near, far, count, bank] of list2) {
        let left = count;
        for (const l of BIG.has(kind) ? wide : lots) {
          if (!left) break;
          if (used.has(l) || l.far < near || l.far > far) continue;
          if (bank && riverGap(l.x + plot * 0.6, l.y) > plot * 0.35) continue;
          if (build(l, kind)) left--;
        }
      }
    };
    works(m ? METRO_LANDMARKS : LANDMARKS);
    for (const b of [...sorted(list), ...props.filter(q => q.kind !== 'fountain')]) {
      const rnd = rng(hash(b.id));
      const order = lots.map(l => [l.far + rnd() * 0.25, l]).sort((a, c) => a[0] - c[0]);
      const free = ([, l]) => !used.has(l) && !placed.some(q => clash(room(l.x, l.y, b.prop), q.r));
      // With the lots full, a session may take a spot set back from the road.
      const found = order.find(free) || (!b.prop && wide.map(l => [0, l]).find(free));
      if (!found) { if (!b.prop) placed.push({...order[0][1], r: room(order[0][1].x, order[0][1].y), b}); continue; }
      const l = found[1];
      used.add(l);
      placed.push({x: l.x, y: l.y, r: room(l.x, l.y, b.prop), b});
    }
    // Then the rest of what makes it a city, each where it belongs; then houses fill most of
    // the lots left, the fewer the further out.
    named = [...placed];
    works(m ? METRO_WORKS : WORKS);
    for (const l of lots) {
      if (used.has(l)) continue;
      if (rng(hash(`lot${l.n}`))() > (m ? 1.8 - l.far : 1.45 - l.far * 1.2)) continue;
      // Tall in the middle, low further out; a lower one where a tall one would not fit.
      const choice = m ? (l.far < 0.45 ? ['metro-tower-a', 'metro-g', 'metro-tower-d', 'metro-h', 'metro-d'] : l.far < 0.8 ? ['metro-d', 'metro-g', 'metro-f', 'metro-a', 'metro-e', 'metro-h'] : ['metro-b', 'metro-c', 'metro-a', 'metro-e', 'metro-f'])
        : l.far < 0.45 ? ['house-e', 'house-l', 'house-f', 'house-n', 'house-c', 'house-m', 'house-g', 'house-h']
        : l.far < 0.8 ? ['house-b', 'house-m', 'house-c', 'house-j', 'house-f', 'house-k', 'house-a', 'house-l', 'house-d', 'house-i', 'house-g', 'house-h']
        : ['house-a', 'house-k', 'house-d', 'house-i', 'house-b', 'house-j', 'house-g'];
      const first = choice[l.n % choice.length];     // in turn, so neighbours differ
      const lower = m ? ['metro-e', 'metro-a', 'metro-b', 'metro-c'] : l.n % 2 ? ['house-g', 'house-j', 'house-d', 'house-i'] : ['house-j', 'house-b', 'house-k', 'house-a'];
      [first, ...lower].some(kind => build(l, kind));
    }
    return placed;
  }
  // Everyone's place, worked out again only when who is there or the era changes.
  let layoutKey = '', layoutMemo = [];
  function layout(list, e) {
    const props = e[7].map((kind, i) => ({id: '~' + kind + i, kind, prop: true}));
    const key = JSON.stringify([list.map(b => b.id), e[1], amc.order]);
    if (key !== layoutKey) {
      layoutKey = key;
      if (!metro(e)) bodyTop = 1.17;
      layoutMemo = urban(e) ? city(list, props, e) : place(list, props);
    }
    const byId = new Map(list.map(b => [b.id, b]));
    return layoutMemo.map(p => (byId.has(p.b.id) ? {...p, b: byId.get(p.b.id)} : p));
  }

  // Trees and rocks, the same ones every time (a fixed seed), not on a building's ground.
  // The more the camp has grown, the fewer are left; a city keeps a few planted ones.
  // --- the land under it all, drawn into the background: drawn, not pictures, so no new art.
  // A river from the mountains at the top to the bottom edge, the same for the same size.
  let river = [];
  function riverPath(w, h) {
    const line = [], n = 60;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      line.push({x: w * (0.8 - 0.48 * t + 0.07 * Math.sin(t * 7.5) + 0.025 * Math.sin(t * 19)), y: -10 + (h + 20) * t});
    }
    return line;
  }
  const riverWidth = () => plot * 0.3;
  function riverGap(x, y) { return Math.min(...river.map(q => Math.hypot(q.x - x, q.y - y))); }
  // A building with its person and its name keeps off the river: its ground point, sides,
  // and name below.
  function wet(x, y) {
    const clear = riverWidth() / 2 + plot * 0.14;
    return [[0, 0], [-0.45, 0], [0.45, 0], [0, 0.42], [-0.3, 0.42], [0.3, 0.42]]
      .some(([dx, dy]) => riverGap(x + dx * plot, y + dy * plot) < clear);
  }
  function strokeLine(g, line, color, width, cap = 'round') {
    g.strokeStyle = color; g.lineWidth = width; g.lineCap = cap; g.lineJoin = 'round';
    g.beginPath();
    line.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
    g.stroke();
  }
  // A low-poly mountain, lit from the left like the kits' pictures: a lit and a shaded face,
  // and snow on the tall ones.
  function mountain(g, x, base, wide, high) {
    const peak = {x: x - wide * 0.06, y: base - high};
    const face = (pts, color) => { g.fillStyle = color; g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.fill(); };
    const left = [x - wide / 2, base], right = [x + wide / 2, base], foot = [x + wide * 0.08, base + wide * 0.05];
    face([left, [peak.x, peak.y], foot], '#93a08f');
    face([right, [peak.x, peak.y], foot], '#6a7a6b');
    if (high > plot * 0.5) {
      const k = 0.3, at = ([a, b]) => [peak.x + (a - peak.x) * k, peak.y + (b - peak.y) * k];
      const l = at(left), f = at(foot), r = at(right);
      face([l, [peak.x, peak.y], f, [(l[0] + f[0]) / 2, (l[1] + f[1]) / 2 - high * 0.03]], '#f4f6f4');
      face([r, [peak.x, peak.y], f, [(r[0] + f[0]) / 2, (r[1] + f[1]) / 2 - high * 0.03]], '#c9d2d6');
    }
  }
  function land(g, w, h, e) {
    const rnd = rng(11);
    // The mountains along the top, back to front, the river's source among them.
    const source = river[0].x, peaks = [];
    for (let x = -plot * 0.2; x < w + plot * 0.4; x += plot * (0.55 + rnd() * 0.4)) {
      const near = 1 - Math.min(1, Math.abs(x - source) / (w * 0.42));   // highest around the source
      peaks.push([x, plot * (0.3 + near * 0.42 + rnd() * 0.12)]);
    }
    for (const [x, high] of peaks) mountain(g, x, plot * 0.76 + rnd() * plot * 0.08, high * 1.7, high);
    // Their feet melt into the grass.
    const foot = g.createLinearGradient(0, plot * 0.62, 0, plot * 0.98);
    foot.addColorStop(0, 'rgba(79, 125, 68, 0)');
    foot.addColorStop(1, e[2]);
    g.fillStyle = foot;
    g.fillRect(0, plot * 0.62, w, plot * 0.36);
    // Soft patches, so the grass is not one flat colour: each fades out to nothing, no edge.
    for (let i = 0, n = Math.round(w * h / 45000); i < n; i++) {
      const tint = rnd() < 0.5 ? '255, 255, 190' : '0, 50, 20', x = rnd() * w, y = plot * 0.9 + rnd() * (h - plot * 0.9);
      const rx = plot * (0.8 + rnd() * 1.2), ry = plot * (0.35 + rnd() * 0.5);
      const fade = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      fade.addColorStop(0, `rgba(${tint}, 0.1)`);
      fade.addColorStop(1, `rgba(${tint}, 0)`);
      g.save();
      g.translate(x, y); g.scale(rx, ry);
      g.fillStyle = fade;
      g.fillRect(-1, -1, 2, 2);
      g.restore();
    }
    // Banks, then water with a paler line down its middle; a city's river runs between stone.
    strokeLine(g, river, urban(e) ? '#8b887d' : '#c7b27a', riverWidth() + plot * 0.07);
    strokeLine(g, river, '#3c86bd', riverWidth());
    strokeLine(g, river, 'rgba(160, 215, 240, 0.35)', riverWidth() * 0.34);
  }
  // A bridge wherever a road crosses the river: the road's part over the water, drawn again
  // as planks (a town's and a city's: stone) with a rail on each side.
  function bridges(g, edges, e) {
    const half = riverWidth() / 2 + plot * 0.05, wood = e[1] === 'Village';
    for (const {line, width} of edges) {
      let part = [];
      const flush = () => {
        if (part.length > 1) {
          const wide = plot * (width || e[4]);
          strokeLine(g, part, wood ? '#4f3a22' : '#55534d', wide + plot * 0.05, 'butt');
          strokeLine(g, part, wood ? '#a57c4c' : metro(e) ? e[3] : '#b9b5a8', wide, 'butt');
          g.setLineDash([2, 6]);
          strokeLine(g, part, 'rgba(0, 0, 0, 0.28)', wide, 'butt');
          g.setLineDash([]);
        }
        part = [];
      };
      for (const q of line) {
        if (riverGap(q.x, q.y) < half) part.push(q);
        else flush();
      }
      flush();
    }
  }
  function scenery(g, w, h, placed, plot, e, edges) {
    const rnd = rng(7);
    // Points along the roads, so nothing grows on one.
    const road = roadPoints(edges);
    const clear = plot * (e[4] / 2 + 0.12);
    const n = Math.max(6, Math.round(w * h / 22000));
    for (let i = 0; i < n; i++) {
      const kind = ['tree', 'tree', 'tree-autumn', 'rock'][Math.floor(rnd() * 4)];
      const x = rnd() * w, y = 30 + rnd() * (h - 30), s = 70 + rnd() * 30, keep = rnd() < e[6];
      const pic = img[urban(e) ? (kind === 'rock' ? 'rock' : 'tree-city') : kind];
      if (road.some(p => Math.hypot(p.x - x, p.y - y) < clear)) continue;
      if (riverGap(x, y) < riverWidth() / 2 + s * 0.2 || y < plot * 0.45) continue;   // nor in the river or on the mountains
      if (!keep || !pic || placed.some(p => Math.abs(p.x - x) < plot * 0.6 && y > p.y - plot * 0.9 && y < p.y + plot * 0.45 + s * 0.8)) continue;
      g.drawImage(pic, x - s / 2, y - s * ANCHOR, s, s);
    }
  }

  function draw(list) {
    const w = MAP_W, h = MAP_H, e = era(camp);
    if (!river.length) river = riverPath(w, h);
    const placed = layout(list, e);
    res = Math.min(window.devicePixelRatio || 1, 1.5);
    bg = bg || document.createElement('canvas');
    bg.width = Math.round(w * res); bg.height = Math.round(h * res);
    const g = bg.getContext('2d');
    g.setTransform(res, 0, 0, res, 0, 0);
    g.fillStyle = e[2];
    g.fillRect(0, 0, w, h);
    land(g, w, h, e);
    const {lamps: allLamps, edges} = roads(g, placed, e);
    const lamps = allLamps.filter(l => riverGap(l.x, l.y) > riverWidth() / 2 + plot * 0.04);
    lampCount = lamps.length;
    bridges(g, edges, e);
    const trees = urban(e) ? streetTrees(edges, placed, lamps, e, w, h) : [];
    scenery(g, w, h, placed, plot, e, edges);
    if (e[1] === 'City') wall(g, w, h);
    spots = [];
    tags = [];
    litList = [];
    g.textAlign = 'center';
    // Back to front, so a building lower on the screen stands in front of one above it.
    for (const {x: cx, y: ground, b} of [...placed, ...lamps, ...trees].sort((a, c) => a.y - c.y)) {
      if (b.prop) {
        const s = plot * 1.5 * (b.scale || scaleOf(b.kind));
        if (img[b.kind]) g.drawImage(img[b.kind], cx - s / 2, ground - s * ANCHOR, s, s);
        if (metro(e)) litList.push([b.kind, cx, ground, s]);
        continue;
      }
      // An ended session is a wreck.
      const level = shown(e, b.status === 'ended' ? 'ruin' : b.level);
      const s = plot * 1.5 * scaleOf(level), pic = img[level];
      // A patch of earth under each building.
      g.fillStyle = 'rgba(120, 90, 50, 0.35)';
      g.beginPath(); g.ellipse(cx, ground - 4, plot * 0.4, plot * 0.14, 0, 0, Math.PI * 2); g.fill();
      const building = (b.status === 'busy' || b.status === 'running') && b.kind !== 'meeting';
      if (building) scaffold(g, cx, ground, level, false);
      if (pic) g.drawImage(pic, cx - s / 2, ground - s * ANCHOR, s, s);
      if (building) scaffold(g, cx, ground, level, true);
      if (metro(e)) litList.push([level, cx, ground, s]);
      const top = ground - s * (ANCHOR - TOP[level]);
      tags.push({cx, ground, top, b});
      spots.unshift({x: cx - plot / 2, y: ground - plot * 0.9, w: plot, h: plot * 1.1 + 34, b});
    }
    // What is lit at night: each building with someone in it, the fires, the lanterns.
    lights = [...placed.filter(p => !p.b.prop && p.b.status !== 'ended').map(p => ({x: p.x, y: p.y - plot * 0.1, r: plot * (p.b.kind === 'meeting' ? 0.95 : 0.8)})),
              ...lamps.filter(l => l.b.kind === 'lantern').map(l => ({x: l.x, y: l.y - plot * 0.25, r: plot * 0.5}))];
    eraNow = e;
    settle(placed.filter(p => !p.b.prop));
    skySig = '';
    compose();
    sky();
  }

  // --- the view: which part of the map shows, and how big
  function fitZoom() { return Math.min(viewW / MAP_W, viewH / MAP_H); }
  // Within the map; a map smaller than the window sits in its middle.
  function clampView() {
    const fit = fitZoom();
    zoom = Math.max(fit, Math.min(ZOOM_MAX, zoom || fit));
    ox = MAP_W * zoom <= viewW ? -(viewW / zoom - MAP_W) / 2 : Math.max(0, Math.min(MAP_W - viewW / zoom, ox));
    oy = MAP_H * zoom <= viewH ? -(viewH / zoom - MAP_H) / 2 : Math.max(0, Math.min(MAP_H - viewH / zoom, oy));
  }
  function measure() {
    const box = $('relax');
    const w = box.clientWidth, h = box.clientHeight - $('relax-top').offsetHeight;
    if (w === viewW && h === viewH) return false;
    const wasFit = !zoom || Math.abs(zoom - fitZoom()) < 0.001;
    viewW = w; viewH = h;
    if (wasFit) zoom = fitZoom();
    return true;
  }
  function worldOn(g) { const k = dpr * zoom; g.setTransform(k, 0, 0, k, -ox * k, -oy * k); }
  // The window's picture of the map, then the flames, people, names and night over it.
  function compose() {
    if (!bg) return;
    measure();
    if (viewW <= 0 || viewH <= 0) return;
    clampView();
    dpr = window.devicePixelRatio || 1;
    const cv = $('relax-canvas'), W = Math.round(viewW * dpr), H = Math.round(viewH * dpr);
    view = view || document.createElement('canvas');
    if (view.width !== W || view.height !== H) {
      view.width = W; view.height = H;
      cv.width = W; cv.height = H;
      cv.style.width = viewW + 'px'; cv.style.height = viewH + 'px';
    }
    const v = view.getContext('2d'), k = dpr * zoom;
    v.setTransform(1, 0, 0, 1, 0, 0);
    v.fillStyle = '#3f6a3b';
    v.fillRect(0, 0, W, H);
    v.imageSmoothingQuality = 'high';
    v.drawImage(bg, -ox * k, -oy * k, MAP_W * k, MAP_H * k);
    const out = cv.getContext('2d');
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.drawImage(view, 0, 0);
    worldOn(out);
    for (const f of fires) flames(out, f);
    for (const p of [...people.values()].sort((a, c) => a.y - c.y)) person(out, p);
    drawTags();
    drawNight();
  }
  // One compose for any number of wheel and drag events.
  function viewChanged() {
    if (viewDirty) return;
    viewDirty = true;
    setTimeout(() => { viewDirty = false; compose(); }, 16);
  }
  // The names and status badges, the same size at any zoom. Those that need you come first;
  // one that would land on another is left out until you zoom in (hovering still names it).
  function drawTags() {
    const cv = $('relax-labels'), W = Math.round(viewW * dpr), H = Math.round(viewH * dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W; cv.height = H;
      cv.style.width = viewW + 'px'; cv.style.height = viewH + 'px';
    }
    const g = cv.getContext('2d'), full = zoom >= 0.8, taken = [];
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, viewW, viewH);
    g.textAlign = 'center';
    const need = t => (t.b.status === 'waiting' ? 0 : t.b.status === 'busy' || t.b.status === 'running' ? 1 : t.b.status === 'ended' ? 3 : 2);
    for (const {cx, ground, top, b} of [...tags].sort((a, c) => need(a) - need(c))) {
      const x = (cx - ox) * zoom, y = (ground + plot * 0.2 - oy) * zoom;
      if (x < -80 || x > viewW + 80 || y < -40 || y > viewH + 40) continue;
      const ended = b.status === 'ended', most = full ? 16 : 13;
      const name = b.name.length > most ? b.name.slice(0, most - 1) + '…' : b.name;
      g.font = "bold 12px 'DejaVu Sans Mono', Consolas, monospace";
      const nw = g.measureText(name).width, high = ended || !full ? 18 : 30;
      const rect = [x - nw / 2 - 14, y, nw + 22, high];
      const busy = (b.status === 'busy' || b.status === 'running') && b.kind !== 'meeting';
      // Status: busy a tool sign, waiting a "!" flag; ended is the wreck.
      if (busy) badge(g, (cx + plot * 0.18 - ox) * zoom, (top - oy) * zoom - 4, '⚒', STATUS_COLORS.busy);
      if (b.status === 'waiting') badge(g, (cx + plot * 0.18 - ox) * zoom, (top - oy) * zoom - 4, '!', STATUS_COLORS.waiting);
      if (taken.some(q => rect[0] < q[0] + q[2] && q[0] < rect[0] + rect[2] && rect[1] < q[1] + q[3] && q[1] < rect[1] + rect[3])) continue;
      taken.push(rect);
      // The name, with the tool's colour as a dot, and the status under it; an ended
      // session's name is dark grey on a pale label, with no status.
      g.fillStyle = ended ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.55)';
      g.fillRect(...rect);
      g.fillStyle = TOOL_COLORS[b.tool] || TOOL_COLORS.claude;
      if (b.kind === 'meeting') { g.font = "12px 'DejaVu Sans Mono', Consolas, monospace"; g.fillText('⚖', x - nw / 2 - 5, y + 13);
                                  g.font = "bold 12px 'DejaVu Sans Mono', Consolas, monospace"; }
      else { g.beginPath(); g.arc(x - nw / 2 - 5, y + 9, 4, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = ended ? '#3a3a3a' : '#ffffff';
      g.fillText(name, x + 4, y + 13);
      if (!ended && full) {
        g.font = "11px 'DejaVu Sans Mono', Consolas, monospace";
        g.fillStyle = STATUS_COLORS[b.status] || STATUS_COLORS.ended;
        g.fillText(b.status || '-', x, y + 26);
      }
    }
    if (eraNow) eraLabel(g, eraNow);
  }

  // A busy session's building is under construction: wooden scaffolding around it, up to
  // under its roof. Drawn in two parts, the back before the building and the front after,
  // on the pictures' camera: a square of half side 0.72 in world units on the ground.
  function scaffold(g, cx, ground, level, front) {
    const dx = plot * 0.332, dy = plot * 0.171, floor = plot * 0.279;
    // A campfire or a tent has no walls to climb: only a low fence around the site.
    const low = /level[01]$/.test(level);
    const tall = low ? floor * 0.4 : Math.max(floor, (ANCHOR - TOP[level]) * plot * 1.5 * scaleOf(level) * 0.72);
    const L = [cx - dx, ground], R = [cx + dx, ground], near = [cx, ground + dy], far = [cx, ground - dy];
    const sides = front ? [[L, near], [near, R]] : [[far, L], [far, R]];
    const line = (a, b, up1, up2, color, width) => {
      g.strokeStyle = color; g.lineWidth = width;
      g.beginPath(); g.moveTo(a[0], a[1] - up1); g.lineTo(b[0], b[1] - up2); g.stroke();
    };
    const thin = Math.max(1.5, plot * 0.012), thick = Math.max(2, plot * 0.024);
    g.lineCap = 'round';
    for (const c of front ? [L, near, R] : [far]) line(c, c, 0, low ? tall * 1.2 : tall, '#7a5a35', thin * 1.4);
    for (const [a, b] of sides) {
      if (low) { line(a, b, tall, tall, '#c49a62', thin); continue; }
      for (let up = floor * 0.9; up <= tall + 1; up += floor) {
        line(a, b, up, up, '#c49a62', thick);      // a walkway of planks
        line(a, b, up + floor * 0.28, up + floor * 0.28, '#7a5a35', thin);   // its rail
      }
      if (front) line(a, b, 0, floor * 0.9, '#7a5a35', thin);   // a brace
    }
  }

  // The roads: the shortest set of winding roads that joins every building and prop but
  // the fences (each joins the nearest one not yet joined). From a town on, lanterns stand beside
  // the roads, unless a building is there. Returns the lanterns, drawn with the
  // buildings so they stand in front of or behind them, and the roads, which trees avoid.
  function roads(g, placed, e) {
    const joins = placed.filter(p => p.b.kind !== 'fence');
    if (!e[3] || (joins.length < 2 && !urban(e))) return {lamps: [], edges: []};
    // Each road ends in front of the door (on the lower left), outside the footprint.
    const pts = joins.map(p => ({x: p.x - plot * 0.18, y: p.y + plot * 0.16, id: p.b.id}));
    const joined = [0], edges = urban(e) ? cityPlan().edges : [];
    while (!urban(e) && joined.length < pts.length) {
      let best = null;
      for (const i of joined) for (let j = 0; j < pts.length; j++) {
        if (joined.includes(j)) continue;
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (!best || d < best[2]) best = [i, j, d];
      }
      joined.push(best[1]);
      edges.push(route(curve(pts[best[0]], pts[best[1]], e[8]), placed));
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [color, extra] of [[e[5], plot * 0.035], [e[3], 0]]) {
      if (!color) continue;
      g.strokeStyle = color;
      for (const {line, width} of edges) {
        g.lineWidth = plot * (width || e[4]) + extra;
        g.beginPath(); g.moveTo(line[0].x, line[0].y); for (const q of line) g.lineTo(q.x, q.y);
        g.stroke();
      }
    }
    if (metro(e)) {                        // the white line down an avenue
      g.strokeStyle = 'rgba(240, 240, 230, 0.75)'; g.lineWidth = plot * 0.012; g.lineCap = 'butt';
      g.setLineDash([plot * 0.1, plot * 0.12]);
      for (const {line, width} of edges) {
        if (width < 0.2) continue;
        g.beginPath(); g.moveTo(line[0].x, line[0].y); for (const q of line) g.lineTo(q.x, q.y);
        g.stroke();
      }
      g.setLineDash([]);
    }
    if (urban(e)) {                        // a paved plaza where the avenues meet
      g.fillStyle = e[5];
      g.beginPath(); g.ellipse(PLAZA.x, PLAZA.y, 128, 76, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = metro(e) ? '#c9c5b8' : e[3];
      g.beginPath(); g.ellipse(PLAZA.x, PLAZA.y, 124, 73, 0, 0, Math.PI * 2); g.fill();
    }
    if (e[1] !== 'Town' && !urban(e)) return {lamps: [], edges};
    const lamps = [];
    for (const [n, r] of edges.entries()) {
      // A town's: two along each road, on either side in turn. A city's roads come in short
      // stretches: one on every stretch but the side streets' every other.
      const a = r.line[0], b = r.line[r.line.length - 1], side = plot * ((r.width || e[4]) / 2 + 0.08);
      if (Math.hypot(b.x - a.x, b.y - a.y) < plot * 0.6) continue;
      if (urban(e) && r.width < 0.2 && n % 2) continue;
      for (const [t, way] of urban(e) ? [[0.5, n % 2 ? 1 : -1]] : [[0.25, 1], [0.75, -1]]) {
        const m = along(r, t), d = Math.hypot(m.dx, m.dy) || 1;
        const x = m.x - m.dy / d * side * way, y = m.y + m.dx / d * side * way;
        if (lamps.some(q => Math.hypot(q.x - x, q.y - y) < plot * 0.5)) continue;
        if (placed.some(p => Math.abs(p.x - x) < plot * 0.45 && y > p.y - plot * 0.2 && y < p.y + plot * 0.5)) continue;
        lamps.push({x, y, b: {prop: true, kind: 'lantern'}});
      }
    }
    return {lamps, edges};
  }
  // The point at t (0 to 1) along a road, and its direction there.
  function along({line}, t) {
    const i = Math.round(t * (line.length - 1)), p = line[Math.max(0, i - 1)], n = line[Math.min(line.length - 1, i + 1)];
    return {x: line[i].x, y: line[i].y, dx: n.x - p.x, dy: n.y - p.y};
  }
  function roadPoints(edges) {
    return edges.flatMap(r => r.line);
  }
  // A city's street trees: beside its roads, a third of the way along each, where there is
  // room: clear of every road, building and lantern, and of each other.
  function streetTrees(edges, placed, lamps, e, w, h) {
    const road = roadPoints(edges), trees = [], side = plot * (e[4] / 2 + 0.17), most = Math.min(24, Math.ceil(edges.length * 0.4));
    for (const r of edges) for (const [t, way] of [[0.33, 1], [0.67, -1], [0.33, -1], [0.67, 1]]) {
      if (trees.length >= most) return trees;
      const p = along(r, t), d = Math.hypot(p.dx, p.dy) || 1;
      const x = p.x - p.dy / d * side * way, y = p.y + p.dx / d * side * way;
      const near = (list, gap) => list.some(q => Math.hypot(q.x - x, q.y - y) < gap);
      if (x < plot * 0.3 || x > w - plot * 0.3 || y < plot * 0.7 || y > h - 30) continue;
      if (near(road, plot * (e[4] / 2 + 0.12)) || near(lamps, plot * 0.25) || near(trees, plot * 0.9)) continue;
      if (riverGap(x, y) < riverWidth() / 2 + plot * 0.1) continue;
      if (placed.some(q => Math.abs(q.x - x) < plot * 0.5 && y > q.y - plot * 0.25 && y < q.y + plot * 0.8)) continue;
      trees.push({x, y, b: {prop: true, kind: 'tree-city', scale: 0.6}});
    }
    return trees;
  }
  // A road as a line of points that goes round every building and prop on its way: a point
  // inside a footprint moves out to its edge, then the line is smoothed, a few times over.
  function route({a, c1, c2, b}, placed) {
    const line = Array.from({length: 41}, (_, i) => {
      const t = i / 40, u = 1 - t;
      return {x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
              y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y};
    });
    const rx = plot * 0.36, ry = plot * 0.2, inner = line.slice(1, -1);
    const out = () => {
      for (const q of inner) for (const f of placed) {
        const dx = (q.x - f.x) / rx, dy = (q.y - f.y + plot * 0.03) / ry, k = Math.hypot(dx, dy);
        if (k > 0 && k < 1) { q.x = f.x + dx / k * rx; q.y = f.y - plot * 0.03 + dy / k * ry; }
      }
    };
    for (let n = 0; n < 6; n++) {
      out();
      for (let i = 1; i < line.length - 1; i++) {
        line[i].x = (line[i - 1].x + line[i].x * 2 + line[i + 1].x) / 4;
        line[i].y = (line[i - 1].y + line[i].y * 2 + line[i + 1].y) / 4;
      }
    }
    out();
    return {line};
  }
  // One road from a to b. Its bends come from the two ends' ids, so a road keeps its shape
  // from one draw to the next; some roads curve one way, some swing both ways (an S).
  function curve(a, b, bend) {
    const rnd = rng(hash([a.id, b.id].sort().join()));
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    const most = Math.min(d * bend * 2, plot * 0.55);    // a long road does not swing further out
    const k1 = (rnd() < 0.5 ? -1 : 1) * most * (0.6 + rnd() * 0.4);
    const k2 = (rnd() < 0.5 ? -1 : 1) * most * (0.6 + rnd() * 0.4);
    return {a, b, c1: {x: a.x + dx / 3 + nx * k1, y: a.y + dy / 3 + ny * k1},
            c2: {x: a.x + dx * 2 / 3 + nx * k2, y: a.y + dy * 2 / 3 + ny * k2}};
  }
  // A city's wall: stone along the sides and the bottom, battlements on top.
  function wall(g, w, h) {
    const t = 9;
    g.fillStyle = '#6e6a62';
    g.fillRect(0, 0, t, h); g.fillRect(w - t, 0, t, h); g.fillRect(0, h - t, w, t);
    g.fillStyle = '#57534c';
    for (let y = 4; y < h - t; y += 16) { g.fillRect(0, y, t + 3, 8); g.fillRect(w - t - 3, y, t + 3, 8); }
    for (let x = 4; x < w; x += 16) g.fillRect(x, h - t - 3, 8, t + 3);
  }
  // Top left: what the camp is now, and how far the next one is.
  let eraNow = null;
  function eraLabel(g, e) {
    const next = ERAS[ERAS.indexOf(e) - 1];
    const text = `${ICON[e[1]]} ${e[1]} · ${camp} messages` + (next ? ` · ${next[1]} at ${next[0]}` : '');
    g.font = "11px 'DejaVu Sans Mono', Consolas, monospace";
    g.textAlign = 'left';
    const tw = g.measureText(text).width;
    g.fillStyle = 'rgba(0, 0, 0, 0.5)';
    g.fillRect(14, 6, tw + 12, 18);
    g.fillStyle = '#ffffff';
    g.fillText(text, 20, 19);
    g.textAlign = 'center';
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

  // Day and night, by this computer's clock: a colour multiplied over the whole camp (a
  // canvas of its own, drawn once and again only as the hour moves on or the view changes,
  // so the people's 5 Hz redraw does not pay for it), pale around the lights. Nothing at all
  // in full daylight. The names are above it, as bright as by day, to be read.
  const SKY = [[0, [84, 96, 150]], [5, [84, 96, 150]], [6.5, [255, 200, 165]], [8, [255, 255, 255]], [16.5, [255, 255, 255]],
               [18, [255, 170, 120]], [19.5, [84, 96, 150]], [24, [84, 96, 150]]];
  let lampCount = 0;
  let litList = [], litMap = null, litOn = false, litAlpha = 0;
  let lights = [], skySig = '', hourForTest = null, nightOn = false, nightColor = '', nightMap = null;
  function hourNow() {
    const d = new Date();
    return hourForTest !== null ? hourForTest : d.getHours() + d.getMinutes() / 60;
  }
  function skyColor(hour) {
    const n = SKY.findIndex(([h]) => h > hour), [h0, a] = SKY[n - 1], [h1, b] = SKY[n], t = (hour - h0) / (h1 - h0);
    return a.map((v, i) => Math.round(v + (b[i] - v) * t));
  }
  function sky() {
    const c = skyColor(hourNow()), sig = c.join();
    if (sig === skySig) return;
    skySig = sig;
    nightOn = sig !== '255,255,255';
    if (nightOn) {
      nightColor = `rgb(${c})`;
      nightMap = nightMap || document.createElement('canvas');
      nightMap.width = MAP_W; nightMap.height = MAP_H;
      const g = nightMap.getContext('2d'), dark = 1 - Math.min(...c) / 255;
      g.fillStyle = nightColor;
      g.fillRect(0, 0, MAP_W, MAP_H);
      // The lights come on as it gets dark.
      for (const {x, y, r} of lights) {
        const glow = g.createRadialGradient(x, y, 0, x, y, r);
        glow.addColorStop(0, `rgba(255, 228, 180, ${Math.min(0.85, dark * 1.3)})`);
        glow.addColorStop(0.4, `rgba(255, 222, 170, ${Math.min(0.5, dark * 0.75)})`);
        glow.addColorStop(0.75, `rgba(255, 215, 160, ${Math.min(0.14, dark * 0.2)})`);
        glow.addColorStop(1, 'rgba(255, 210, 150, 0)');
        g.fillStyle = glow;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    // A metropolis's windows, warm, on a canvas of their own over the multiply: each building
    // first wipes out what it stands in front of. Only while it is dark at all.
    litOn = false;
    if (nightOn && litList.length) {
      const dark = 1 - Math.min(...c) / 255;
      litAlpha = Math.min(0.8, dark * 1.2);
      litMap = litMap || document.createElement('canvas');
      litMap.width = MAP_W; litMap.height = MAP_H;
      const g = litMap.getContext('2d');
      for (const [kind, x, y, s] of litList) {
        if (img[kind]) { g.globalCompositeOperation = 'destination-out'; g.drawImage(img[kind], x - s / 2, y - s * ANCHOR, s, s); }
        g.globalCompositeOperation = 'source-over';
        if (img[kind + '-lit']) g.drawImage(img[kind + '-lit'], x - s / 2, y - s * ANCHOR, s, s);
      }
      litOn = true;
    }
    drawNight();
  }
  function drawNight() {
    const cv = $('relax-night'), lit = $('relax-lit');
    lit.style.display = 'none';
    if (!nightOn || !nightMap || viewW <= 0) { cv.style.display = 'none'; return; }
    if (cv.width !== viewW || cv.height !== viewH) {
      cv.width = viewW; cv.height = viewH;
      cv.style.width = viewW + 'px'; cv.style.height = viewH + 'px';
    }
    cv.style.display = 'block';
    const g = cv.getContext('2d');
    g.fillStyle = nightColor;
    g.fillRect(0, 0, viewW, viewH);
    g.drawImage(nightMap, -ox * zoom, -oy * zoom, MAP_W * zoom, MAP_H * zoom);
    if (!litOn) return;
    if (lit.width !== viewW || lit.height !== viewH) {
      lit.width = viewW; lit.height = viewH;
      lit.style.width = viewW + 'px'; lit.style.height = viewH + 'px';
    }
    lit.style.display = 'block';
    const w = lit.getContext('2d');
    w.clearRect(0, 0, viewW, viewH);
    w.globalAlpha = litAlpha;
    w.drawImage(litMap, -ox * zoom, -oy * zoom, MAP_W * zoom, MAP_H * zoom);
  }

  // One step for everyone. Only the squares that changed are drawn again, from the
  // background, then the flames and people on top.
  function tick() {
    if (!view || viewDirty) return;        // the picture is about to change: the next compose draws them
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
    const k = dpr * zoom;
    for (const [x, y, w, h] of dirty) {
      const sx = Math.max(0, Math.floor((x - ox) * k) - 1), sy = Math.max(0, Math.floor((y - oy) * k) - 1);
      const sw = Math.min(view.width - sx, Math.ceil(w * k) + 3), sh = Math.min(view.height - sy, Math.ceil(h * k) + 3);
      if (sw > 0 && sh > 0) g.drawImage(view, sx, sy, sw, sh, sx, sy, sw, sh);
    }
    worldOn(g);
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
    const r = $('relax-canvas').getBoundingClientRect();
    const x = (e.clientX - r.left) / zoom + ox, y = (e.clientY - r.top) / zoom + oy;
    const s = spots.find(s => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
    return s ? s.b : null;
  }
  function say(text) {
    $('relax-msg').textContent = text;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { $('relax-msg').textContent = ''; }, 4000);
  }

  // Redraws when the buildings, their status or the size changed; otherwise nothing.
  function update(force, turns) {
    if (turns !== undefined) camp = turns;
    if (!on || document.hidden) return;
    sky();
    const list = buildings();
    const now = JSON.stringify([camp, list.map(b => [b.id, b.name, b.tool, b.status, b.level, b.people])]);
    if (now === sig && !force) { if (measure()) compose(); return; }
    sig = now;
    draw(list);
  }

  // --- above the camp: the open tasks on a board, and each tool's limits as stamina

  let boardTasks = [], boardDone = [], boardHistory = false, staminaSig = '';
  const boardHead = () => `<div class="h"><span>📋 Tasks${boardHistory ? ' · history' : ''}</span>` +
    `<span class="hist" data-hist="1">${boardHistory ? 'Open tasks' : 'History'}</span></div>`;
  // The finished and discarded tasks, latest first; a click on its status restores one.
  async function loadDone() {
    const done = await api().task_history();
    if (!boardHistory) return;
    boardDone = done;
    $('board').innerHTML = boardHead() + (done.length ? done.map((t, i) => {
      const results = t.results.map(r => [r.subitem, r.result].filter(Boolean).join(' → ')).filter(Boolean).join('\n');
      return `<div class="board-row"><span class="what" title="${esc(results || t.text)}">${t.discarded ? '✗' : '✓'} ${esc(t.text.charAt(0).toUpperCase() + t.text.slice(1))}</span>` +
        `<span class="when">${esc(t.done || '?')}</span>` +
        `<span class="st" data-r="${i}" title="restore it as Pending" style="color:#4a3019">${t.discarded ? 'Discarded' : 'Finished'}</span></div>`;
    }).join('') : '<div class="more">No finished or discarded tasks</div>');
  }
  async function loadTasks() {
    if (boardHistory) return loadDone();
    const {tasks, remaining} = await api().task_list();
    if (boardHistory) return;
    boardTasks = tasks;
    const shown = tasks.slice(0, BOARD_MAX), more = tasks.length - shown.length + (remaining || 0);
    $('board').innerHTML = boardHead() + (shown.length ? shown.map((t, i) =>
      `<div class="board-row"><span class="what" title="${esc(t.text)}">${esc(t.text.charAt(0).toUpperCase() + t.text.slice(1))}</span>` +
      `<span class="due" data-d="${i}" title="change the date">${esc(t.due || 'no due')}</span>` +
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
    // The wheel zooms around the pointer; dragging moves the map.
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const wx = mx / zoom + ox, wy = my / zoom + oy, steps = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      zoom = Math.max(fitZoom(), Math.min(ZOOM_MAX, zoom * Math.exp(-steps * 0.0015)));
      ox = wx - mx / zoom; oy = wy - my / zoom;
      viewChanged();
    }, {passive: false});
    let drag = null;
    cv.addEventListener('mousedown', e => { if (e.button === 0) drag = {x: e.clientX, y: e.clientY, ox, oy}; });
    window.addEventListener('mousemove', e => {
      if (!drag) return;
      ox = drag.ox - (e.clientX - drag.x) / zoom; oy = drag.oy - (e.clientY - drag.y) / zoom;
      viewChanged();
    });
    window.addEventListener('mouseup', () => { drag = null; });
    cv.addEventListener('mousemove', e => {
      if (drag) return;
      const b = at(e);
      if (b === hover) return;
      hover = b;
      cv.style.cursor = b ? 'pointer' : 'grab';
      cv.title = !b ? '' : b.kind === 'meeting' ? `⚖ ${b.name} · ${b.status === 'busy' ? 'under way' : 'done'} (double-click to open)`
        : b.status === 'ended' ? `${b.name} · ended (double-click to start)`
        : `${b.name} · ${b.status} · ${b.tool === 'agy' ? (b.row.up || '') + ' open' : (b.row.turns || 0) + ' messages'}`;
    });
    // A task's status and date on the board open the same menu and calendar as in the Tasks
    // column; History swaps the list, and a finished one's status restores it.
    $('board').addEventListener('click', e => {
      const {i, d, r, hist} = e.target.dataset;
      if (hist) {
        boardHistory = !boardHistory;
        $('board').scrollTop = 0;
        loadTasks();
      } else if (i !== undefined) {
        taskEdit = boardTasks[+i];
        showAt($('status-menu'), e.clientX, e.clientY);
      } else if (d !== undefined) {
        taskEdit = boardTasks[+d];
        openCalendar(taskEdit.due, e.clientX, e.clientY);
      } else if (r !== undefined) {
        taskEdit = boardDone[+r];
        showAt($('restore-menu'), e.clientX, e.clientY);
      } else {
        return;
      }
      e.stopPropagation();
    });
    new ResizeObserver(() => update()).observe($('relax'));
    document.addEventListener('visibilitychange', () => { update(); clock(); });
    set(saved() === 'relax' ? 'relax' : 'office');
  }

  return {wire, set, update, stamina, loadTasks, get on() { return on; },
          _people: () => people, _fires: () => fires.length, _era: () => era(camp)[1],   // for tests
          _hour: h => { hourForTest = h; skySig = ''; sky(); },
          _layout: () => ({lamps: lampCount, zoom, fit: fitZoom(), ox, oy, things: layoutMemo.map(p => ({id: p.b.id, prop: !!p.b.prop, house: !!p.b.house, kind: p.b.kind, x: p.x, y: p.y, r: p.r})), roads: cityMemo ? cityMemo.edges.map(r => r.line) : [], bridge: cityMemo ? cityMemo.bridge : []})};
})();
