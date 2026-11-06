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
  const PICS_METRO = ['metro-a', 'metro-b', 'metro-c', 'metro-d', 'metro-e', 'metro-f', 'metro-g', 'metro-h', 'metro-tower-a', 'metro-tower-b', 'metro-tower-c', 'metro-tower-d', 'metro-tower-e', 'metro-mall', 'metro-cafe', 'metro-park', 'metro-lot', 'metro-level0', 'metro-level1', 'metro-level2', 'metro-level3', 'metro-level4', 'metro-ruin'];
  const PICS_BASE = ['level0', 'level1', 'level2', 'level3', 'level4', 'ruin', 'meeting', 'tree', 'tree-autumn', 'rock', 'people', 'animals',
                'fence', 'signpost', 'lantern', 'lamp', 'lamp-double', 'stall', 'stall-green', 'fountain', 'tree-city',
                'house-a', 'house-b', 'house-c', 'house-d', 'house-e', 'house-f', 'house-g', 'house-h',
                'house-i', 'house-j', 'house-k', 'house-l', 'house-m', 'house-n',
                'shop', 'tavern', 'smithy', 'sawmill', 'warehouse', 'farm', 'windmill', 'watermill', 'church', 'townhall'];
  // Pictures only one era uses are loaded when it comes, and never before.
  const LIT_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'tower-a', 'tower-b', 'tower-c', 'tower-d', 'tower-e', 'mall', 'cafe', 'level1', 'level2', 'level3', 'level4'].map(k => `metro-${k}-lit`);
  const PACKS = {
    Metropolis: [...PICS_METRO, 'metro-meeting', ...LIT_NAMES],
    City: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'shop', 'tavern', 'smithy', 'warehouse', 'sawmill', 'church', 'townhall', 'farm', 'windmill', 'watermill', 'level2', 'level3', 'level4'].map(k => `med-${k}`)};
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
               'med-a': 0.545, 'med-b': 0.453, 'med-c': 0.531, 'med-church': 0.256, 'med-d': 0.545, 'med-e': 0.439, 'med-f': 0.545, 'med-farm': 0.576, 'med-g': 0.533, 'med-h': 0.637, 'med-level2': 0.637, 'med-level3': 0.545, 'med-level4': 0.395, 'med-sawmill': 0.637, 'med-shop': 0.545, 'med-smithy': 0.629, 'med-tavern': 0.531, 'med-townhall': 0.4, 'med-warehouse': 0.533, 'med-watermill': 0.545, 'med-windmill': 0.395,
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
    [10000, 'Megacity', '#587a50', '#54575c', 0.17, '#a3a29a', 0.2, ['fountain'], 0.1],
    [5000, 'Metropolis', '#587a50', '#54575c', 0.17, '#a3a29a', 0.2, ['fountain'], 0.1],
    [1000, 'City', '#4f7d44', '#8f8b80', 0.17, '#5f5c57', 0.1, ['fountain', 'stall', 'stall-green', 'stall'], 0.1],
    [500, 'Town', '#4f7d44', '#a8a497', 0.13, '#7d796e', 0.5, ['fountain', 'stall', 'stall-green'], 0.16],
    [100, 'Village', '#4b7a46', '#8a6d45', 0.1, null, 0.8, ['signpost'], 0.24],
    [0, 'Tribe', '#4b7a46', null, 0, null, 1, [], 0]];
  const ICON = {Tribe: '🏕', Village: '🏘', Town: '🏰', City: '🏯', Metropolis: '🏙', Megacity: '🌃'};
  const metro = e => e[1] === 'Metropolis' || e[1] === 'Megacity';
  const urban = e => e[1] === 'City' || metro(e);
  // A session's house or tower is, from a village on, one of the camp's trades instead, fixed
  // per session: its first pick (0) keeps the plain house or tower.
  const TRADES = {
    level3: {base: ['shop', 'smithy', 'tavern', 'sawmill', 'warehouse'], City: ['med-shop', 'med-smithy', 'med-tavern', 'med-sawmill', 'med-warehouse'], metro: ['metro-cafe', 'metro-mall', 'metro-c']},
    level4: {base: ['church', 'townhall', 'windmill'], City: ['med-church', 'med-townhall', 'med-windmill'], metro: ['metro-tower-a', 'metro-tower-c', 'metro-tower-d']}};
  // A session's yard: one or two smaller buildings behind its own, by what it is, so it reads
  // as a compound. Names are base pictures; a city takes its medieval one where there is one.
  const YARD = {level2: ['farm'], level3: ['farm', 'house-a'], level4: ['house-b', 'house-d'],
    shop: ['stall', 'stall-green'], smithy: ['warehouse', 'rock'], tavern: ['stall', 'house-c'], sawmill: ['warehouse', 'farm'],
    warehouse: ['farm', 'stall'], church: ['house-a', 'tree'], townhall: ['fountain', 'house-d'], windmill: ['farm', 'warehouse']};
  const YARD_METRO = {'metro-level2': ['metro-park'], 'metro-level3': ['metro-lot', 'metro-park'], 'metro-level4': ['metro-park', 'metro-h'],
    'metro-cafe': ['metro-park'], 'metro-mall': ['metro-lot', 'metro-g'], 'metro-c': ['metro-lot'],
    'metro-tower-a': ['metro-park', 'metro-a'], 'metro-tower-c': ['metro-lot', 'metro-h'], 'metro-tower-d': ['metro-park', 'metro-g']};
  const YARD_SIZE = {tree: 0.75, rock: 0.6, fountain: 0.6, stall: 0.7, 'stall-green': 0.7, 'metro-park': 0.6, 'metro-lot': 0.6};
  function yard(e, pic, id) {
    const key = pic.replace(/^med-/, ''), list = metro(e) ? YARD_METRO[pic] : YARD[key];
    if (!list || e[1] === 'Tribe') return [];
    const h = hashOf(id + 'yard'), n = list.length > 1 && h % 3 ? 2 : 1;
    const city = k => { const m = e[1] === 'City' && ('med-' + k.replace(/^house-([a-h])$/, '$1')); return m && img[m] ? m : k; };
    return (h & 4 ? [...list].reverse() : list).slice(0, n).map(city);
  }
  const hashOf = id => [...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const shown = (e, level, id) => {     // a session's picture
    const plain = metro(e) && /^(level|ruin|meeting)/.test(level) ? 'metro-' + level
      : e[1] === 'City' && /^level[234]/.test(level) ? 'med-' + level : level;
    const t = TRADES[level];
    if (!t || id == null || e[1] === 'Tribe') return plain;
    const list = metro(e) ? t.metro : t[e[1]] || t.base, k = hashOf(id) % (list.length + 1);
    return k ? list[k - 1] : plain;
  };
  const scaleOf = kind => (/^(metro|med)-/.test(kind || '') ? 2 : 1);     // these pictures show twice the world
  const BOARD_MAX = 8;                     // tasks on the board; the rest are counted
  const TASK_COLORS = {Ongoing: '#0b5a7a', Checking: '#8a5a00', Pending: '#3a2a1a'};
  const MAP_W = 1800, MAP_H = 1350, ZOOM_MAX = 1.6;   // the map, in world units; a building's plot is 150
  const img = {};
  let on = false, sig = '', spots = [], hover = null, msgTimer = 0;
  const plot = 150;
  // The camera looks down at a slant: the far side of the map (its top) is drawn smaller than
  // the near side. The world is drawn flat on a canvas a margin bigger than the map (PAD each
  // side, PADY above, so the narrowed far side still fills the width), then warped row by row
  // onto the map's own canvas. Everything drawn over it later (people, names, night) goes
  // through warp() the same way; clicks are tested in the warped picture's own terms.
  // The far side is narrowed more than it is shortened (FAR_SCALE across, FAR_V up and down),
  // so the lines that run away from the camera close in strongly without the map losing much
  // of its height to the sky. A thing standing on the ground is sized by the narrowing.
  const PAD = 760, PADY = 260, FAR_SCALE = 0.55, FAR_V = 0.75, HORIZON = plot * 0.9;
  const farness = y => Math.min(1, Math.max(0, (y - HORIZON) / (MAP_H - HORIZON)));
  const depth = y => FAR_SCALE + (1 - FAR_SCALE) * farness(y);
  const Y_H = MAP_H - (MAP_H - HORIZON) * (1 + FAR_V) / 2;     // where the horizon lands
  function warpY(y) {
    if (y < HORIZON) return Y_H - FAR_V * (HORIZON - y);
    const d = Math.min(y, MAP_H) - HORIZON;
    return Y_H + FAR_V * d + (1 - FAR_V) * d * d / (2 * (MAP_H - HORIZON)) + Math.max(0, y - MAP_H);
  }
  const warp = (x, y) => [MAP_W / 2 + (x - MAP_W / 2) * depth(y), warpY(y)];
  // A flat world canvas (at `sr` pixels a unit, the margin included) onto a map-sized one, in
  // strips two units high, each rounded to whole pixels so none overlap (night is see-through).
  function warpCanvas(src, sr, dst, dr) {
    dst.width = Math.round(MAP_W * dr); dst.height = Math.round(MAP_H * dr);
    const g = dst.getContext('2d');
    g.imageSmoothingQuality = 'high';
    for (let y = -PADY; y < MAP_H; y += 2) {
      const y1 = Math.round(warpY(y) * dr), y2 = Math.round(warpY(y + 2) * dr);
      if (y2 <= 0 || y2 === y1) continue;
      const m = depth(y + 1), left = MAP_W / 2 + (-PAD - MAP_W / 2) * m;
      g.drawImage(src, 0, (y + PADY) * sr, src.width, 2 * sr, left * dr, y1, (MAP_W + 2 * PAD) * m * dr, y2 - y1);
    }
  }
  // Something upright standing at (x, y) on the ground: drawn as if flat at (x, y), but moved
  // to where the warp puts that point and sized for its distance.
  function onGround(g, x, y, fn) {
    const [X, Y] = warp(x, y), m = depth(y);
    g.save(); g.translate(X, Y); g.scale(m, m); g.translate(-x, -y); fn(); g.restore();
  }
  // A box [x, y, w, h] round something standing at the bottom middle, in the warped picture.
  function warpBox([x, y, w, h]) {
    const [X, Y] = warp(x + w / 2, y + h), m = depth(y + h);
    return [Math.floor(X - w * m / 2) - 1, Math.floor(Y - h * m) - 1, Math.ceil(w * m) + 2, Math.ceil(h * m) + 2];
  }
  let bg = null, flat = null, view = null, res = 1, dpr = 1, timer = 0, camp = 0;
  let zoom = 0, ox = 0, oy = 0, viewW = 0, viewH = 0, viewDirty = false, tags = [];
  const people = new Map();                // session id (a participant: discussion id#i) -> its person
  let fires = [];                          // the discussions under way: {x, y} of their fire

  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(mode) { try { localStorage.setItem(KEY, mode); } catch (e) {} }

  // The pictures load once, the first time Relax mode is shown.
  let loading = null;
  const fetchAll = names => Promise.all(names.map(n => new Promise(ok => {
    const im = new Image();
    im.onload = () => { img[n] = im; ok(); };
    im.onerror = ok;
    im.src = 'relax/' + n + '.png';
  })));
  function load() { return (loading = loading || fetchAll(PICS_BASE)); }
  const packs = {};

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
  // A session's building is drawn bigger than the kits make it, everyone else's smaller, so
  // that the sessions stand out. Its room is the tallest it can grow to, in any era.
  const SESSION_SIZE = 1.2, DECOR_SIZE = 0.8;
  function room(x, y, prop, high = 2) {
    const p = plot;
    if (prop) return {base: [x - p * 0.45, y - p * 0.55, x + p * 0.45, y + p * 0.22]};
    return {base: [x - p * 0.57, y - p * 0.39, x + p * 0.57, y + p * 0.2 + 38],
            body: [x - p * 0.36, y - p * high, x + p * 0.36, y - p * 0.39]};
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
  // Which way a building on a spot faces. The pictures have their door on the lower left; one
  // drawn mirrored has it on the lower right. A building faces the road it stands by: nx is the
  // way from the road to the spot along x. Square to the road, or with none, either way.
  const facing = (nx, x, y) => (nx < -0.2 ? true : nx > 0.2 ? false : hash(`${Math.round(x)},${Math.round(y)}`) % 2 === 1);
  // Where a building can stand: along both sides of every road. The lots nearest the plaza
  // are taken first and packed closest, so the middle is the densest. No tower may hide a bridge.
  function streetLots({all, pts}) {
    const rx = plot * 0.36, ry = plot * 0.2, free = [], lots = [];
    const bridge = pts.filter(p => riverGap(p.x, p.y) < riverWidth() / 2 + plot * 0.05);
    const clear = (x, y) => !pts.some(p => Math.hypot((p.x - x) / (rx + p.half), (p.y - y) / (ry + p.half)) < 1) && !wet(x, y);
    // Round the plaza first.
    for (let a = 0; a < 32; a++) {
      const x = PLAZA.x + Math.cos(a / 32 * Math.PI * 2) * 188, y = PLAZA.y + Math.sin(a / 32 * Math.PI * 2) * 112;
      if (clear(x, y)) free.push({x, y, far: 0, flip: PLAZA.x > x});
    }
    for (const r of all) for (const side of [-1, 1]) for (let i = 2; i < r.line.length - 2; i++) {
      const a = r.line[i - 1], c = r.line[i + 1], d = Math.hypot(c.x - a.x, c.y - a.y) || 1;
      const nx = -(c.y - a.y) / d * side, ny = (c.x - a.x) / d * side;
      const off = plot * r.width / 2 + 6 + Math.hypot(rx * nx, ry * ny);
      const x = r.line[i].x + nx * off, y = r.line[i].y + ny * off;
      if (x < LEFT || x > RIGHT || y < LOW || y > HIGH || !clear(x, y)) continue;
      if (Math.hypot((x - PLAZA.x) / 170, (y - PLAZA.y) / 100) < 1) continue;
      if (bridge.some(p => Math.abs(p.x - x) < plot * 0.5 && p.y > y - plot * 1.3 && p.y < y)) continue;
      free.push({x, y, far: groundGap({x, y}, PLAZA) / 1100, flip: facing(nx, x, y)});
    }
    free.sort((a, c) => a.far - c.far);
    for (const l of free) {
      if (lots.some(q => groundGap(q, l) < 96 + 50 * l.far)) continue;
      l.n = lots.length;
      lots.push(l);
    }
    return lots;
  }
  // The camp's buildings that are nobody's: one for each 100 messages up to 1000, then one for
  // each 500. Each has a place of its own for good, and a picture for each era from the village
  // on. [how near the plaza, how far from it (0 to 1; further out above that), by the river,
  //  its pictures: village, town, city, metropolis, megacity]
  const DECOR = [
    [0, 2, 0, ['house-a', 'house-d', 'med-h', 'metro-a', 'metro-tower-d']],
    [0.6, 2, 0, ['farm', 'farm', 'med-farm', 'metro-park', 'metro-park']],
    [0, 2, 0, ['house-i', 'shop', 'med-shop', 'metro-cafe', 'metro-g']],
    [0, 2, 0, ['house-k', 'tavern', 'med-tavern', 'metro-mall', 'metro-tower-a']],
    [0.6, 2, 0, ['windmill', 'windmill', 'med-windmill', 'metro-lot', 'metro-lot']],
    [0, 2, 0, ['house-a', 'smithy', 'med-smithy', 'metro-c', 'metro-f']],
    [0, 2, 0, ['house-d', 'warehouse', 'med-warehouse', 'metro-f', 'metro-h']],
    [0, 2, 0, ['house-g', 'house-f', 'med-b', 'metro-d', 'metro-tower-b']],
    [0, 0.8, 0, ['house-i', 'church', 'med-church', 'metro-tower-e', 'metro-tower-e']],
    [0, 0.6, 0, ['house-j', 'townhall', 'med-townhall', 'metro-tower-c', 'metro-tower-c']],
    [0, 2, 1, ['watermill', 'watermill', 'med-watermill', 'metro-h', 'metro-g']],
    [0, 2, 0, ['house-h', 'house-e', 'med-e', 'metro-g', 'metro-tower-b']],
    [0.6, 2, 0, ['farm', 'farm', 'med-farm', 'metro-park', 'metro-lot']],
    [0, 2, 0, ['house-b', 'house-l', 'med-c', 'metro-e', 'metro-tower-a']]];
  const BIG = new Set(['med-farm', 'med-windmill', 'med-sawmill', 'med-warehouse', 'med-tavern', 'med-townhall', 'med-church', 'med-c', 'med-e', 'med-g',
                       'metro-mall', 'metro-park', 'metro-lot', 'metro-f', 'metro-g', 'metro-h', 'farm', 'house-f', 'house-l']);
  const BORN = ERAS.map(([n]) => n).reverse();         // where each era starts: 0, 100, 500, ...
  const eraIndex = turns => BORN.filter(n => turns >= n).length - 1;
  function decorCount(turns) { return turns < 1000 ? Math.floor(turns / 100) : 10 + Math.floor((turns - 1000) / 500); }
  function decorBorn(k) { return k < 9 ? (k + 1) * 100 : 1000 + (k - 9) * 500; }
  // Which era's picture each building shows. At every new era half of those already standing,
  // picked by a fixed shuffle, go up one style and the rest stay as they are; one built since
  // has the style of its time. So a city keeps some old houses, and a metropolis more.
  function decorStyles(turns) {
    const n = decorCount(turns), now = eraIndex(turns), style = Array(n).fill(1);
    for (let i = 1; i <= now; i++) {
      const old = [];
      for (let k = 0; k < n; k++) {
        const born = decorBorn(k);
        if (born < BORN[i]) old.push(k);
        else if (i === BORN.length - 1 || born < BORN[i + 1]) style[k] = i;
      }
      old.sort((a, c) => hash(`${a}@${i}`) - hash(`${c}@${i}`));
      for (const k of old.slice(0, Math.floor(old.length / 2))) style[k] = Math.min(style[k] + 1, i);
    }
    return style;
  }
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
      list.push({x, y, far: groundGap({x, y}, PLAZA) / 1100, flip: facing(nx, x, y)});
    }
    return list.sort((p, q) => p.far - q.far).map((l, n) => ({...l, n: `w${n}`}));
  }
  // Any ground clear of roads and the river, for when so many sessions are open that the spots
  // along the roads have run out.
  function openGround({pts}) {
    const rx = plot * 0.5, ry = plot * 0.3, list = [];
    for (let y = LOW; y <= HIGH; y += 36) for (let x = LEFT; x <= RIGHT; x += 44) {
      if (wet(x, y) || Math.hypot((x - PLAZA.x) / 190, (y - PLAZA.y) / 115) < 1) continue;
      if (pts.some(p => Math.hypot((p.x - x) / (rx + p.half), (p.y - y) / (ry + p.half)) < 1)) continue;
      list.push({x, y, far: groundGap({x, y}, PLAZA) / 1100, n: `o${list.length}`, flip: facing(0, x, y)});
    }
    return list.sort((p, q) => p.far - q.far);
  }
  let cityMemo = null;
  function cityPlan() {
    if (cityMemo) return cityMemo;
    const grown = growStreets(), edges = [];
    // In stretches, for the lanterns and trees beside them.
    for (const r of grown.all)
      for (let i = 0; i < r.line.length - 1; i += 15)
        edges.push({line: r.line.slice(i, i + 16), width: r.width});
    return (cityMemo = {edges, lots: streetLots(grown), wide: wideSpots(grown), open: openGround(grown), bridge: grown.pts.filter(p => riverGap(p.x, p.y) < riverWidth() / 2 + plot * 0.05)});
  }
  // Everyone's place, the same in every era, so that the camp grows round what is there and
  // only what stands there changes. The fountain is on the plaza; each session takes the first
  // free wide spot, nearest the plaza give or take a little (from the id); then the era's props;
  // then the buildings, each with room for the tallest it may become.
  function arrange(list, props, turns) {
    const {lots, wide, open} = cityPlan(), placed = [], used = new Set(), houses = [];
    for (const b of props.filter(q => q.kind === 'fountain')) placed.push({...PLAZA, r: {base: [PLAZA.x - plot * 0.45, PLAZA.y - plot * 0.25, PLAZA.x + plot * 0.45, PLAZA.y + plot * 0.16]}, b});
    for (const b of sorted(list)) {
      const rnd = rng(hash(b.id));
      const order = wide.map(l => [l.far + rnd() * 0.25, l]).sort((a, c) => a[0] - c[0]);
      // Room for a skyscraper if there is any; with many sessions, for less: a later tower
      // may then stand in front of a neighbour, which is better than on top of it.
      let found = null, high = 2;
      for (const h of [2, 1.4, 0.7]) {
        // A skyscraper's room must also be on the map.
        found = order.find(([, l]) => !used.has(l) && l.y - plot * h >= 0 && !placed.some(q => clash(room(l.x, l.y, false, h), q.r)));
        if (found) { high = h; break; }
      }
      // Then any open ground; at the last, ground where only another's tower is in front of it.
      const free = found ? null : open.find(l => !used.has(l) && !placed.some(q => clash(room(l.x, l.y, false, 0.7), q.r)))
        || open.find(l => !used.has(l) && !placed.some(q => hits(room(l.x, l.y).base, q.r.base)));
      if (free) high = 0.7;
      const l = free || (found || order[0])[1];
      used.add(l);
      placed.push({x: l.x, y: l.y, r: room(l.x, l.y, false, high), b, flip: !!l.flip && b.kind !== 'meeting'});
    }
    for (const b of props.filter(q => q.kind !== 'fountain')) {
      const rnd = rng(hash(b.id));
      const order = lots.map(l => [l.far + rnd() * 0.25, l]).sort((a, c) => a[0] - c[0]);
      const found = order.find(([, l]) => !used.has(l) && !placed.some(q => clash(room(l.x, l.y, true), q.r)));
      if (!found) continue;
      used.add(found[1]);
      placed.push({x: found[1].x, y: found[1].y, r: room(found[1].x, found[1].y, true), b, flip: !!found[1].flip});
    }
    const named = [...placed], styles = decorStyles(turns);
    styles.forEach((style, k) => {
      const [near, far, bank, pics] = DECOR[k % DECOR.length];
      const big = pics.some(p => BIG.has(p)), half = plot * (big ? 0.46 : 0.36) * DECOR_SIZE;
      const tall = Math.max(...pics.map(p => (ANCHOR - TOP[p]) * plot * 1.5 * scaleOf(p))) * DECOR_SIZE;
      const fits = l => {
        if (used.has(l) || wet(l.x, l.y) || l.y - tall < 8) return null;   // nor above the map
        const r = {base: [l.x - half, l.y - plot * 0.2, l.x + half, l.y + plot * 0.14],
                   body: [l.x - plot * 0.25, l.y - tall, l.x + plot * 0.25, l.y - plot * 0.2]};
        return named.some(q => clash(r, q.r)) || houses.some(h => hits(r.base, h)) ? null : r;
      };
      const spots = big ? wide : lots;
      const wanted = l => l.far >= near && l.far <= far && (!bank || riverGap(l.x + plot * 0.6, l.y) < plot * 0.35);
      const l = spots.find(q => wanted(q) && fits(q)) || spots.find(fits);
      if (!l) return;
      const r = fits(l);
      used.add(l);
      houses.push(r.base);
      placed.push({x: l.x, y: l.y, r, flip: !!l.flip, b: {id: `~d${k}`, prop: true, house: true, kind: pics[style - 1]}});
    });
    return placed;
  }
  // Everyone's place, worked out again only when who is there or the era changes.
  let layoutKey = '', layoutMemo = [];
  function layout(list, e) {
    const props = e[7].map((kind, i) => ({id: '~' + kind + i, kind, prop: true}));
    const key = JSON.stringify([list.map(b => b.id), e[1], decorCount(camp), amc.order]);
    if (key !== layoutKey) {
      layoutKey = key;
      layoutMemo = arrange(list, props, camp);
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
  // A line on the ground, seen at the camera's tilt: the path is laid where it is, but the pen
  // is squashed like the ground (a path keeps the transform it was laid with; the pen takes
  // the one at stroke()), so a road across the screen is thinner than one up it.
  function groundPath(g, line) {
    g.beginPath();
    line.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
  }
  function groundStroke(g) { g.save(); g.scale(1, KY); g.stroke(); g.restore(); }
  function strokeLine(g, line, color, width, cap = 'round') {
    g.strokeStyle = color; g.lineWidth = width; g.lineCap = cap; g.lineJoin = 'round';
    groundPath(g, line);
    groundStroke(g);
  }
  // A mountain range as one ridge line, lit from the left like the kits' pictures. The line is
  // smooth noise in three sizes, so no two stretches look alike. From every top a spur runs
  // down to the right: the face left of it is lit, the face right of it, down to the next
  // valley, is in shade. Snow lies above the snow line, its lower edge ragged.
  // `tone`: [lit, lit low, shade, shade low, snow lit, snow shade]. `high(x)` is how high
  // the range's peaks are about x.
  function ridge(g, w, base, high, tone, rnd, snowAt) {
    const bottom = plot * 0.9;   // filled down to the ground, so no sky shows under a range
    const octave = size => { const v = Array.from({length: Math.ceil(w / size) + 3}, rnd), o = rnd();
      return x => { const t = x / size + o, i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f); return v[i + 1] * (1 - s) + v[i + 2] * s; }; };
    // Wider than they look: the far side is narrowed to FAR_SCALE across but only FAR_V up.
    const wide = FAR_V / FAR_SCALE, big = octave(plot * 1.7 * wide), mid = octave(plot * 0.74 * wide), small = octave(plot * 0.29 * wide);
    const pts = [];
    for (let x = -plot * 0.2; x < w + plot * 0.2; x += plot * 0.07) {
      const n = big(x) * 0.55 + mid(x) * 0.3 + small(x) * 0.15;
      pts.push([x, base - high(x) * (0.35 + 0.75 * n)]);
    }
    const shape = () => { g.beginPath(); g.moveTo(pts[0][0], bottom); pts.forEach(p => g.lineTo(...p)); g.lineTo(pts[pts.length - 1][0], bottom); g.closePath(); };
    const fill = (a, b) => { const gr = g.createLinearGradient(0, base - plot * 1.4, 0, base); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; };
    // The shaded faces: from each top, along the ridge to the next valley, back along the spur.
    const shades = [];
    for (let i = 1; i < pts.length - 1; i++) {
      if (!(pts[i][1] < pts[i - 1][1] && pts[i][1] <= pts[i + 1][1])) continue;
      let j = i + 1;
      while (j < pts.length - 1 && pts[j + 1][1] >= pts[j][1]) j++;
      const top = pts[i], foot = Math.min(pts[j][0], top[0] + (base - top[1]) * (0.35 + rnd() * 0.25));
      shades.push([...pts.slice(i, j + 1), [pts[j][0], bottom], [foot, bottom]]);
    }
    const shadeAll = color => { g.fillStyle = color; for (const s of shades) { g.beginPath(); s.forEach((p, k) => (k ? g.lineTo(...p) : g.moveTo(...p))); g.closePath(); g.fill(); } };
    g.save();
    shape(); g.fillStyle = fill(tone[0], tone[1]); g.fill(); g.clip();
    shadeAll(fill(tone[2], tone[3]));
    // Snow: everything above a ragged line about the snow line.
    g.beginPath(); g.moveTo(-plot, -PADY);
    for (let x = -plot * 0.2; x < w + plot * 0.2; x += plot * 0.05) g.lineTo(x, base - snowAt - (small(x * 2.3) - 0.5) * plot * 0.1);
    g.lineTo(w + plot, -PADY); g.closePath(); g.clip();
    g.fillStyle = tone[4]; g.fillRect(0, -PADY, w, base + PADY);
    shadeAll(tone[5]);
    g.restore();
  }
  const FAR = ['#b4c2cd', '#a9b8c4', '#93a5b5', '#8a9dae', '#eef2f5', '#d3dce3'];
  const NEAR = ['#94a38c', '#8a9a83', '#6f7f6e', '#677766', '#f4f6f4', '#c9d2d6'];
  function land(g, w, h, e) {
    const rnd = rng(11), source = river[0].x, idx = eraIndex(camp);
    // The sky behind the mountains, a few clouds in it; hazier over a metropolis.
    const X0 = -PAD, WW = w + 2 * PAD;      // the margin round the map is land too
    const sky = g.createLinearGradient(0, -PADY, 0, plot * 0.7);
    sky.addColorStop(0, metro(e) ? '#a9bccb' : '#9cc8e6');
    sky.addColorStop(1, metro(e) ? '#dfe3e2' : '#e3eff3');
    g.fillStyle = sky;
    g.fillRect(X0, -PADY, WW, PADY + plot * 0.75);
    for (let i = 0; i < 11; i++) {
      const cx = X0 + rnd() * WW, cy = -PADY * 0.8 + rnd() * (PADY * 0.8 + plot * 0.3), cw = plot * (0.5 + rnd() * 0.7);
      g.fillStyle = 'rgba(255, 255, 255, 0.55)';
      for (let j = 0; j < 4; j++) { g.beginPath(); g.ellipse(cx + (j - 1.5) * cw * 0.28, cy - (j % 2) * cw * 0.08, cw * 0.26, cw * 0.11, 0, 0, Math.PI * 2); g.fill(); }
    }
    // Two ranges, the far one pale with the distance, both highest round the river's source.
    const peakAt = (low, top) => x => plot * (low + (1 - Math.min(1, Math.abs(x - source) / (w * 0.42))) * top);
    g.save(); g.translate(X0, 0);
    // Twice as high as before the camera tilted: the far side is drawn at 3/4 size.
    ridge(g, WW, plot * 0.66, x => 2 * peakAt(0.34, 0.36)(x + X0), FAR, rnd, plot * 0.28);
    ridge(g, WW, plot * 0.84, x => 2 * peakAt(0.22, 0.32)(x + X0), NEAR, rnd, plot * 0.4);
    g.restore();
    // Their feet in a band of grass, then wooded foothills in front of them.
    const foot = g.createLinearGradient(0, plot * 0.66, 0, plot * 0.96);
    foot.addColorStop(0, 'rgba(79, 125, 68, 0)');
    foot.addColorStop(0.6, e[2]);
    foot.addColorStop(1, e[2]);
    g.fillStyle = foot;
    g.fillRect(X0, plot * 0.66, WW, plot * 0.32);
    g.fillStyle = e[2];
    g.fillRect(X0, plot * 0.96, WW, h - plot * 0.96);
    for (let x = X0 - plot * 0.3; x < X0 + WW + plot * 0.3; x += plot * (0.45 + rnd() * 0.5)) {
      const hw = plot * (0.4 + rnd() * 0.35), hh = plot * (0.1 + rnd() * 0.07), cy = plot * (0.93 + rnd() * 0.05);
      const fill = g.createLinearGradient(0, cy - hh, 0, cy);
      fill.addColorStop(0, '#6a9659');
      fill.addColorStop(1, e[2]);
      g.fillStyle = fill;
      g.beginPath(); g.ellipse(x, cy, hw, hh, 0, Math.PI, 0); g.fill();
      // Pines on them, fewer as the camp grows.
      if (img.tree) for (let t = 0, n = Math.round((3 - idx * 0.4) * rnd()); t < n; t++) {
        const tx = x + (rnd() - 0.5) * hw * 1.4, ty = cy - hh * (0.3 + rnd() * 0.5), sz = plot * (0.28 + rnd() * 0.12);
        if (Math.abs(tx - source) > plot * 0.3) g.drawImage(img.tree, tx - sz / 2, ty - sz * ANCHOR, sz, sz);
      }
    }
    // Soft patches, so the grass is not one flat colour: each fades out to nothing, no edge.
    for (let i = 0, n = Math.round(WW * h / 45000); i < n; i++) {
      const tint = rnd() < 0.5 ? '255, 255, 190' : '0, 50, 20', x = X0 + rnd() * WW, y = plot * 0.95 + rnd() * (h - plot * 0.95);
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
    // Tufts of grass, and wild flowers in drifts: many in a tribe, few in a megacity.
    g.lineCap = 'round';
    for (let i = 0, n = Math.round(WW * h / 1400); i < n; i++) {
      const x = X0 + rnd() * WW, y = plot * 1.0 + rnd() * (h - plot * 1.0), l = 3 + rnd() * 4;
      g.strokeStyle = rnd() < 0.6 ? 'rgba(28, 64, 26, 0.35)' : 'rgba(150, 190, 110, 0.35)';
      g.lineWidth = 1.2;
      g.beginPath();
      for (const dx of [-2, 0, 2]) { g.moveTo(x, y); g.lineTo(x + dx * 0.8, y - l * (dx ? 0.75 : 1)); }
      g.stroke();
    }
    const PETALS = ['#ffffff', '#fff27a', '#ffb3c7', '#c9a7ff', '#ffd08a'];
    for (let d = 0, drifts = Math.round(26 * (1 - idx * 0.16)); d < drifts; d++) {
      const cx = X0 + rnd() * WW, cy = plot * 1.05 + rnd() * (h - plot * 1.05), col = PETALS[Math.floor(rnd() * PETALS.length)];
      for (let i = 0; i < 26; i++) {
        const x = cx + (rnd() + rnd() - 1) * plot * 0.6, y = cy + (rnd() + rnd() - 1) * plot * 0.3;
        g.fillStyle = col;
        g.beginPath(); g.arc(x, y, 1.4 + rnd() * 0.8, 0, Math.PI * 2); g.fill();
      }
    }
    // The river comes out from under the foothills: banks, then water with a paler line down its
    // middle; a city's river runs between stone.
    const out = river.filter(q => q.y > plot * 0.86);
    strokeLine(g, out, urban(e) ? '#8b887d' : '#c7b27a', riverWidth() + plot * 0.07);
    strokeLine(g, out, '#3c86bd', riverWidth());
    strokeLine(g, out, 'rgba(160, 215, 240, 0.35)', riverWidth() * 0.34);
    const spring = g.createRadialGradient(out[0].x, out[0].y, 0, out[0].x, out[0].y, plot * 0.28);
    spring.addColorStop(0, 'rgba(70, 110, 60, 0.9)');
    spring.addColorStop(1, 'rgba(70, 110, 60, 0)');
    g.fillStyle = spring;
    g.fillRect(out[0].x - plot * 0.3, out[0].y - plot * 0.3, plot * 0.6, plot * 0.6);
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
  function scenery(g, w, h, placed, plot, e, edges, woods) {
    const rnd = rng(7), idx = eraIndex(camp);
    // Points along the roads, so nothing grows on one.
    const road = roadPoints(edges);
    const clear = plot * (e[4] / 2 + 0.12);
    const onBuilding = (x, y, s) => placed.some(p => Math.abs(p.x - x) < plot * 0.6 && y > p.y - plot * 0.9 && y < p.y + plot * 0.45 + s * 0.8);
    const free = (x, y, s) => !road.some(p => Math.hypot(p.x - x, p.y - y) < clear) && riverGap(x, y) > riverWidth() / 2 + s * 0.2
      && y > plot * 0.98 && y < h - 10 && !onBuilding(x, y, s) && !ponds.some(q => Math.hypot((q.x - x) / (q.rx + 12), (q.y - y) / (q.ry + 8)) < 1);
    // Ponds where there is room, a reed or two at their edge; fewer as the camp grows.
    const ponds = [];
    for (let t = 0; t < 40 && ponds.length < 3 - Math.min(2, idx >> 1); t++) {
      const x = plot + rnd() * (w - plot * 2), y = plot * 1.4 + rnd() * (h - plot * 1.8), rx = plot * (0.35 + rnd() * 0.3), ry = rx * 0.5;
      const near = (px, py) => Math.hypot((px - x) / (rx + plot * 0.25), (py - y) / (ry + plot * 0.2)) < 1;
      if (road.some(p => near(p.x, p.y)) || riverGap(x, y) < rx + plot * 0.4) continue;
      if (placed.some(p => near(p.x, p.y) || near(p.x, p.y - plot * 0.3)) || ponds.some(q => Math.hypot(q.x - x, q.y - y) < plot * 3)) continue;
      ponds.push({x, y, rx, ry});
    }
    for (const {x, y, rx, ry} of ponds) {
      g.fillStyle = urban(e) ? '#8b887d' : '#b9a36f';
      g.beginPath(); g.ellipse(x, y, rx + 5, ry + 4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3c86bd';
      g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(180, 225, 245, 0.35)';
      g.beginPath(); g.ellipse(x - rx * 0.25, y - ry * 0.3, rx * 0.45, ry * 0.25, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#4f6e35'; g.lineWidth = 1.6;
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.15 + rnd() * 0.7), rxp = x + Math.cos(a) * rx * 0.97, ryp = y + Math.sin(a) * ry * 0.97;
        g.beginPath(); g.moveTo(rxp, ryp); g.lineTo(rxp + (rnd() - 0.5) * 3, ryp - 6 - rnd() * 6); g.stroke();
      }
    }
    const tree = (kind, x, y, s) => {
      const pic = img[urban(e) ? (kind === 'rock' ? 'rock' : 'tree-city') : kind];
      if (pic && free(x, y, s)) woods.push([pic, x, y, s]);     // stood up after the warp
    };
    // Woods: trees close together round a few spots, more of them in the early eras; then a
    // few on their own and some rocks.
    const groves = [];
    for (let i = 0, n = Math.round(9 * e[6]) + 1; i < n; i++) {
      const cx = rnd() * w, cy = plot * 1.1 + rnd() * (h - plot * 1.3), count = Math.round(6 + rnd() * 10 * e[6]);
      for (let j = 0; j < count; j++) groves.push([cx + (rnd() + rnd() - 1) * plot * 0.9, cy + (rnd() + rnd() - 1) * plot * 0.45, rnd() < 0.7 ? 'tree' : 'tree-autumn']);
    }
    for (let i = 0, n = Math.round(w * h / 60000); i < n; i++)
      if (rnd() < e[6]) groves.push([rnd() * w, plot * 1.0 + rnd() * (h - plot * 1.0), ['tree', 'tree-autumn', 'rock', 'rock'][Math.floor(rnd() * 4)]]);
    for (const [x, y, kind] of groves.sort((a, c) => a[1] - c[1])) tree(kind, x, y, kind === 'rock' ? 45 + rnd() * 25 : 62 + rnd() * 34);
    // Past the sides of the map, where the tilt shows the land beyond: rolling hills, then
    // woods on them, thick, and rocks. Only as far out as the window can show at that depth.
    const beyond = y => MAP_W / 2 * (1 / depth(y) - 1);       // how far out is in view
    for (let y = plot * 1.0; y < h; y += plot * (0.25 + rnd() * 0.2)) {
      const out = beyond(y);
      if (out < 20) break;
      for (const side of [-1, 1]) {
        const x = side < 0 ? -rnd() * out : w + rnd() * out, hw = plot * (0.5 + rnd() * 0.6), hh = plot * (0.12 + rnd() * 0.1);
        const fill = g.createLinearGradient(0, y - hh, 0, y);
        fill.addColorStop(0, '#6a9659'); fill.addColorStop(1, e[2]);
        g.fillStyle = fill;
        g.beginPath(); g.ellipse(x, y, hw, hh, 0, Math.PI, 0); g.fill();
      }
    }
    for (let y = plot * 1.0; y < h; y += 20 + rnd() * 16) {
      const out = beyond(y);
      if (out < 10) break;
      for (let k = 0, n = Math.ceil((out + 30) / 170); k < n * 2; k++) {
        const side = k % 2 ? 1 : -1, x = side < 0 ? -rnd() * (out + 30) : w + rnd() * (out + 30), kind = rnd() < 0.1 ? 'rock' : rnd() < 0.85 ? 'tree' : 'tree-autumn';
        const pic = img[kind];
        if (pic) woods.push([pic, x, y, kind === 'rock' ? 40 + rnd() * 25 : 60 + rnd() * 40]);
      }
    }
    // Where the animals live: tame ones near the buildings, wild ones anywhere on the grass.
    herd = [];
    const {pens = [], loose: wild = []} = HERDS[e[1]] || {}, loose = [...wild], pensMade = [];
    rails = [];
    for (const group of pens) {
      let pen = null;
      // Near a building if there is room, else anywhere on the grass (outside a city's wall too).
      const probe = [];
      for (let a = 0; a <= 1; a += 0.25) for (let b = 0; b <= 1; b += 0.25) probe.push([a, b]);
      const n = urban(e) ? 3 : 4, taken = (q) => pensMade.some(o => penHas(o, q.x, q.y, plot * 0.4));
      for (let t = 0; t < 400 && !pen && placed.length; t++) {
        const near = placed[Math.floor(rnd() * placed.length)];
        // Then out on the land beyond the sides, high enough on the map to be in view there.
        const fy = plot * 1.6 + rnd() * plot * 3.5, out = beyond(fy) * 0.7 - PEN_W * n / 2;
        const c = t < 200 ? {x: near.x + (rnd() - 0.5) * plot * 4, y: near.y + (rnd() - 0.3) * plot * 2, n}
          : {x: rnd() < 0.5 ? -rnd() * Math.max(0, out) : w + rnd() * Math.max(0, out), y: fy, n};
        if (probe.every(([a, b]) => { const q = inPen(c, a, b); const edge = t < 200 ? -plot * 0.4 : beyond(q.y) * 0.7;   // in view
          return q.x > -edge && q.x < w + edge && free(q.x, q.y, 30) && !taken(q); })) pen = c;
      }
      if (!pen) { loose.push(...group); continue; }      // no room: they roam instead
      pensMade.push(pen);
      // Its four sides, as lines of posts on the ground (drawn after the warp, so they follow it).
      const line = (k, f) => Array.from({length: k + 1}, (_, i) => inPen(pen, ...f(i / k))), across = pen.n * 2, deep = pen.n;
      rails.push(line(across, t => [t, 0]), line(deep, t => [0, t]), line(deep, t => [1, t]), line(across, t => [t, 1]));
      group.forEach((kind, i) => { const q = inPen(pen, 0.25 + rnd() * 0.5, 0.25 + rnd() * 0.5); herd.push({kind, x: q.x, y: q.y, pen}); });
    }
    // Nothing grows in a paddock: the woods placed before it are cleared out of it.
    const inside = (x, y) => pensMade.some(o => penHas(o, x, y, 8));
    for (let i = woods.length - 1; i >= 0; i--) if (inside(woods[i][1], woods[i][2])) woods.splice(i, 1);
    for (const kind of loose) {
      for (let t = 0; t < 40; t++) {
        const near = !WILD.has(kind) && placed.length ? placed[Math.floor(rnd() * placed.length)] : null;
        const x = near ? near.x + (rnd() - 0.5) * plot * 2.4 : plot * 0.6 + rnd() * (w - plot * 1.2);
        const y = near ? near.y + (rnd() - 0.2) * plot * 0.9 : plot * 1.3 + rnd() * (h - plot * 1.6);
        if (free(x, y, 50)) { herd.push({kind, x, y}); break; }
      }
    }
    // And inside the map, a fringe of trees along both sides wherever there is room.
    for (let i = 0, n = Math.round(h / 40); i < n; i++) {
      const y = plot * 1.0 + rnd() * (h - plot * 1.0), d = rnd() * plot * 0.7, x = rnd() < 0.5 ? d : w - d;
      const kind = rnd() < 0.15 ? 'rock' : rnd() < 0.7 ? 'tree' : 'tree-autumn', sz = 58 + rnd() * 34;
      if (!inside(x, y)) tree(kind, x, y, sz);
    }
  }


  // The shadow a picture casts on the ground: its own outline, laid down away from the light
  // (the pictures are lit from the left), so a tower's is long, a wreck's or a tent's short.
  // A point h up the picture falls 0.6 h to the right and 0.25 h back.
  const outlines = new Map();
  function outline(im) {
    let c = outlines.get(im);
    if (!c) {
      c = document.createElement('canvas');
      c.width = im.naturalWidth || im.width; c.height = im.naturalHeight || im.height;
      const o = c.getContext('2d');
      o.drawImage(im, 0, 0);
      o.globalCompositeOperation = 'source-in';
      o.fillStyle = 'rgb(12, 28, 12)';
      o.fillRect(0, 0, c.width, c.height);
      outlines.set(im, c);
    }
    return c;
  }
  function castShadow(g, im, cx, ground, s, flip) {
    if (!im) return;
    g.save();
    g.globalAlpha = 0.28;
    g.translate(cx, ground); g.transform(1, 0, -0.6, 0.25, 0, 0);
    if (flip) g.scale(-1, 1);
    g.drawImage(outline(im), -s / 2, -s * ANCHOR, s, s);
    g.restore();
  }
  // A picture with its ground point at (cx, ground), mirrored if flip.
  function put(g, im, cx, ground, s, flip) {
    if (!flip) { g.drawImage(im, cx - s / 2, ground - s * ANCHOR, s, s); return; }
    g.save();
    g.translate(cx, 0); g.scale(-1, 1);
    g.drawImage(im, -s / 2, ground - s * ANCHOR, s, s);
    g.restore();
  }
  function draw(list) {
    const w = MAP_W, h = MAP_H, e = era(camp);
    // The pictures of this era and those before it first, then draw: a city's old houses
    // stand on in a metropolis.
    const need = [eraIndex(camp) >= 3 ? 'City' : '', eraIndex(camp) >= 4 ? 'Metropolis' : ''].filter(Boolean);
    const missing = need.filter(n => packs[n] !== true);
    if (missing.length) {
      for (const n of missing) packs[n] = packs[n] || fetchAll(PACKS[n]).then(() => { packs[n] = true; update(true); });
      return;
    }
    if (!river.length) river = riverPath(w, h);
    const placed = layout(list, e);
    res = Math.min(window.devicePixelRatio || 1, 1.5);
    flat = flat || document.createElement('canvas');
    flat.width = Math.round((w + 2 * PAD) * res); flat.height = Math.round((h + PADY) * res);
    let g = flat.getContext('2d');
    g.setTransform(res, 0, 0, res, PAD * res, PADY * res);
    g.fillStyle = e[2];
    g.fillRect(-PAD, -PADY, w + 2 * PAD, h + PADY);
    land(g, w, h, e);
    const {lamps: allLamps, edges} = roads(g, placed, e);
    const lamps = allLamps.filter(l => riverGap(l.x, l.y) > riverWidth() / 2 + plot * 0.04);
    lampCount = lamps.length;
    bridges(g, edges, e);
    const trees = urban(e) ? streetTrees(edges, placed, lamps, e, w, h) : [];
    const woods = [];
    scenery(g, w, h, placed, plot, e, edges, woods);
    if (e[1] === 'City') wall(g, w, h);
    // The ground is done: warp it, then stand everything upright on it. Each thing is drawn
    // flat about its ground point, moved and sized there, so its walls stay straight up.
    bg = bg || document.createElement('canvas');
    warpCanvas(flat, res, bg, res);
    g = bg.getContext('2d');
    g.setTransform(res, 0, 0, res, 0, 0);
    // Depth in the air: the far ground paler and bluer, the near ground a little darker.
    const top = Y_H - plot * 0.4, air = g.createLinearGradient(0, top, 0, MAP_H), haze = metro(e) ? '205, 215, 225' : '200, 222, 240';
    air.addColorStop(0, `rgba(${haze}, 0)`);
    air.addColorStop(0.06, `rgba(${haze}, 0.4)`);
    air.addColorStop(0.45, `rgba(${haze}, 0)`);
    air.addColorStop(0.75, 'rgba(0, 20, 0, 0)');
    air.addColorStop(1, 'rgba(0, 20, 0, 0.16)');
    g.fillStyle = air;
    g.fillRect(0, top, MAP_W, MAP_H - top);
    fences(g);
    for (const [pic, x, y, sz, flip] of woods) onGround(g, x, y, () => castShadow(g, pic, x, y, sz, flip));
    for (const [pic, x, y, sz, flip] of woods.sort((a, c) => a[2] - c[2])) onGround(g, x, y, () => put(g, pic, x, y, sz, flip));
    spots = [];
    tags = [];
    litList = [];
    g.textAlign = 'center';
    // Back to front, so a building lower on the screen stands in front of one above it.
    for (const {x: cx, y: ground, b, flip} of [...placed, ...lamps, ...trees].sort((a, c) => a.y - c.y)) {
      const [GX, GY] = warp(cx, ground), gm = depth(ground);
      g.save(); g.translate(GX, GY); g.scale(gm, gm); g.translate(-cx, -ground);
      try {
      if (b.prop) {
        const s = plot * 1.5 * (b.scale || scaleOf(b.kind)) * (b.house ? DECOR_SIZE : 1);
        castShadow(g, img[b.kind], cx, ground, s, flip);
        if (img[b.kind]) put(g, img[b.kind], cx, ground, s, flip);
        if (metro(e)) litList.push([b.kind, cx, ground, s, flip, cx, ground]);
        continue;
      }
      // An ended session is a wreck.
      const level = shown(e, b.status === 'ended' ? 'ruin' : b.level, b.id);
      const big = b.kind === 'meeting' ? 1 : SESSION_SIZE, s = plot * 1.5 * scaleOf(level) * big, pic = img[level];
      castShadow(g, pic, cx, ground, s, flip);
      // A patch of earth under each building.
      g.fillStyle = 'rgba(120, 90, 50, 0.35)';
      g.beginPath(); g.ellipse(cx, ground - 4, plot * 0.4 * big, plot * 0.14 * big, 0, 0, Math.PI * 2); g.fill();
      // Its yard, behind it: back left, then back right (mirrored with it).
      if (b.kind !== 'meeting' && b.status !== 'ended') yard(e, level, b.id).forEach((k, i) => {
        if (!img[k]) return;
        const side = (i ? 1 : -1) * (flip ? -1 : 1), ks = plot * 1.5 * scaleOf(k) * big * (YARD_SIZE[k.replace(/^med-/, '')] || 0.55);
        castShadow(g, img[k], cx + side * plot * 0.5 * big, ground - plot * 0.2 * big, ks, flip);
        put(g, img[k], cx + side * plot * 0.5 * big, ground - plot * 0.2 * big, ks, flip);
        if (metro(e)) litList.push([k, cx + side * plot * 0.5 * big, ground - plot * 0.2 * big, ks, flip, cx, ground]);
      });
      const building = (b.status === 'busy' || b.status === 'running') && b.kind !== 'meeting';
      if (building) scaffold(g, cx, ground, level, false);
      if (pic) put(g, pic, cx, ground, s, flip);
      if (building) scaffold(g, cx, ground, level, true);
      if (metro(e)) litList.push([level, cx, ground, s, flip, cx, ground]);
      const top = ground - s * (ANCHOR - TOP[level]);
      tags.push({cx, ground, top, b});
      // Where a click finds it, in the warped picture.
      const [hx, hy, hw, hh] = warpBox([cx - plot / 2 * big, ground - plot * 0.9 * big, plot * big, plot * 0.9 * big]);
      spots.unshift({x: hx, y: hy, w: hw, h: hh + (plot * 0.2 * big) * depth(ground) + 34, b});
      } finally { g.restore(); }
    }
    // What is lit at night: each building with someone in it, the fires, the lanterns.
    lights = [...placed.filter(p => !p.b.prop && p.b.status !== 'ended').map(p => ({x: p.x, y: p.y - plot * 0.1, r: plot * (p.b.kind === 'meeting' ? 0.95 : 0.8)})),
              ...lamps.filter(l => /^(lantern|lamp)/.test(l.b.kind)).map(l => ({x: l.x, y: l.y - plot * 0.25, r: plot * 0.5}))];
    // What the view must hold: the buildings, and every paddock's four corners.
    const pens = [...new Set(herd.filter(a => a.pen).map(a => a.pen))];
    const xs = [...placed.map(p => warp(p.x, p.y)[0]), ...pens.flatMap(pen => [[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b]) => { const q = inPen(pen, a, b); return warp(q.x, q.y)[0]; }))];
    const left = Math.max(0, Math.min(...xs, MAP_W * 0.3) - plot * 0.9), right = Math.min(MAP_W, Math.max(...xs, MAP_W * 0.7) + plot * 0.9);
    const wasFit = !zoom || zoom - fitZoom() < 0.001;
    const bottom = Math.min(MAP_H, Math.max(...placed.map(p => warp(p.x, p.y)[1])) + plot * 0.55);
    FIT = {x: left, y: 120, w: right - left, h: bottom - 120};
    if (wasFit && zoom) zoom = fitZoom();      // still all the way out
    eraNow = e;
    settle(placed.filter(p => !p.b.prop));
    skySig = '';
    compose();
    sky();
  }

  // --- the view: which part of the map shows, and how big
  // Zoomed out all the way, the window shows the part of the map where the camp is: not the
  // empty corners the tilt leaves either side of the far end, nor most of the sky. Zoomed in,
  // the whole map can be dragged into view.
  // FIT is set by each draw: from the mountain tops down, across what stands on the map.
  let FIT = {x: 0, y: 0, w: MAP_W, h: MAP_H};
  function fitZoom() { return Math.min(viewW / FIT.w, viewH / FIT.h); }
  // Within the map; a map smaller than the window sits in its middle.
  function clampView() {
    const fit = fitZoom();
    zoom = Math.max(fit, Math.min(ZOOM_MAX, zoom || fit));
    if (zoom - fit < 0.001) {             // all the way out: FIT in the middle, but not past the map's edge
      const vw = viewW / zoom, vh = viewH / zoom, keep = (o, v, M) => (v >= M ? (M - v) / 2 : Math.max(0, Math.min(M - v, o)));
      ox = keep(FIT.x + (FIT.w - vw) / 2, vw, MAP_W); oy = keep(FIT.y + (FIT.h - vh) / 2, vh, MAP_H);
      return;
    }
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
    for (const f of fires) onGround(out, f.x, f.y, () => flames(out, f));
    for (const p of [...people.values()].sort((a, c) => a.y - c.y)) onGround(out, p.x, p.y, () => person(out, p));
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
      const [X, Y] = warp(cx, ground), m = depth(ground);
      const x = (X - ox) * zoom, y = (Y + plot * 0.2 * m - oy) * zoom, bx = (X + plot * 0.18 * m - ox) * zoom, by = (Y - (ground - top) * m - oy) * zoom - 4;
      if (x < -80 || x > viewW + 80 || y < -40 || y > viewH + 40) continue;
      const ended = b.status === 'ended', most = full ? 16 : 13;
      const name = b.name.length > most ? b.name.slice(0, most - 1) + '…' : b.name;
      g.font = "bold 12px 'DejaVu Sans Mono', Consolas, monospace";
      const nw = g.measureText(name).width, high = ended || !full ? 18 : 30;
      const rect = [x - nw / 2 - 14, y, nw + 22, high];
      const busy = (b.status === 'busy' || b.status === 'running') && b.kind !== 'meeting';
      // Status: busy a tool sign, waiting a "!" flag; ended is the wreck.
      if (busy) badge(g, bx, by, '⚒', STATUS_COLORS.busy);
      if (b.status === 'waiting') badge(g, bx, by, '!', STATUS_COLORS.waiting);
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
    const k = SESSION_SIZE, dx = plot * 0.332 * k, dy = plot * 0.171 * k, floor = plot * 0.279 * k;
    // A campfire or a tent has no walls to climb: only a low fence around the site.
    const low = /level[01]$/.test(level);
    const tall = low ? floor * 0.4 : Math.max(floor, (ANCHOR - TOP[level]) * plot * 1.5 * scaleOf(level) * k * 0.72);
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
  // the fences (each joins the nearest one not yet joined). From a city on, street lights stand beside
  // the roads, unless a building is there. Returns the lanterns, drawn with the
  // buildings so they stand in front of or behind them, and the roads, which trees avoid.
  function roads(g, placed, e) {
    const joins = placed.filter(p => p.b.kind !== 'fence');
    if (!e[3] || (joins.length < 2 && !urban(e))) return {lamps: [], edges: []};
    // Each road ends in front of the door (on the lower left, or right if mirrored), outside the footprint.
    const pts = joins.map(p => ({x: p.x + plot * 0.18 * (p.flip ? 1 : -1), y: p.y + plot * 0.16, id: p.b.id}));
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
        groundPath(g, line);
        groundStroke(g);
      }
    }
    if (metro(e)) {                        // the white line down an avenue
      g.strokeStyle = 'rgba(240, 240, 230, 0.75)'; g.lineWidth = plot * 0.012; g.lineCap = 'butt';
      g.setLineDash([plot * 0.1, plot * 0.12]);
      for (const {line, width} of edges) {
        if (width < 0.2) continue;
        groundPath(g, line);
        groundStroke(g);
      }
      g.setLineDash([]);
    }
    if (urban(e)) {                        // a paved plaza where the avenues meet
      g.fillStyle = e[5];
      g.beginPath(); g.ellipse(PLAZA.x, PLAZA.y, 128, 76, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = metro(e) ? '#c9c5b8' : e[3];
      g.beginPath(); g.ellipse(PLAZA.x, PLAZA.y, 124, 73, 0, 0, Math.PI * 2); g.fill();
    }
    if (!urban(e)) return {lamps: [], edges};      // street lights come with a city
    const lamps = [];
    for (const [n, r] of edges.entries()) {
      // A city's roads come in short stretches: a light on every stretch but the side
      // streets' every other, on either side in turn.
      const a = r.line[0], b = r.line[r.line.length - 1], side = plot * ((r.width || e[4]) / 2 + 0.08);
      if (Math.hypot(b.x - a.x, b.y - a.y) < plot * 0.6) continue;
      if (urban(e) && r.width < 0.2 && n % 2) continue;
      for (const [t, way] of urban(e) ? [[0.5, n % 2 ? 1 : -1]] : [[0.25, 1], [0.75, -1]]) {
        const m = along(r, t), d = Math.hypot(m.dx, m.dy) || 1;
        const x = m.x - m.dy / d * side * way, y = m.y + m.dx / d * side * way;
        if (lamps.some(q => Math.hypot(q.x - x, q.y - y) < plot * 0.5)) continue;
        if (placed.some(p => Math.abs(p.x - x) < plot * 0.45 && y > p.y - plot * 0.2 && y < p.y + plot * 0.5)) continue;
        // A city's lanterns; a metropolis's lamps, with two arms over an avenue.
        lamps.push({x, y, flip: m.dy * way < 0, b: {prop: true, kind: !metro(e) ? 'lantern' : r.width >= 0.2 ? 'lamp-double' : 'lamp'}});
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
    const y0 = plot * 0.95;                // from the foot of the hills, not up the sky
    g.fillRect(0, y0, t, h - y0); g.fillRect(w - t, y0, t, h - y0); g.fillRect(0, h - t, w, t);
    g.fillStyle = '#57534c';
    for (let y = y0 + 4; y < h - t; y += 16) { g.fillRect(0, y, t + 3, 8); g.fillRect(w - t - 3, y, t + 3, 8); }
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
  // The animals (animals.png, a row each; 9 frames facing lower right, then 9 lower left: 0
  // standing, 1-4 walking, 5-8 eating), by era: wild ones in a tribe, then farm animals, then
  // horses and dogs in a city, dogs and a deer or two in a metropolis. Each keeps to a patch
  // round its home, grazing, wandering and standing; at night they stand still.
  const BEAST = {deer: 0, stag: 1, fox: 2, wolf: 3, cow: 4, bull: 5, horse: 6, white: 7, donkey: 8, alpaca: 9, husky: 10, shiba: 11};
  const WILD = new Set([BEAST.deer, BEAST.stag, BEAST.fox, BEAST.wolf]);
  // pens: the animals kept together in a fenced paddock; loose: the rest.
  const HERDS = (b => ({
    Tribe: {pens: [], loose: [b.deer, b.deer, b.stag, b.fox, b.wolf, b.deer, b.stag, b.fox]},
    Village: {pens: [[b.cow, b.cow, b.bull], [b.horse, b.white, b.donkey, b.alpaca]], loose: [b.deer, b.deer, b.stag, b.fox, b.wolf]},
    Town: {pens: [[b.cow, b.cow, b.bull], [b.horse, b.white, b.donkey, b.alpaca]], loose: [b.deer, b.deer, b.stag, b.fox, b.wolf]},
    City: {pens: [[b.horse, b.white, b.donkey]], loose: [b.husky, b.shiba, b.deer, b.stag, b.fox]},
    Metropolis: {pens: [], loose: [b.husky, b.shiba, b.husky, b.deer, b.fox]},
    Megacity: {pens: [], loose: [b.husky, b.shiba, b.husky, b.deer, b.fox]}}))(BEAST);
  // A paddock: a rectangle of fence square to the map, as the city wall is, so the warp makes
  // it narrow away from the camera like everything else on the ground. pen.n sets its size:
  // PEN_W wide and PEN_D deep per n, with posts PEN_W / 2 apart along it.
  const PEN_W = 90, PEN_D = 42;
  // A point in a paddock centred on (pen.x, pen.y): a across it (left to right), b into it (back to front), 0 to 1.
  const inPen = (pen, a, b) => ({x: pen.x + (a - 0.5) * PEN_W * pen.n, y: pen.y + (b - 0.5) * PEN_D * pen.n});
  const penHas = (o, x, y, more = 0) => Math.abs(x - o.x) < PEN_W * o.n / 2 + more && Math.abs(y - o.y) < PEN_D * o.n / 2 + more;
  const FAST = new Set([BEAST.fox, BEAST.wolf, BEAST.husky, BEAST.shiba]);
  let herd = [];                            // this draw's animals: {kind, x, y}, x and y their home
  let rails = [];                           // this draw's paddock fences: lines of post points
  // A paddock's fence, after the warp: a post at each point, two rails between them, and their
  // shadow on the ground, all sized for how far away they stand. Back sides first.
  function fences(g) {
    const H = 22, W = p => warp(p.x, p.y), sorted = [...rails].sort((a, c) => (a[0].y + a[a.length - 1].y) - (c[0].y + c[c.length - 1].y));
    g.lineCap = 'round';
    for (const line of sorted) {
      const pts = line.map(p => { const [X, Y] = W(p), m = depth(p.y); return {X, Y, h: H * m, m}; });
      g.strokeStyle = 'rgba(12, 28, 12, 0.25)';
      g.beginPath();
      pts.forEach((q, i) => { const x = q.X + q.h * 0.35, y = q.Y - q.h * 0.15; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.lineWidth = 3 * pts[0].m; g.stroke();
      for (const [lift, color, wide] of [[0.45, '#a8673f', 2.4], [0.85, '#c98a5e', 2.6]]) {
        g.strokeStyle = color;
        g.beginPath();
        pts.forEach((q, i) => (i ? g.lineTo(q.X, q.Y - q.h * lift) : g.moveTo(q.X, q.Y - q.h * lift)));
        g.lineWidth = wide * pts[0].m; g.stroke();
      }
      g.strokeStyle = '#8f5534';
      for (const q of pts) { g.lineWidth = 3.4 * q.m; g.beginPath(); g.moveTo(q.X, q.Y); g.lineTo(q.X, q.Y - q.h); g.stroke(); }
    }
  }
  function want(status) { return status === 'busy' || status === 'running' ? 'work' : status === 'waiting' ? 'wave' : 'rest'; }
  function spot(name, flip) { const [dx, dy, dir] = SPOTS[name], k = plot * SESSION_SIZE; return {dx: dx * k * (flip ? -1 : 1), dy: dy * k, dir: flip ? 1 - dir : dir}; }   // mirrored with its building
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
    for (const {x, y, b, flip} of placed) {
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
        if (p.flip !== !!flip) { p.mode = 'go'; p.goal = spot(p.want === 'rest' ? 'seat' : p.want, !!flip); }
        Object.assign(p, {home, tool: b.tool, status: b.status, flip: !!flip});
      } else {
        // A new person starts where its status puts it, already at it.
        const w = want(b.status), g = spot(w === 'rest' ? 'seat' : w, !!flip);
        people.set(b.id, {home, x: x + g.dx, y: y + g.dy, dir: g.dir, frame: -1, tick: 0, tool: b.tool, status: b.status,
                          want: w, mode: 'at', goal: g, flip: !!flip, wait: 5 + Math.random() * 30, laps: 0, pause: 0});
      }
    }
    herd.forEach(({kind, x, y, pen}, i) => {
      const id = 'animal#' + i, p = people.get(id);
      keep.add(id);
      if (p && p.kind === kind && p.home.x === x && p.home.y === y) return;
      people.set(id, {animal: true, kind, pen, home: {x, y}, x, y, dir: Math.random() < 0.5 ? 0 : 1, frame: 0, tick: 0, mode: 'graze', wait: 3 + Math.random() * 10});
    });
    for (const id of [...people.keys()]) if (!keep.has(id)) people.delete(id);
    clock();
  }
  // Somewhere in front of the building, a little to either side.
  function target(home) {
    return {x: home.x + (Math.random() - 0.5) * plot * 0.9 * SESSION_SIZE, y: home.y + (Math.random() * 0.2 - 0.04) * plot * SESSION_SIZE};
  }
  function size() { return plot * 0.75; }
  function box(p) {                         // the shadow reaches out to the right
    const s = size();
    return [Math.floor(p.x - s / 2) - 1, Math.floor(p.y - s * ANCHOR) - 1, Math.ceil(s * 1.35) + 2, Math.ceil(s) + 2];
  }
  function person(g, p) {
    const pic = p.animal ? img.animals : img.people, s = size();
    if (!pic || p.frame < 0) return;
    const row = p.animal ? p.kind : PEOPLE_ROW[p.tool] ?? 0, col = p.dir * (p.animal ? 9 : PER_DIR) + p.frame;
    // Its shadow, from its own outline, as the buildings'.
    g.save();
    g.globalAlpha = 0.28;
    g.translate(p.x, p.y); g.transform(1, 0, -0.6, 0.25, 0, 0);
    g.drawImage(outline(pic), col * CELL, row * CELL, CELL, CELL, -s / 2, -s * ANCHOR, s, s);
    g.restore();
    g.drawImage(pic, col * CELL, row * CELL, CELL, CELL, p.x - s / 2, p.y - s * ANCHOR, s, s);
  }
  // One step of an animal. Returns whether it looks different now.
  function animalStep(p, dt) {
    const before = [p.x, p.y, p.dir, p.frame].join(), h = hourNow();
    if (h >= 20 || h < 5.5) { p.frame = 0; return before !== [p.x, p.y, p.dir, p.frame].join(); }   // asleep on its feet
    p.tick++;
    if (p.mode === 'walk') {
      const speed = plot * (FAST.has(p.kind) ? 0.22 : 0.1) * dt, dx = p.goal.x - p.x, dy = p.goal.y - p.y, d = Math.hypot(dx, dy);
      if (d <= speed) { p.x = p.goal.x; p.y = p.goal.y; p.mode = Math.random() < 0.6 ? 'graze' : 'stand'; p.wait = 4 + Math.random() * 14; p.frame = 0; }
      else { p.x += dx / d * speed; p.y += dy / d * speed; p.dir = dx >= 0 ? 0 : 1; p.frame = 1 + p.tick % 4; }
    } else {
      p.frame = p.mode === 'graze' ? 5 + (p.tick >> 1) % 4 : 0;     // eating at half speed
      p.wait -= dt;
      if (p.wait <= 0) {
        const roam = plot * (FAST.has(p.kind) ? 0.9 : 0.55), a = Math.random() * Math.PI * 2, r = roam * Math.sqrt(Math.random());
        p.mode = 'walk';
        p.goal = p.pen ? inPen(p.pen, 0.15 + Math.random() * 0.7, 0.15 + Math.random() * 0.7) : {x: p.home.x + Math.cos(a) * r, y: p.home.y + Math.sin(a) * r * KY};
      }
    }
    return [p.x, p.y, p.dir, p.frame].join() !== before;
  }

  // One step of a session's person. Returns whether it looks different now.
  function step(p, dt) {
    if (p.animal) return animalStep(p, dt);
    const before = [p.x, p.y, p.dir, p.frame].join();
    const w = want(p.status);
    if (w !== p.want) {                    // the status changed: off to that spot
      p.want = w; p.mode = 'go'; p.goal = spot(w === 'rest' ? 'seat' : w, p.flip); p.pause = 0;
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
        else if (p.mode === 'stroll') { p.mode = 'go'; p.goal = spot('seat', p.flip); p.pause = 1 + Math.random() * 2; }
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
      // A plain see-through colour over the camp, not CSS's multiply, which this window's
      // WebKit can show as a solid colour hiding everything under it. dark is how much of the
      // daylight goes; the colour is what makes white come out near the sky's colour.
      const dark = 1 - Math.min(...c) / 255;
      const tint = c.map(v => Math.round((v - (1 - dark) * 255) / dark * 0.6));   // less: dark things stay dark
      nightColor = `rgba(${tint}, ${dark})`;
      const flatNight = document.createElement('canvas');
      flatNight.width = MAP_W + 2 * PAD; flatNight.height = MAP_H + PADY;
      const g = flatNight.getContext('2d');
      g.setTransform(1, 0, 0, 1, PAD, PADY);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = nightColor;
      g.fillRect(-PAD, -PADY, MAP_W + 2 * PAD, MAP_H + PADY);
      // The lights come on as it gets dark: each lets the daylight through around it.
      g.globalCompositeOperation = 'destination-out';
      for (const {x, y, r} of lights) {
        const glow = g.createRadialGradient(x, y, 0, x, y, r);
        glow.addColorStop(0, `rgba(0, 0, 0, ${Math.min(0.85, dark * 1.3)})`);
        glow.addColorStop(0.4, `rgba(0, 0, 0, ${Math.min(0.5, dark * 0.75)})`);
        glow.addColorStop(0.75, `rgba(0, 0, 0, ${Math.min(0.14, dark * 0.2)})`);
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        g.fillStyle = glow;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      nightMap = nightMap || document.createElement('canvas');
      warpCanvas(flatNight, 1, nightMap, 1);
    }
    // A metropolis's windows, warm, on a canvas of their own over the dark: each building
    // first wipes out what it stands in front of. Only while it is dark at all.
    litOn = false;
    if (nightOn && litList.length) {
      const dark = 1 - Math.min(...c) / 255;
      litAlpha = Math.min(0.8, dark * 1.2);
      litMap = litMap || document.createElement('canvas');
      litMap.width = MAP_W; litMap.height = MAP_H;
      const g = litMap.getContext('2d');
      for (const [kind, x, y, s, flip, gx, gy] of litList) onGround(g, gx, gy, () => {
        if (img[kind]) { g.globalCompositeOperation = 'destination-out'; put(g, img[kind], x, y, s, flip); }
        g.globalCompositeOperation = 'source-over';
        if (img[kind + '-lit']) put(g, img[kind + '-lit'], x, y, s, flip);
      });
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
    g.clearRect(0, 0, viewW, viewH);
    g.fillStyle = nightColor;              // the strip around a map that does not fill the window
    g.fillRect(0, 0, viewW, viewH);
    g.clearRect(-ox * zoom, -oy * zoom, MAP_W * zoom, MAP_H * zoom);
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
      dirty.push(warpBox(before), warpBox(box(p)));
    }
    for (const f of fires) dirty.push(warpBox(flameBox(f)));
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
    for (const f of fires) if (hit(warpBox(flameBox(f)))) onGround(g, f.x, f.y, () => flames(g, f));
    for (const p of [...people.values()].filter(p => hit(warpBox(box(p)))).sort((a, c) => a.y - c.y)) onGround(g, p.x, p.y, () => person(g, p));
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
          _warp: warp, _layout: () => ({lamps: lampCount, zoom, fit: fitZoom(), ox, oy, things: layoutMemo.map(p => ({id: p.b.id, prop: !!p.b.prop, house: !!p.b.house, kind: p.b.kind, x: p.x, y: p.y, r: p.r})), roads: cityMemo ? cityMemo.edges.map(r => r.line) : [], bridge: cityMemo ? cityMemo.bridge : []})};
})();
