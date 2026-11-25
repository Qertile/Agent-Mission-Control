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
                'fence', 'signpost', 'lantern', 'lantern-post', 'ship-moored', 'rowboat', 'boats', 'fishing-boat', 'dock-goods', 'dock-goods-b', 'lamp', 'lamp-double', 'stall', 'stall-green', 'fountain', 'tree-city',
                'house-a', 'house-b', 'house-c', 'house-d', 'house-e', 'house-f', 'house-g', 'house-h',
                'house-i', 'house-j', 'house-k', 'house-l', 'house-m', 'house-n',
                'shop', 'tavern', 'smithy', 'sawmill', 'warehouse', 'farm', 'windmill', 'watermill', 'church', 'townhall'];
  // Pictures only one era uses are loaded when it comes, and never before.
  const LIT_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'tower-a', 'tower-b', 'tower-c', 'tower-d', 'tower-e', 'mall', 'cafe', 'level1', 'level2', 'level3', 'level4'].map(k => `metro-${k}-lit`);
  const PACKS = {
    Metropolis: [...PICS_METRO, 'metro-meeting', ...LIT_NAMES, 'ship-liner', 'ship-cargo', 'boat-tug', 'boat-speed', 'dock-cargo'],
    City: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'shop', 'tavern', 'smithy', 'warehouse', 'sawmill', 'church', 'townhall', 'farm', 'windmill', 'watermill', 'level2', 'level3', 'level4'].map(k => `med-${k}`)};
  PACKS.City.push(...PACKS.City.filter(k => k !== 'med-farm').map(k => k + '-lit'), 'tex-street', 'tex-brick', 'tex-roof');   // tools/relax_lit.py's; the medieval kit's textures
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
  const STATUS_COLORS = {busy: '#00dcff', running: '#00dcff', waiting: '#ffc400', idle: '#8cff8c', ended: '#8c96a0', hibernating: '#b48cff'};
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
  // What an era is called on screen (its key stays as it is).
  const SHOWN = {City: 'Medieval City'}, named = k => SHOWN[k] || k;
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
  let skyTop = '#9cc8e6';                  // the sky's colour at its top, for the view above it
  let signs = [];                          // the name signs drawn, {rect in the view, b}: a click on one is for its building
  let moving = null;                       // a building being dragged: {b, from, x, y, to, ok}
  let arranging = false;                   // ✥ Rearrange is on: dragging a building moves it
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
  // SQ: the ground squashed up and down on top of that, for a lower camera (about 26 degrees
  // over the ground; the pictures are drawn from 31). PAD and PADY: as much margin as the
  // narrowest far side and the sky above the horizon then need; the view goes no higher than
  // the sky's top (SKY_TOP, in the warped picture).
  // The camp's off-screen canvases are kept in memory, not on the graphics card
  // (willReadFrequently): WebView2 on Windows, with many terminal tabs using the card too, can
  // give a big canvas none, and then it stays blank with no error.
  const SOFT = {willReadFrequently: true};
  // A canvas kept from one picture to the next, made again if the browser has lost its
  // context (WebView2 on Windows can: it is then blank for good, with no error). When the
  // browser gives one back, everything is drawn again.
  let remade = 0;                          // how many lost ones were made again, for the report
  function keep(c) {
    if (c && !(c.getContext('2d', SOFT).isContextLost?.())) return c;
    if (c) remade++;
    const n = document.createElement('canvas');
    n.addEventListener('contextrestored', () => update(true));
    return n;
  }
  const PAD = 1640, PADY = 700, FAR_SCALE = 0.36, FAR_V = 0.55, HORIZON = plot * 0.9, SQ = 0.72;
  const farness = y => Math.min(1, Math.max(0, (y - HORIZON) / (MAP_H - HORIZON)));
  const depth = y => FAR_SCALE + (1 - FAR_SCALE) * farness(y);
  const Y_H = MAP_H - SQ * (MAP_H - HORIZON) * (1 + FAR_V) / 2;     // where the horizon lands
  const SKY_TOP = Math.max(0, Y_H - FAR_V * (HORIZON + PADY));
  function warpY(y) {
    if (y < HORIZON) return Y_H - FAR_V * (HORIZON - y);
    const d = Math.min(y, MAP_H) - HORIZON;
    return Y_H + SQ * (FAR_V * d + (1 - FAR_V) * d * d / (2 * (MAP_H - HORIZON))) + Math.max(0, y - MAP_H);
  }
  const warp = (x, y) => [MAP_W / 2 + (x - MAP_W / 2) * depth(y), warpY(y)];
  // A flat world canvas (at `sr` pixels a unit, the margin included) onto a map-sized one, in
  // strips two units high, each rounded to whole pixels so none overlap (night is see-through).
  function warpCanvas(src, sr, dst, dr) {
    dst.width = Math.round(MAP_W * dr); dst.height = Math.round(MAP_H * dr);
    const g = dst.getContext('2d', SOFT);
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
  let fronts = [];                         // what stands up, to hide a person behind it: {y, x0, y0, x1, y1, paint}
  let ways = null;                         // the streets as a net to walk on (waysOf)

  // Where you moved each building to (dragging it): {session id: {x, y}} on the ground, per computer.
  const PLACES_KEY = 'amc-relax-places';
  let places = (() => { try { return JSON.parse(localStorage.getItem(PLACES_KEY)) || {}; } catch (e) { return {}; } })();
  function savePlaces() { try { localStorage.setItem(PLACES_KEY, JSON.stringify(places)); } catch (e) {} }
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
  // ready: the pictures are in; bare: the picture last drawn was drawn before they were.
  let ready = false, bare = false;
  function load() { return (loading = loading || fetchAll(PICS_BASE).then(() => { ready = true; })); }
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
  // The camp's heart: the sessions' buildings nearest the plaza, CORE of them. The wall goes
  // round these only; the rest stand outside it.
  const CORE = 5;
  const coreOf = placed => placed.filter(p => !p.b.prop).sort((a, b) => groundGap(a, PLAZA) - groundGap(b, PLAZA)).slice(0, CORE);
  // A city's wall (cityWall below) finds its way between what stands; onWall says whether a
  // point is on it, so that no lamp or tree is put there.
  let wallLine = null, plazaCount = 0;
  const onWall = (x, y) => !!wallLine && wallLine.some((a, i) => { const b = wallLine[(i + 1) % wallLine.length], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - a.x - dx * t, (y - a.y - dy * t) / KY) < 26; });
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
  // Round the plaza only the avenues run, so that the blocks between them hold the buildings
  // nearest the fountain: no side street comes within SQUARE of it.
  const SQUARE = 330;
  function growStreets() {
    const rnd = rng(23), all = [], pts = [];
    const add = (line, width, gen) => {
      const r = {line, width, gen};
      all.push(r);
      for (const q of line) pts.push({x: q.x, y: q.y, r, half: width * plot / 2});
      return r;
    };
    // An avenue that runs down to the sea stops at the wharf.
    for (const a of AVENUES) {
      const line = spline(a.map(([x, y]) => ({x: x * MAP_W, y: y * MAP_H}))), i = line.findIndex(q => bayGap(q.x, q.y) < 20);
      add(i < 0 ? line : line.slice(0, i), 0.22, 0);
    }
    // Along each bank, from below the mountains down.
    for (const side of [-1, 1]) {
      const bank = river.map((q, i) => {
        const p = river[Math.max(0, i - 1)], n = river[Math.min(river.length - 1, i + 1)], d = Math.hypot(n.x - p.x, n.y - p.y);
        return {x: q.x - (n.y - p.y) / d * 42 * side, y: q.y + (n.x - p.x) / d * 42 * side};
      }).filter(q => q.y > plot * 1.1 && q.y < MAP_H - 15 && q.x > 15 && q.x < MAP_W - 15 && bayGap(q.x, q.y) > 40);
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
        if (outside(q) || riverGap(q.x, q.y) < 48 || groundGap(q, PLAZA) < SQUARE) return len > 140 ? line : null;
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
          if (groundGap(q, PLAZA) < SQUARE) continue;
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
      if (Math.hypot((x - PLAZA.x) / 150, (y - PLAZA.y) / 88) < 1) continue;
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
      if (Math.hypot((x - PLAZA.x) / 160, (y - PLAZA.y) / 95) < 1) continue;
      if (pts.some(p => Math.hypot((p.x - x) / (rx + p.half), (p.y - y) / (ry + p.half)) < 1)) continue;
      list.push({x, y, far: groundGap({x, y}, PLAZA) / 1100, flip: facing(nx, x, y)});
    }
    return list.sort((p, q) => p.far - q.far).map((l, n) => ({...l, n: `w${n}`}));
  }
  // Round the plaza, between the avenues: the first places a session's building is offered,
  // facing the fountain, as near it as a building's own ground (nor its name) is clear of
  // the streets' paving; each clear of the others. Offered before any spot along a road.
  function plazaSpots({pts}) {
    const list = [], P = plot * SESSION_SIZE / 1.2;
    for (let i = 0; i < 60; i++) {
      const t = i / 60 * Math.PI * 2;
      for (let k = 0.8; k <= 1.8; k += 0.05) {
        const x = PLAZA.x + Math.cos(t) * 205 * k, y = PLAZA.y + Math.sin(t) * 122 * k;
        if (Math.hypot((x - PLAZA.x) / (128 + P * 0.42), (y - PLAZA.y) / (76 + P * 0.22)) < 1) continue;   // its ground off the paving
        if (x < LEFT || x > RIGHT || y < LOW || y > HIGH || wet(x, y)) continue;
        if (pts.some(p => Math.hypot((p.x - x) / (plot * 0.5 + p.half), (p.y - y) / (plot * 0.3 + p.half)) < 1)) continue;   // as wideSpots
        if (list.some(q => Math.abs(q.x - x) < P * 1.15 && Math.abs(q.y - y) < P * 0.62)) continue;
        list.push({x, y, far: groundGap({x, y}, PLAZA) / 1100 - 0.5, n: `p${list.length}`, flip: facing(Math.cos(t), x, y)});
        break;
      }
    }
    return list;
  }
  // Any ground clear of roads and the river, for when so many sessions are open that the spots
  // along the roads have run out.
  function openGround({pts}) {
    const rx = plot * 0.5, ry = plot * 0.3, list = [];
    for (let y = LOW; y <= HIGH; y += 36) for (let x = LEFT; x <= RIGHT; x += 44) {
      if (wet(x, y) || Math.hypot((x - PLAZA.x) / 160, (y - PLAZA.y) / 95) < 1) continue;
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
    return (cityMemo = {edges, lots: streetLots(grown), wide: [...plazaSpots(grown), ...wideSpots(grown)], open: openGround(grown), bridge: grown.pts.filter(p => riverGap(p.x, p.y) < riverWidth() / 2 + plot * 0.05)});
  }
  // Everyone's place, the same in every era, so that the camp grows round what is there and
  // only what stands there changes. The fountain is on the plaza; each session takes the first
  // free wide spot, nearest the plaza give or take a little (from the id); then the era's props;
  // then the buildings, each with room for the tallest it may become.
  // Where you put a building, unless that is on the water now (the sea came after it).
  const placeOf = id => { const p = places[id]; return p && !wet(p.x, p.y) ? p : null; };
  function arrange(list, props, turns, cap = 2) {
    const {lots, wide, open} = cityPlan(), placed = [], used = new Set(), houses = [];
    for (const b of props.filter(q => q.kind === 'fountain')) placed.push({...PLAZA, r: {base: [PLAZA.x - plot * 0.45, PLAZA.y - plot * 0.25, PLAZA.x + plot * 0.45, PLAZA.y + plot * 0.16]}, b});
    // The ones you moved stand where you put them, before the rest find theirs.
    const moved = list.filter(b => placeOf(b.id)), all = placed;
    for (const b of moved) {
      // Only the room it stands on (as when it was dropped), so none of the others has to move.
      const {x, y} = placeOf(b.id);
      placed.push({x, y, r: room(x, y, false, 0.7), b, flip: facing(0, x, y) && b.kind !== 'meeting'});
    }
    // Every one then finds the spot it would have, so the others keep theirs: one you moved
    // keeps its spot empty, standing where you put it.
    for (const b of sorted(list)) {
      const rnd = rng(hash(b.id)), placed = placeOf(b.id) ? all.filter(q => q.b !== b) : all;
      const order = wide.map(l => [l.far + rnd() * 0.04, l]).sort((a, c) => a[0] - c[0]);
      // Room for a skyscraper if there is any; with many sessions, for less: a later tower
      // may then stand in front of a neighbour, which is better than on top of it.
      let found = null, high = 2;
      // A place on the square first, with what room above it there is there.
      for (const [, l] of order) {
        if (found || used.has(l) || !String(l.n).startsWith('p')) continue;
        const h = [2, 1.4, 0.7].find(h => h <= cap && l.y - plot * h >= 0 && !placed.some(q => clash(room(l.x, l.y, false, h), q.r)));
        if (h) { found = [0, l]; high = h; }
      }
      if (!found) for (const h of [2, 1.4, 0.7].filter(h => h <= cap)) {
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
      // (One you moved leaves a stand-in here, holding its old room, taken out at the end.)
      all.push({x: l.x, y: l.y, r: room(l.x, l.y, false, high), b, flip: !!l.flip && b.kind !== 'meeting', gone: !!placeOf(b.id)});
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
    return placed.filter(q => !q.gone);
  }
  // Everyone's place, worked out again only when who is there or the era changes.
  let layoutKey = '', layoutMemo = [];
  function layout(list, e) {
    const props = e[7].map((kind, i) => ({id: '~' + kind + i, kind, prop: true}));
    const key = JSON.stringify([list.map(b => b.id), e[1], decorCount(camp), amc.order, places]);
    if (key !== layoutKey) {
      layoutKey = key;
      // Room for skyscrapers first; if that leaves any two sessions on each other (many of
      // them), the whole camp again with less room above each, until none are.
      for (const cap of [2, 1.4, 0.7]) {
        layoutMemo = arrange(list, props, camp, cap);
        const own = layoutMemo.filter(p => !p.b.prop);
        if (!own.some((a, i) => own.some((c, j) => j > i && clash(a.r, c.r)))) break;
      }
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
  // The sea in the bottom left corner: its shore runs in from past the map's left edge and
  // round to the bottom edge, past the river's mouth. A quarter ellipse, its edge a little
  // uneven. riverGap counts it as water, so nothing stands, grows or runs on it.
  const BAY = {rx: 840, ry: 420}, bayK = a => 1 + 0.05 * Math.sin(a * 5 + 1) + 0.025 * Math.sin(a * 13);
  const SHORE = (() => {
    const line = [];
    for (let x = -PAD; x < 0; x += 40) line.push({x, y: MAP_H - BAY.ry * bayK(Math.PI / 2)});
    for (let i = 0; i <= 48; i++) { const a = Math.PI / 2 * (1 - i / 48), k = bayK(a); line.push({x: BAY.rx * k * Math.cos(a), y: MAP_H - BAY.ry * k * Math.sin(a)}); }
    return line;
  })();
  function bayGap(x, y) {
    const u = Math.max(0, x) / BAY.rx, v = (MAP_H - Math.min(y, MAP_H)) / BAY.ry, r = Math.hypot(u, v);
    if (r < bayK(Math.atan2(v, u))) return 0;
    if (r > 1.5) return (r - 1.1) * BAY.ry;                  // far off: near enough, and quick
    return Math.min(...SHORE.map(q => Math.hypot(q.x - x, q.y - y)));
  }
  function riverGap(x, y) { return Math.min(bayGap(x, y), ...river.map(q => Math.hypot(q.x - x, q.y - y))); }
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
    const sky = g.createLinearGradient(0, -PADY, 0, plot * 0.7), wk = weatherDrawn;
    const tops = {cloudy: '#a3b1bf', rain: '#7f8c9a', snow: '#b9c3cc', fog: '#c9d0d6'}, lows = {cloudy: '#dde2e6', rain: '#b8c0c7', snow: '#e8ecef', fog: '#e4e7ea'};
    skyTop = tops[wk] || (metro(e) ? '#a9bccb' : '#9cc8e6');
    sky.addColorStop(0, skyTop);
    sky.addColorStop(1, lows[wk] || (metro(e) ? '#dfe3e2' : '#e3eff3'));
    g.fillStyle = sky;
    g.fillRect(X0, -PADY, WW, PADY + plot * 0.75);
    for (let i = 0; i < 11; i++) {
      const cx = X0 + rnd() * WW, cy = -PADY * 0.8 + rnd() * (PADY * 0.8 + plot * 0.3), cw = plot * (0.5 + rnd() * 0.7);
      g.fillStyle = 'rgba(255, 255, 255, 0.55)';
      for (let j = 0; j < 4; j++) { g.beginPath(); g.ellipse(cx + (j - 1.5) * cw * 0.28, cy - (j % 2) * cw * 0.08, cw * 0.26, cw * 0.11, 0, 0, Math.PI * 2); g.fill(); }
    }
    // More cloud, and greyer, as the weather turns: a sky full of it in rain.
    const more = {cloudy: [34, '235, 238, 242', 0.8], rain: [46, '128, 136, 148', 0.85], snow: [30, '214, 220, 228', 0.8], fog: [14, '230, 233, 236', 0.6]}[wk];
    if (more) {
      const wr = rng(23), [n, tint, alpha] = more;
      for (let i = 0; i < n; i++) {
        const cx = X0 + wr() * WW, cy = -PADY * 0.9 + wr() * (PADY * 0.9 + plot * 0.35), cw = plot * (0.7 + wr() * 1.1), shade = wr() * 0.25;
        g.fillStyle = `rgba(${tint}, ${alpha - shade * 0.4})`;
        for (let j = 0; j < 5; j++) { g.beginPath(); g.ellipse(cx + (j - 2) * cw * 0.24, cy - (j % 2) * cw * 0.09, cw * 0.27, cw * 0.12, 0, 0, Math.PI * 2); g.fill(); }
      }
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
        if (Math.abs(tx - source) > plot * 0.3) g.drawImage(seasonal(img.tree, tx, ty), tx - sz / 2, ty - sz * ANCHOR, sz, sz);
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
    for (let d = 0, drifts = Math.round(26 * (1 - idx * 0.16) * {spring: 2, summer: 1, autumn: 0.4, winter: 0}[seasonNow()]); d < drifts; d++) {
      const cx = X0 + rnd() * WW, cy = plot * 1.05 + rnd() * (h - plot * 1.05), col = PETALS[Math.floor(rnd() * PETALS.length)];
      for (let i = 0; i < 26; i++) {
        const x = cx + (rnd() + rnd() - 1) * plot * 0.6, y = cy + (rnd() + rnd() - 1) * plot * 0.3;
        g.fillStyle = col;
        g.beginPath(); g.arc(x, y, 1.4 + rnd() * 0.8, 0, Math.PI * 2); g.fill();
      }
    }
    // Snow lying on the ground: a white cover with drifts, blue in their hollows; the river
    // still runs through it and the roads are cleared on top of it.
    if (wk === 'snow') {
      g.fillStyle = 'rgba(246, 248, 252, 0.86)';
      g.fillRect(X0, plot * 0.8, WW, h - plot * 0.8);
      const sr = rng(29);
      for (let i = 0, n = Math.round(WW * h / 9000); i < n; i++) {
        const x = X0 + sr() * WW, y = plot * 0.95 + sr() * (h - plot * 0.95), rx = plot * (0.25 + sr() * 0.6), ry = rx * (0.22 + sr() * 0.12);
        const d = g.createRadialGradient(0, 0, 0, 0, 0, 1);
        d.addColorStop(0, sr() < 0.5 ? 'rgba(200, 214, 232, 0.35)' : 'rgba(255, 255, 255, 0.6)'); d.addColorStop(1, 'rgba(255, 255, 255, 0)');
        g.save(); g.translate(x, y); g.scale(rx, ry); g.fillStyle = d; g.fillRect(-1, -1, 2, 2); g.restore();
      }
    }
    // The river comes out from under the foothills: banks, then water with a paler line down its
    // middle; a city's river runs between stone.
    const out = river.filter(q => q.y > plot * 0.86);
    strokeLine(g, out, urban(e) ? '#8b887d' : '#c7b27a', riverWidth() + plot * 0.07);
    strokeLine(g, out, '#3c86bd', riverWidth());
    strokeLine(g, out, 'rgba(160, 215, 240, 0.35)', riverWidth() * 0.34);
    // The sea: a beach round it (a city's: stone), the water, paler where it is shallow.
    strokeLine(g, SHORE, urban(e) ? '#8b887d' : '#c7b27a', 44);
    g.save();
    g.beginPath(); g.moveTo(-PAD, MAP_H); for (const q of SHORE) g.lineTo(q.x, q.y); g.closePath();
    g.fillStyle = '#3a82b9'; g.fill(); g.clip();
    strokeLine(g, SHORE, 'rgba(160, 215, 240, 0.35)', 60);
    strokeLine(g, SHORE, 'rgba(190, 230, 245, 0.3)', 26);
    g.restore();
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
    const free = (x, y, s) => !road.some(p => Math.hypot(p.x - x, p.y - y) < clear) && riverGap(x, y) > riverWidth() / 2 + s * 0.2 && !((e[1] === 'City' || e[1] === 'Town') && onWall(x, y))
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
        if (bayGap(x, y) < 20) continue;
        const fill = g.createLinearGradient(0, y - hh, 0, y);
        if (weatherDrawn === 'snow') { fill.addColorStop(0, '#ffffff'); fill.addColorStop(1, '#e6ecf3'); }
        else { fill.addColorStop(0, '#6a9659'); fill.addColorStop(1, e[2]); }
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
        if (pic && bayGap(x, y) > 25) woods.push([pic, x, y, kind === 'rock' ? 40 + rnd() * 25 : 60 + rnd() * 40]);
      }
    }
    // Where the animals live: tame ones near the buildings, wild ones anywhere on the grass.
    // Their own numbers, so that what was drawn before them (pictures still loading) does not
    // move them from one draw to the next.
    herd = [];
    const pr = rng(41);
    const {pens = [], loose: wild = []} = HERDS[e[1]] || {}, loose = [...wild], pensMade = [];
    rails = [];
    for (const group of pens) {
      let pen = null;
      // Near a building if there is room, else anywhere on the grass (outside a city's wall too).
      const probe = [];
      for (let a = 0; a <= 1; a += 0.25) for (let b = 0; b <= 1; b += 0.25) probe.push([a, b]);
      const n = urban(e) ? 3 : 4, taken = (q) => pensMade.some(o => penHas(o, q.x, q.y, plot * 0.4));
      for (let t = 0; t < 400 && !pen && placed.length; t++) {
        const near = placed[Math.floor(pr() * placed.length)];
        // Then out on the land beyond the sides, high enough on the map to be in view there.
        const fy = plot * 1.6 + pr() * plot * 3.5, out = beyond(fy) * 0.7 - PEN_W * n / 2;
        const c = t < 200 ? {x: near.x + (pr() - 0.5) * plot * 4, y: near.y + (pr() - 0.3) * plot * 2, n}
          : {x: pr() < 0.5 ? -pr() * Math.max(0, out) : w + pr() * Math.max(0, out), y: fy, n};
        if (probe.every(([a, b]) => { const q = inPen(c, a, b); const edge = t < 200 ? -plot * 0.4 : beyond(q.y) * 0.7;   // in view
          return q.x > -edge && q.x < w + edge && free(q.x, q.y, 30) && !taken(q); })) pen = c;
      }
      if (!pen) { loose.push(...group); continue; }      // no room: they roam instead
      pensMade.push(pen);
      // Its four sides, as lines of posts on the ground (drawn after the warp, so they follow it).
      const line = (k, f) => Array.from({length: k + 1}, (_, i) => inPen(pen, ...f(i / k))), across = pen.n * 2, deep = pen.n;
      rails.push(line(across, t => [t, 0]), line(deep, t => [0, t]), line(deep, t => [1, t]), Object.assign(line(across, t => [t, 1]), {front: true}));
      group.forEach((kind, i) => { const q = inPen(pen, 0.25 + pr() * 0.5, 0.25 + pr() * 0.5); herd.push({kind, x: q.x, y: q.y, pen}); });
    }
    // Nothing grows in a paddock: the woods placed before it are cleared out of it.
    const inside = (x, y) => pensMade.some(o => penHas(o, x, y, 8));
    for (let i = woods.length - 1; i >= 0; i--) if (inside(woods[i][1], woods[i][2])) woods.splice(i, 1);
    for (const kind of loose) {
      for (let t = 0; t < 40; t++) {
        const near = !WILD.has(kind) && placed.length ? placed[Math.floor(pr() * placed.length)] : null;
        const x = near ? near.x + (pr() - 0.5) * plot * 2.4 : plot * 0.6 + pr() * (w - plot * 1.2);
        const y = near ? near.y + (pr() - 0.2) * plot * 0.9 : plot * 1.3 + pr() * (h - plot * 1.6);
        if (free(x, y, 50)) { herd.push({kind, x, y}); break; }
      }
    }
    // A landing on the river nearest the plaza, from a village on: a wooden pier out from the
    // bank, a rowboat tied to it, and from a town a ship too (a metropolis: a speedboat, a tug). Then the boats that come and go.
    fleet = []; docks = []; wharf = [];
    if (e[1] !== 'Tribe') {
      const br = rng(53), side = (i, d) => { const a = river[Math.max(0, i - 1)], b = river[Math.min(river.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return [-(b.y - a.y) / l * d, (b.x - a.x) / l * d]; };
      let best = null;
      for (let i = 3; i < river.length - 3; i++) {
        const q = river[i];
        if (q.y < plot * 2 || q.y > h - plot * 1.2) continue;
        for (const way of [-1, 1]) {
          const [nx, ny] = side(i, way * (riverWidth() / 2 + plot * 0.25)), land = {x: q.x + nx, y: q.y + ny};
          // A city's quay is its bank road: there only no building may be in the way.
          if (!(urban(e) ? riverGap(land.x, land.y) > riverWidth() / 2 : free(land.x, land.y, 40)) || placed.some(p => Math.hypot(p.x - land.x, (p.y - land.y) / KY) < plot * 0.7)) continue;
          const d = groundGap(land, PLAZA);
          if (!best || d < best.d) best = {i, way, d};
        }
      }
      if (best) {
        const q = river[best.i], [ox, oy] = side(best.i, best.way), [tx, ty] = side(best.i, 1), along = [ty, -tx];
        const at = (o, a) => ({x: q.x + ox * o + along[0] * a, y: q.y + oy * o + along[1] * a});
        // The pier: planks from the bank to the middle of the water, on two posts.
        const W = 9, ends = [at(riverWidth() / 2 + 16, 0), at(-2, 0)];
        g.save(); g.lineCap = 'butt';
        g.strokeStyle = '#4f3a24'; g.lineWidth = W * 2 + 4; g.beginPath(); g.moveTo(ends[0].x, ends[0].y); g.lineTo(ends[1].x, ends[1].y); g.stroke();
        g.strokeStyle = '#a57c4c'; g.lineWidth = W * 2; g.stroke();
        g.strokeStyle = 'rgba(60, 40, 20, 0.5)'; g.lineWidth = 1; g.setLineDash([1.5, 5]); g.lineWidth = W * 2; g.stroke(); g.setLineDash([]);
        g.restore();
        const boat = (name, o, a, sz, flip) => { const p = at(o, a); if (img[name]) woods.push([img[name], p.x, p.y, sz, flip]); };
        boat(metro(e) ? 'boat-speed' : 'rowboat', 2, -16, plot * 0.55, false);
        if (e[1] !== 'Village') boat(metro(e) ? 'boat-tug' : 'ship-moored', -2, 26, plot * (metro(e) ? 0.75 : 0.95), best.way < 0);
      }
      // The harbour on the sea: a wharf along the shore, piers out from it on posts, goods
      // stacked on it and boats tied up. A village's is planks: a wharf on posts, rowboats and
      // fishing boats. From a town it is stone (a metropolis: concrete), a wall above the water
      // with bollards along its edge, crates and barrels on it, a warehouse behind it and a
      // ship at a pier (from a city two). A metropolis's boats are modern: an ocean liner, a
      // container ship, tugs and speedboats; its goods are containers.
      const wood = e[1] === 'Village', m = metro(e), [edge, top] = wood ? ['#4f3a24', '#a57c4c'] : m ? ['#4a4c4f', '#9c9e9c'] : ['#4f4b44', '#9a948a'];
      const quay = SHORE.filter(q => q.x > BAY.rx * 0.16 && q.x < BAY.rx * 0.91);
      const along = (line, i) => { const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return [(b.x - a.x) / l, (b.y - a.y) / l]; };
      const out = d => quay.map((q, i) => { const [tx, ty] = along(quay, i); return {x: q.x - ty * d, y: q.y + tx * d}; });   // d out over the water
      const post = (p, r, color) => { g.fillStyle = color; g.beginPath(); g.ellipse(p.x, p.y, r, r * KY, 0, 0, Math.PI * 2); g.fill(); };
      // Its side over the water, stood up after the warp (drawWharf): a stone wall down to the
      // water (a metropolis: concrete); a village's, planks on posts.
      const kind = wood ? 'wood' : m ? 'concrete' : 'stone';
      wharf.push({line: out(19), side: 1, kind});
      strokeLine(g, quay, edge, 38); strokeLine(g, quay, top, 31);
      g.setLineDash(wood ? [1.5, 6] : [1.5, 14]); strokeLine(g, quay, wood ? 'rgba(60, 40, 20, 0.45)' : 'rgba(40, 38, 34, 0.35)', 31, 'butt'); g.setLineDash([]);
      if (!wood) out(11).forEach((p, i) => { if (i % 4 === 2) post(p, 2.6, '#2b2a28'); });
      // Small boats lie low with the trees; the ships, goods and warehouse stand in turn with
      // the buildings and the wall, so that what is nearer hides what is behind it.
      const shed = e[1] === 'City' ? 'med-warehouse' : e[1] === 'Town' ? 'warehouse' : null, from = shed ? 0.22 : 0, span = f => from + (1 - from) * f;
      const piers = {Village: 2, Town: 3}[e[1]] || 4, put = (name, p, sz, flip) => { if (img[name]) woods.push([img[name], p.x, p.y, sz, flip]); };
      const stand = (kind, p, sz, flip, house = false) => { if (img[kind]) docks.push({x: p.x, y: p.y, flip, b: {prop: true, kind, house, scale: house ? undefined : sz / (plot * 1.5)}}); };
      for (let k = 0; k < piers; k++) {
        const i = Math.round(span((k + 0.5) / piers) * (quay.length - 1)), q = quay[i], [tx, ty] = along(quay, i);
        const at = (o, s) => ({x: q.x - ty * o + tx * s, y: q.y + tx * o + ty * s});
        // The pier: planks (a metropolis: concrete) on posts, two rows of them.
        strokeLine(g, [at(10, 0), at(104, 0)], 'rgba(10, 30, 45, 0.3)', 26, 'butt');
        strokeLine(g, [at(0, 0), at(100, 0)], m ? edge : '#4f3a24', 24, 'butt'); strokeLine(g, [at(0, 0), at(98, 0)], m ? top : '#a57c4c', 19, 'butt');
        if (!m) { g.setLineDash([1.5, 5]); strokeLine(g, [at(0, 0), at(98, 0)], 'rgba(60, 40, 20, 0.4)', 19, 'butt'); g.setLineDash([]); }
        for (const [a, b, side] of [[at(0, 12), at(100, 12), -1], [at(0, -12), at(100, -12), 1], [at(100, -12), at(100, 12), 1]])
          wharf.push({line: [a, b], side, kind: m ? 'concrete' : 'wood'});
        const ship = !wood && (k === 1 || (urban(e) && k === 3));
        if (ship) stand(m ? (k === 1 ? 'ship-liner' : 'ship-cargo') : 'ship-moored', at(70, 34), plot * 0.95, k === 3);
        else put(m ? 'boat-tug' : 'fishing-boat', at(60, 30), plot * 0.75, k % 2 === 0);
        put(m ? 'boat-speed' : 'rowboat', at(45, -28), plot * 0.62, k % 2 === 1);
      }
      // Goods on the wharf between the piers.
      for (let k = 0; k < piers - (wood ? 1 : 0); k++) {
        const i = Math.round(span((k + (wood ? 1 : k < piers - 1 ? 1 : 0.15)) / piers) * (quay.length - 1)), q = quay[Math.min(quay.length - 1, i)], [tx, ty] = along(quay, i);
        stand(m ? 'dock-cargo' : k % 2 ? 'dock-goods' : 'dock-goods-b', {x: q.x + tx * 18, y: q.y + ty * 18}, plot * 0.8, k % 2 === 1);
      }
      // A warehouse at the wharf's end, out on a platform over the water, as a dock's shed is.
      if (shed) {
        const i = Math.round(0.09 * (quay.length - 1)), q = quay[i], [tx, ty] = along(quay, i);
        const at = (o, s) => ({x: q.x - ty * o + tx * s, y: q.y + tx * o + ty * s}), deck = [at(0, -62), at(0, 62), at(96, 62), at(96, -62)];
        const shape = () => { g.beginPath(); deck.forEach((p, k) => (k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };
        shape(); g.lineWidth = 6; g.strokeStyle = edge; g.stroke(); g.fillStyle = top; g.fill();
        g.setLineDash([1.5, 14]); strokeLine(g, [at(48, -60), at(48, 60)], 'rgba(40, 38, 34, 0.35)', 92, 'butt'); g.setLineDash([]);
        for (let s = -48; s <= 48; s += 32) post(at(92, s), 2.6, '#2b2a28');
        for (const [a, b, side] of [[at(96, -62), at(96, 62), 1], [at(0, 62), at(96, 62), -1], [at(0, -62), at(96, -62), 1]]) wharf.push({line: [a, b], side, kind: 'stone'});
        stand(shed, at(50, 0), 0, tx < 0, true);
      }
      // Rowboats on the river (a modern one or two in a metropolis), going up and down.
      for (let k = 0, n = metro(e) ? 3 : e[1] === 'Village' ? 1 : 2; k < n; k++)
        fleet.push({row: metro(e) ? [2, 3, 0][k] : k % 2, at: 0.15 + br() * 0.7, way: br() < 0.5 ? 1 : -1, lane: (br() - 0.5) * 0.4});
    }
    // And inside the map, a fringe of trees along both sides wherever there is room.
    for (let i = 0, n = Math.round(h / 40); i < n; i++) {
      const y = plot * 1.0 + rnd() * (h - plot * 1.0), d = rnd() * plot * 0.7, x = rnd() < 0.5 ? d : w - d;
      const kind = rnd() < 0.15 ? 'rock' : rnd() < 0.7 ? 'tree' : 'tree-autumn', sz = 58 + rnd() * 34;
      if (!inside(x, y)) tree(kind, x, y, sz);
    }
  }


  // The wharf's sides over the water, after the warp: each stretch that faces the camera
  // drops from the edge to the water, so the wharf stands above it. Stone in courses, wet at
  // the foot (a metropolis's concrete plain); a wooden one is the planks' edge on posts.
  // Lit from the left, as the pictures are.
  function drawWharf(g) {
    for (const {line, side, kind} of wharf) {
      const wood = kind === 'wood', h = wood ? 15 : 17;
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = -(b.y - a.y) / l * side, ny = (b.x - a.x) / l * side;
        if (ny < 0.05) continue;                                    // it faces away
        const [AX, AY] = warp(a.x, a.y), [BX, BY] = warp(b.x, b.y), ha = h * depth(a.y), hb = h * depth(b.y);
        const lit = Math.max(0, -nx) * 22;
        const quad = (t0, t1, color) => { g.fillStyle = color; g.beginPath(); g.moveTo(AX, AY + ha * t0); g.lineTo(BX, BY + hb * t0); g.lineTo(BX, BY + hb * t1); g.lineTo(AX, AY + ha * t1); g.closePath(); g.fill(); };
        quad(1, 1.5, 'rgba(10, 30, 45, 0.25)');                     // its shadow on the water
        if (wood) {
          quad(0, 0.3, `rgb(${84 + lit}, ${60 + lit}, ${36 + lit})`);
          g.strokeStyle = '#3a2a18';
          for (let t = 0; t < 1; t += 26 / l) {
            const X = AX + (BX - AX) * t, Y = AY + (BY - AY) * t, hh = ha + (hb - ha) * t;
            g.lineWidth = Math.max(1.5, hh * 0.22); g.beginPath(); g.moveTo(X, Y); g.lineTo(X, Y + hh); g.stroke();
          }
          continue;
        }
        const [r, gr, bl] = kind === 'concrete' ? [128, 130, 130] : [118, 108, 92];
        quad(0, 1, `rgb(${r + lit}, ${gr + lit}, ${bl + lit})`);
        quad(0, 0.12, 'rgba(255, 255, 255, 0.18)');                 // the coping
        quad(0.72, 1, 'rgba(25, 40, 35, 0.45)');                    // wet, green at the foot
        if (kind === 'stone') {
          g.strokeStyle = 'rgba(40, 34, 28, 0.35)'; g.lineWidth = 0.8;
          for (const t of [0.12, 0.42, 0.72]) { g.beginPath(); g.moveTo(AX, AY + ha * t); g.lineTo(BX, BY + hb * t); g.stroke(); }
        }
      }
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
      const o = c.getContext('2d', SOFT);
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
    bare = !ready;
    weatherDrawn = weatherNow().kind;
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
    flat = keep(flat);
    flat.width = Math.round((w + 2 * PAD) * res); flat.height = Math.round((h + PADY) * res);
    let g = flat.getContext('2d', SOFT);
    g.setTransform(res, 0, 0, res, PAD * res, PADY * res);
    g.fillStyle = e[2];
    g.fillRect(-PAD, -PADY, w + 2 * PAD, h + PADY);
    flatFilled = pixel(flat);                 // for the report: the ground colour should be there now
    land(g, w, h, e);
    const {lamps: allLamps, edges} = roads(g, placed, e);
    ways = edges.length ? waysOf(edges) : null;
    // A town's palisade, a city's wall, what is left of it in a metropolis.
    const wallStyle = {Town: 'wood', City: 'stone', Metropolis: 'ruin', Megacity: 'ruin'}[e[1]];
    wallLine = wallStyle ? wallOutline(placed) : null;
    const lamps = allLamps.filter(l => riverGap(l.x, l.y) > riverWidth() / 2 + plot * 0.04 && !(e[1] === 'City' && onWall(l.x, l.y)));
    lampCount = lamps.length;
    bridges(g, edges, e);
    const trees = urban(e) ? streetTrees(edges, placed, lamps, e, w, h).filter(t => !(e[1] === 'City' && onWall(t.x, t.y))) : [];
    if (e[1] === 'City') trees.push(...plazaEdge(edges, placed, lamps, trees));
    plazaCount = trees.filter(t => t.b.house).length;
    const ramparts = wallLine ? cityWall(edges, wallLine, wallStyle) : [];
    const woods = [];
    scenery(g, w, h, placed, plot, e, edges, woods);
    // The ground is done: warp it, then stand everything upright on it. Each thing is drawn
    // flat about its ground point, moved and sized there, so its walls stay straight up.
    bg = keep(bg);
    warpCanvas(flat, res, bg, res);
    // The flat world is not needed again until the next picture: its memory back (for the
    // report, the colour at its middle first).
    flatSeen = `${flat.width}x${flat.height} ${pixel(flat)}`;
    flat.width = flat.height = 0;
    reportDue = true;
    g = bg.getContext('2d', SOFT);
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
    // The season on the grass: golden in autumn, dull in winter, fresher in spring.
    const tone = {spring: 'rgba(170, 230, 120, 0.08)', autumn: 'rgba(200, 150, 50, 0.16)', winter: 'rgba(150, 160, 150, 0.18)'}[seasonNow()];
    if (tone) { g.fillStyle = tone; g.fillRect(0, Y_H - plot * 0.3, MAP_W, MAP_H); }
    // The weather on the ground: wet and darker in rain, white under snow.
    const wet = {rain: [30, 45, 65, 0.2], snow: [240, 244, 250, 0.3]}[weatherDrawn];
    if (wet) {
      const [r, gr, b, a] = wet, top = Y_H - plot * 0.45, fade = g.createLinearGradient(0, top, 0, Y_H + plot * 0.1);
      fade.addColorStop(0, `rgba(${r}, ${gr}, ${b}, 0)`); fade.addColorStop(1, `rgba(${r}, ${gr}, ${b}, ${a})`);
      g.fillStyle = fade; g.fillRect(0, top, MAP_W, MAP_H - top);
    }
    fences(g);
    // The paddocks' front fences again, on a layer of their own over the people and animals,
    // so an animal in a paddock is behind its front fence.
    frontFence = null;
    if (rails.length) {
      frontFence = document.createElement('canvas');
      frontFence.width = bg.width; frontFence.height = bg.height;
      const f = frontFence.getContext('2d', SOFT);
      f.setTransform(res, 0, 0, res, 0, 0);
      fences(f, true);
    }
    drawWharf(g);
    for (const [pic, x, y, sz, flip] of woods) onGround(g, x, y, () => castShadow(g, pic, x, y, sz, flip));
    for (const [pic, x, y, sz, flip] of woods.sort((a, c) => a[2] - c[2])) onGround(g, x, y, () => put(g, seasonal(pic, x, y), x, y, sz, flip));
    spots = [];
    tags = [];
    litList = [];
    g.textAlign = 'center';
    fronts = [];
    // Each thing that stands up, again, for tick(): its shape over a person walking behind it.
    const front = (cx, ground, r, h, paint) => {
      const [X, Y] = warp(cx, ground), m = depth(ground);
      fronts.push({y: ground, x0: X - r * m, x1: X + r * m, y0: Y - h * m, y1: Y + plot * 0.1 * m, paint});
    };
    const standing = (cx, ground, fn) => g2 => { const [X, Y] = warp(cx, ground), m = depth(ground); g2.save(); g2.translate(X, Y); g2.scale(m, m); g2.translate(-cx, -ground); fn(g2); g2.restore(); };
    // Back to front, so a building lower on the screen stands in front of one above it.
    for (const {x: cx, y: ground, b, flip} of [...placed, ...lamps, ...trees, ...ramparts, ...docks].sort((a, c) => a.y - c.y)) {
      if (b.wall) { b.draw(g); front(cx, ground, plot * 0.9, plot * 1.3, b.draw); continue; }        // a stretch of the city wall, or one of its towers
      const [GX, GY] = warp(cx, ground), gm = depth(ground);
      g.save(); g.translate(GX, GY); g.scale(gm, gm); g.translate(-cx, -ground);
      try {
      if (b.prop) {
        const s = plot * 1.5 * (b.scale || scaleOf(b.kind)) * (b.house ? DECOR_SIZE : 1);
        castShadow(g, img[b.kind], cx, ground, s, flip);
        const pk = /^tree/.test(b.kind) ? seasonal(img[b.kind], cx, ground) : img[b.kind];
        if (pk) { put(g, pk, cx, ground, s, flip); front(cx, ground, s / 2, s * ANCHOR, standing(cx, ground, g2 => put(g2, pk, cx, ground, s, flip))); }
        if (urban(e)) litList.push([b.kind, cx, ground, s, flip, cx, ground]);
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
        if (urban(e)) litList.push([k, cx + side * plot * 0.5 * big, ground - plot * 0.2 * big, ks, flip, cx, ground]);
      });
      const building = (b.status === 'busy' || b.status === 'running') && b.kind !== 'meeting';
      if (building) scaffold(g, cx, ground, level, false);
      if (pic) put(g, pic, cx, ground, s, flip);
      if (building) scaffold(g, cx, ground, level, true);
      if (pic) front(cx, ground, Math.max(s / 2, plot * 0.75 * big), s * ANCHOR, standing(cx, ground, g2 => {
        if (b.kind !== 'meeting' && b.status !== 'ended') yard(e, level, b.id).forEach((k, i) => {
          if (!img[k]) return;
          const side = (i ? 1 : -1) * (flip ? -1 : 1), ks = plot * 1.5 * scaleOf(k) * big * (YARD_SIZE[k.replace(/^med-/, '')] || 0.55);
          put(g2, img[k], cx + side * plot * 0.5 * big, ground - plot * 0.2 * big, ks, flip);
        });
        put(g2, pic, cx, ground, s, flip);
      }));
      if (urban(e)) litList.push([level, cx, ground, s, flip, cx, ground, b.status === 'hibernating']);   // asleep: its windows dark
      const top = ground - s * (ANCHOR - TOP[level]);
      tags.push({cx, ground, top, b});
      // Where a click finds it, in the warped picture.
      const [hx, hy, hw, hh] = warpBox([cx - plot / 2 * big, ground - plot * 0.9 * big, plot * big, plot * 0.9 * big]);
      spots.unshift({x: hx, y: hy, w: hw, h: hh + (plot * 0.2 * big) * depth(ground) + 34, b});
      } finally { g.restore(); }
    }
    // And over everything: grey under cloud and rain, white with fog (thicker far off).
    if (weatherDrawn === 'fog') {
      const f = g.createLinearGradient(0, 0, 0, MAP_H);
      f.addColorStop(0, 'rgba(226, 230, 235, 0.6)'); f.addColorStop(0.35, 'rgba(226, 230, 235, 0.35)'); f.addColorStop(1, 'rgba(226, 230, 235, 0.15)');
      g.fillStyle = f; g.fillRect(0, 0, MAP_W, MAP_H);
    } else {
      const tint = {cloudy: 'rgba(60, 70, 85, 0.12)', rain: 'rgba(40, 50, 70, 0.22)', snow: 'rgba(225, 232, 242, 0.12)'}[weatherDrawn];
      if (tint) { g.fillStyle = tint; g.fillRect(0, 0, MAP_W, MAP_H); }
    }
    // What is lit at night: each building with someone in it, the fires, the lanterns.
    lights = [...placed.filter(p => !p.b.prop && p.b.status !== 'ended' && p.b.status !== 'hibernating').map(p => ({x: p.x, y: p.y - plot * 0.1, r: plot * (p.b.kind === 'meeting' ? 0.95 : 0.8)})),
              ...[...lamps, ...trees].filter(l => /^(lantern|lamp)/.test(l.b.kind)).map(l => {
                // A city's lantern hangs out to one side of its post, a metropolis's lamp over the road.
                const side = (l.flip ? -1 : 1) * plot * (l.b.kind === 'lantern-post' ? 0.13 : 0.18);
                return {x: l.x + side, y: l.y, r: plot * 0.5, lamp: true, head: plot * (l.b.kind === 'lantern-post' ? 0.36 : 0.58)};
              })];
    // What the view must hold: the buildings (their roofs too), and every paddock's four
    // corners. From the highest roof down, not from the mountains: the camp fills the window,
    // with little sky.
    const pens = [...new Set(herd.filter(a => a.pen).map(a => a.pen))];
    const pts = [...placed.map(p => warp(p.x, p.y)), ...pens.flatMap(pen => [[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b]) => { const q = inPen(pen, a, b); return warp(q.x, q.y); }))];
    const xs = pts.map(q => q[0]);
    const left = Math.max(0, Math.min(...xs, MAP_W * 0.3) - plot * 0.9), right = Math.min(MAP_W, Math.max(...xs, MAP_W * 0.7) + plot * 0.9);
    const wasFit = !zoom || zoom - fitZoom() < 0.001;
    const bottom = Math.min(MAP_H, Math.max(...placed.map(p => warp(p.x, p.y)[1])) + plot * 0.55);
    const fitTop = Math.max(SKY_TOP, Math.min(...pts.map(q => q[1])) - plot * 1.3);
    FIT = {x: left, y: fitTop, w: right - left, h: bottom - fitTop};
    if (wasFit && zoom) zoom = fitZoom();      // still all the way out
    eraNow = e;
    eraCheck(e);
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
  // All the way out it fills the window's height with the camp, leaving up to a quarter of
  // its width out at the sides (half each side) rather than show sky above it.
  function fitZoom() { return Math.min(viewW / (FIT.w * 0.75), viewH / FIT.h); }
  // Within the map; a map smaller than the window sits in its middle.
  function clampView() {
    const fit = fitZoom();
    zoom = Math.max(fit, Math.min(ZOOM_MAX, zoom || fit));
    if (zoom - fit < 0.001) {             // all the way out: FIT in the middle, but not past the map's edge
      const vw = viewW / zoom, vh = viewH / zoom, keep = (o, v, M) => (v >= M ? (M - v) / 2 : Math.max(0, Math.min(M - v, o)));
      // Taller than the map from the sky's top down: the bottom at the map's, more sky above.
      ox = keep(FIT.x + (FIT.w - vw) / 2, vw, MAP_W);
      oy = vh >= MAP_H - SKY_TOP ? MAP_H - vh : SKY_TOP + keep(FIT.y - SKY_TOP + (FIT.h - vh) / 2, vh, MAP_H - SKY_TOP);
      return;
    }
    ox = MAP_W * zoom <= viewW ? -(viewW / zoom - MAP_W) / 2 : Math.max(0, Math.min(MAP_W - viewW / zoom, ox));
    const MH = MAP_H - SKY_TOP;
    oy = MH * zoom <= viewH ? MAP_H - viewH / zoom : Math.max(SKY_TOP, Math.min(MAP_H - viewH / zoom, oy));
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
  let lostAt = 0;
  function compose() {
    if (!bg) return;
    // The picture's canvas lost since it was drawn: draw it all again on a new one (not more
    // than once in 5 seconds, should the new one be lost too).
    if (bg.getContext('2d', SOFT).isContextLost?.() && Date.now() - lostAt > 5000) { lostAt = Date.now(); bg = null; update(true); return; }
    measure();
    if (viewW <= 0 || viewH <= 0) return;
    clampView();
    dpr = window.devicePixelRatio || 1;
    const cv = $('relax-canvas'), W = Math.round(viewW * dpr), H = Math.round(viewH * dpr);
    view = keep(view);
    if (view.width !== W || view.height !== H) {
      view.width = W; view.height = H;
      cv.width = W; cv.height = H;
      cv.style.width = viewW + 'px'; cv.style.height = viewH + 'px';
    }
    const v = view.getContext('2d'), k = dpr * zoom;
    v.setTransform(1, 0, 0, 1, 0, 0);
    v.fillStyle = '#3f6a3b';
    v.fillRect(0, 0, W, H);
    if (oy < SKY_TOP) { v.fillStyle = skyTop; v.fillRect(0, 0, W, Math.ceil((SKY_TOP - oy) * k) + 1); }
    v.imageSmoothingQuality = 'high';
    const fade = bgPrev ? weatherNow().t : 1;
    if (fade < 1) { v.drawImage(bgPrev, -ox * k, -oy * k, MAP_W * k, MAP_H * k); v.globalAlpha = fade; }
    v.drawImage(bg, -ox * k, -oy * k, MAP_W * k, MAP_H * k);
    v.globalAlpha = 1;
    const out = cv.getContext('2d');
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.drawImage(view, 0, 0);
    worldOn(out);
    for (const f of fires) onGround(out, f.x, f.y, () => flames(out, f));
    for (const p of [...people.values()].sort((a, c) => a.y - c.y)) { onGround(out, p.x, p.y, () => person(out, p)); hide(out, p, k); }
    frontOver(out, null);
    if (moving && moving.to) ghost(out, moving.to, moving.ok);
    drawTags();
    drawNight();
    if (reportDue) { reportDue = false; canvasReport(); }
  }
  // For ⚙ → Send feedback: the camp's canvases after each new picture, their sizes and the
  // colour at their middle (r,g,b,a; a blank one is 0,0,0,0), and whether the browser lost
  // one. One line, replaced each time.
  let reportDue = false, flatSeen = 'none', flatFilled = 'none';
  const pixel = c => { try { return c.getContext('2d', SOFT).getImageData(c.width >> 1, c.height >> 1, 1, 1).data.join(','); } catch (e) { return 'unreadable: ' + e.message; } };
  function canvasReport() {
    if (typeof amc === 'undefined' || !amc.errors) return;
    // Each canvas on its own: one that cannot be read (lost, or not readable) still leaves the others'.
    const one = (name, c) => {
      if (!c) return `${name} none`;
      try {
        const g = c.getContext('2d'), lost = g.isContextLost && g.isContextLost() ? ' LOST' : '';
        return `${name} ${c.width}x${c.height} ${g.getImageData(c.width >> 1, c.height >> 1, 1, 1).data.join(',')}${lost}`;
      } catch (e) { return `${name} ${c.width}x${c.height} unreadable: ${e.message}`; }
    };
    // A new canvas of each size, filled red and read back: does any off-screen canvas work here?
    const probe = (w, h) => {
      try {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d', SOFT); g.fillStyle = '#ff0000'; g.fillRect(0, 0, w, h);
        const px = pixel(c); c.width = c.height = 0;
        return px === '255,0,0,255' ? 'ok' : 'blank ' + px;
      } catch (e) { return 'unreadable: ' + e.message; }
    };
    const line = `relax canvases: flat after fill ${flatFilled}; flat ${flatSeen}; ${one('bg', bg)}; ${one('view', view)}; small ${probe(100, 100)}; big ${probe(5080, 2050)}; remade ${remade}; dpr ${window.devicePixelRatio} res ${res} zoom ${zoom.toFixed(2)}`;
    const i = amc.errors.findIndex(l => l.startsWith('relax canvases:'));
    if (i >= 0) amc.errors.splice(i, 1);
    amc.errors.push(line);
  }
  // Moving a building: where it would go, green if it can, red if not.
  function ghost(g, {x, y}, ok) {
    const [X, Y] = warp(x, y), m = depth(y), w = plot * 0.57 * m;
    g.save();
    g.fillStyle = ok ? 'rgba(120, 230, 120, 0.35)' : 'rgba(240, 90, 80, 0.35)';
    g.strokeStyle = ok ? 'rgba(60, 170, 60, 0.9)' : 'rgba(200, 50, 40, 0.9)'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(X, Y, w, w * 0.45, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.restore();
  }
  // The ground under a point of the warped picture (warp's other way).
  function unwarp(X, Y) {
    let lo = -PADY, hi = MAP_H + 200;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (warpY(mid) < Y) lo = mid; else hi = mid; }
    const y = (lo + hi) / 2;
    return {x: MAP_W / 2 + (X - MAP_W / 2) / depth(y), y};
  }
  // Can a session's building stand there: on the map, off the water, clear of the other sessions'.
  function canStand(id, x, y) {
    if (x < LEFT || x > RIGHT || y < LOW || y > HIGH || riverGap(x, y) < riverWidth() / 2 + plot * 0.3) return false;
    const r = room(x, y, false, 0.7);
    return !layoutMemo.some(q => !q.b.prop && q.b.id !== id && clash(r, q.r));
  }
  // The front fence over each animal in a paddock (only there, so a tree in front of the fence
  // keeps its place): of those whose box `hit` takes, or all of them.
  function frontOver(g, hit) {
    if (!frontFence) return;
    for (const p of people.values()) {
      if (!p.pen) continue;
      const b = warpBox(box(p));
      if (hit && !hit(b)) continue;
      const x = Math.max(0, b[0]), y = Math.max(0, b[1]), w = Math.min(MAP_W, b[0] + b[2]) - x, h = Math.min(MAP_H, b[1] + b[3]) - y;
      if (w > 0 && h > 0) g.drawImage(frontFence, x * res, y * res, w * res, h * res, x, y, w, h);
    }
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
    signs = [];
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
      signs.push({rect, b});
      // The name on a little wooden sign like the task board's, with the tool's colour as a
      // dot and the status under it (a hibernating one's in pale purple); an ended session's
    // sign is weathered grey, with no status.
      plank(g, rect, ended);
      g.fillStyle = TOOL_COLORS[b.tool] || TOOL_COLORS.claude;
      if (b.kind === 'meeting') { g.font = "12px 'DejaVu Sans Mono', Consolas, monospace"; g.fillText('⚖', x - nw / 2 - 5, y + 13);
                                  g.font = "bold 12px 'DejaVu Sans Mono', Consolas, monospace"; }
      else {
        g.beginPath(); g.arc(x - nw / 2 - 5, y + 9, 4, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(43, 26, 12, 0.7)'; g.lineWidth = 1; g.stroke();
      }
      g.fillStyle = ended ? '#3a3630' : '#2b1a0c';
      g.font = "bold 12px 'DejaVu Sans Mono', Consolas, monospace";   // badge() above changes it
      g.fillText(name, x + 4, y + 13);
      if (!ended && full) {
        g.font = "11px 'DejaVu Sans Mono', Consolas, monospace";
        g.fillStyle = b.status === 'hibernating' ? STATUS_COLORS.hibernating : '#4a3019';   // asleep: the HUD's sleep colour
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
    // A city's streets are cobbled (the medieval kit's stone), a little darker along their
    // edges; a village's dirt paths get a darker edge of their own.
    const city = e[1] === 'City', cobble = city && texture(g, 'tex-street');
    const layers = [[e[5] || (e[3] ? '#5f4a2f' : null), plot * 0.035], [cobble || e[3], 0]];
    if (city) layers.push(['rgba(40, 32, 24, 0.22)', 0], [cobble || e[3], -plot * 0.05]);
    for (const [color, extra] of layers) {
      if (!color) continue;
      g.strokeStyle = color;
      for (const {line, width} of edges) {
        g.lineWidth = Math.max(1, plot * (width || e[4]) + extra);
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
      g.fillStyle = metro(e) ? '#c9c5b8' : texture(g, 'tex-brick') || e[3];
      g.beginPath(); g.ellipse(PLAZA.x, PLAZA.y, 124, 73, 0, 0, Math.PI * 2); g.fill();
      if (!metro(e)) {                     // its flagstones worn darker towards the edge
        const rim = g.createRadialGradient(PLAZA.x, PLAZA.y, 0, PLAZA.x, PLAZA.y, 124);
        rim.addColorStop(0.55, 'rgba(40, 32, 24, 0)'); rim.addColorStop(1, 'rgba(40, 32, 24, 0.3)');
        g.save(); g.translate(PLAZA.x, PLAZA.y); g.scale(1, 73 / 124); g.translate(-PLAZA.x, -PLAZA.y);
        g.fillStyle = rim; g.beginPath(); g.arc(PLAZA.x, PLAZA.y, 124, 0, Math.PI * 2); g.fill(); g.restore();
      }
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
        lamps.push({x, y, flip: m.dy * way < 0, b: {prop: true, kind: !metro(e) ? 'lantern-post' : r.width >= 0.2 ? 'lamp-double' : 'lamp'}});
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
  // Round a city's plaza: a ring of town houses facing it, where the avenues leave room
  // between them, and on the plaza's edge market stalls, trees and lanterns. Not part of the
  // layout, so nobody's place changes for them; nothing on a road, a building or each other.
  function plazaEdge(edges, placed, lamps, trees) {
    const road = roadPoints(edges), out = [], near = (x, y, d) => road.some(p => Math.hypot(p.x - x, (p.y - y) / KY) < d);
    const taken = (x, y, d) => [...lamps, ...trees, ...out].some(q => Math.hypot(q.x - x, (q.y - y) / KY) < d);
    const onBuilding = (x, y, w) => placed.some(p => Math.abs(p.x - x) < plot * (0.5 + w) && y > p.y - plot * 0.5 && y < p.y + plot * 0.35);
    const HOUSES = ['med-a', 'med-c', 'med-e', 'med-b', 'med-g', 'med-d', 'med-f', 'med-h'];
    let h = 0;
    for (let i = 0; i < 48 && img['med-a']; i++) {
      const t = i / 48 * Math.PI * 2;
      // As near the plaza as there is room, between the streets.
      for (const k of [1, 1.12, 1.25, 1.4]) {
        const x = PLAZA.x + Math.cos(t) * 200 * k, y = PLAZA.y + Math.sin(t) * 120 * k;
        // A house's own ground (as the town's houses have) clear of the streets' paving.
        // Small town houses (the blocks by the plaza are small): 0.6 of a session's size.
        const half = plot * 0.36 * 0.6 + 9, onStreet = road.some(p => Math.abs(p.x - x) < half && p.y > y - plot * 0.15 - 9 && p.y < y + plot * 0.1 + 9);
        if (onStreet || onBuilding(x, y, 0.1) || out.some(q => Math.hypot(q.x - x, (q.y - y) / KY) < plot * 0.5) || onWall(x, y) || wet(x, y)) continue;
        out.push({x, y, flip: Math.cos(t) > 0, b: {prop: true, house: true, scale: 2 * 0.6 / DECOR_SIZE, kind: HOUSES[h++ % HOUSES.length]}});
        break;
      }
    }
    // The houses come first: a street lamp or tree on one's ground goes.
    const onHouse = q => out.some(o => Math.abs(o.x - q.x) < plot * 0.3 && q.y > o.y - plot * 0.25 && q.y < o.y + plot * 0.18);
    for (const list of [lamps, trees]) for (let i = list.length - 1; i >= 0; i--) if (onHouse(list[i])) list.splice(i, 1);
    const KINDS = ['stall', 'tree-city', 'lantern-post', 'stall-green', 'tree-city', 'lantern-post'];
    for (let i = 0; i < 20; i++) {
      const t = i / 20 * Math.PI * 2 + 0.08, x = PLAZA.x + Math.cos(t) * 150, y = PLAZA.y + Math.sin(t) * 89, kind = KINDS[i % KINDS.length];
      if (near(x, y, plot * 0.2) || onBuilding(x, y, 0) || taken(x, y, plot * 0.28)) continue;
      out.push({x, y, flip: Math.cos(t) > 0, b: {prop: true, kind, scale: kind === 'tree-city' ? 0.8 : undefined}});
    }
    return out;
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
  // A texture from the medieval kit as a pattern, or null before it has loaded.
  function texture(g, name) { return img[name] ? g.createPattern(img[name], 'repeat') : null; }
  // A city's wall: its outline, found between what stands so that nothing has to move. From the
  // plaza out, in each of 72 directions, a distance 260 to 900 on the ground, just out beyond the
  // buildings there and changing little from one direction to the next, where no
  // building's own ground is and the stretch to the next point clears them too (crossing one
  // only if there is no other way): the cheapest such ring, closed on itself. Then straightened: points dropped
  // while the straight run that is left still clears everything, so the wall has long runs and
  // corners. Kept until the buildings change.
  let outlineKey = '', outlineMemo = null, wallFree = () => true, wallSkipped = 0, wallPieces = 0;
  function wallOutline(placed) {
    const key = placed.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(';');
    if (key === outlineKey) return outlineMemo;
    // Where nothing may be, on a grid of 8.
    const C = 8, cols = Math.ceil(MAP_W / C), rows = Math.ceil(MAP_H / C), busy = new Uint8Array(cols * rows);
    // Each one's own ground (not the room kept above it, nor its name under it, which the
    // wall may pass behind): a session's building, a house, or a stall or fountain.
    for (const p of placed) {
      const [hw, up, down] = !p.b.prop ? [0.5, 0.34, 0.16] : p.b.house ? [0.36, 0.26, 0.12] : [0.26, 0.2, 0.1];
      const l = p.x - plot * hw, r = p.x + plot * hw, t = p.y - plot * up, b = p.y + plot * down;
      for (let y = Math.max(0, Math.floor(t / C)); y <= Math.min(rows - 1, Math.floor(b / C)); y++)
        for (let x = Math.max(0, Math.floor(l / C)); x <= Math.min(cols - 1, Math.floor(r / C)); x++) busy[y * cols + x] = 1;
    }
    const ok = q => q.x > 30 && q.x < MAP_W - 30 && q.y > plot * 1.25 && q.y < MAP_H - 30 && !busy[Math.floor(q.y / C) * cols + Math.floor(q.x / C)];
    // How much of a run is on something (0: none of it).
    const blocked = (a, b) => { const n = Math.ceil(Math.hypot(b.x - a.x, (b.y - a.y) / KY) / 6); let k = 0; for (let i = 0; i <= n; i++) if (!ok({x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n})) k++; return k; };
    const clearRun = (a, b) => !blocked(a, b);
    const A = 72, RS = [];
    for (let r = 260; r <= 900; r += 10) RS.push(r);
    const pt = (i, r) => { const t = i / A * Math.PI * 2; return {x: PLAZA.x + Math.cos(t) * r, y: PLAZA.y + Math.sin(t) * r * KY}; };
    // How far out it wants to be, in each direction: just beyond the buildings there, so most
    // are in town and the wall keeps close round them, not out in the fields. The farthest
    // of the heart's buildings (coreOf) within 35 degrees of the direction, plus 50; at least 320 (the
    // plaza and its first ring), at most 880.
    const own = coreOf(placed), dirAt = i => i / A * Math.PI * 2;
    const wantAt = i => {
      let w = 320;
      for (const p of own) {
        const t = Math.atan2((p.y - PLAZA.y) / KY, p.x - PLAZA.x), d = Math.abs(Math.atan2(Math.sin(t - dirAt(i)), Math.cos(t - dirAt(i))));
        if (d < 0.6) w = Math.max(w, groundGap(p, PLAZA) + 50);
      }
      return Math.min(880, w);
    };
    const wants = Array.from({length: A}, (_, i) => wantAt(i));
    const nodeAt = (i, k) => { const r = RS[k], w = wants[i % A]; return r < w ? (w - r) * 1.0 : (r - w) * 0.8; };
    const node = RS.map((_, k) => nodeAt(0, k));
    let best = null;
    // Closed on itself: try the start's few best distances, keep the cheapest ring.
    const starts = RS.map((r, k) => k).sort((a, b) => (ok(pt(0, RS[a])) ? 0 : 5000) + node[a] - (ok(pt(0, RS[b])) ? 0 : 5000) - node[b]).slice(0, 4);
    for (const k0 of starts) {
      let cost = RS.map((_, k) => (k === k0 ? 0 : Infinity)), from = [];
      for (let i = 1; i <= A; i++) {
        const next = RS.map(() => Infinity), back = RS.map(() => -1);
        for (let k = 0; k < RS.length; k++) {
          if (i === A && k !== k0) continue;
          // Only where nothing stands, if it can; else as little across it as it can.
          const q = pt(i % A, RS[k]);
          for (let j = Math.max(0, k - 15); j <= Math.min(RS.length - 1, k + 15); j++) {
            if (cost[j] === Infinity) continue;
            let c = cost[j] + Math.abs(RS[k] - RS[j]) * 1.2 + nodeAt(i, k);
            if (c >= next[k]) continue;
            c += blocked(pt(i - 1, RS[j]), q) * 5000;
            if (c < next[k]) { next[k] = c; back[k] = j; }
          }
        }
        from.push(back); cost = next;
      }
      if (cost[k0] < (best ? best.cost : Infinity)) {
        // Back from the end (direction A, the start again) to direction 1; from[i - 1] is step i's.
        const ks = [];
        for (let i = A, k = k0; i >= 2; i--) { k = from[i - 1][k]; ks.unshift(k); }
        ks.unshift(k0);
        best = {cost: cost[k0], pts: ks.map((k, i) => pt(i, RS[k]))};
      }
    }
    let line = best ? best.pts : null;
    // Straight runs: drop a point while the run from the one before to the one after clears.
    if (line) for (let changed = true; changed && line.length > 8;) {
      changed = false;
      for (let i = 0; i < line.length && line.length > 8; i++) {
        const a = line[(i - 1 + line.length) % line.length], b = line[(i + 1) % line.length];
        if (clearRun(a, b) && Math.hypot(b.x - a.x, (b.y - a.y) / KY) < 420) { line.splice(i, 1); changed = true; }
      }
    }
    outlineKey = key; outlineMemo = line; wallFree = ok;
    return line;
  }
  // The wall on that outline, standing up after the warp like the buildings: stretches of
  // stone with a walk and merlons along the top, a gate arch over each road, none over the
  // river (a tower on each bank), a gatehouse tower each side of an avenue, a round tower with a tiled roof at
  // each corner. Each stretch and tower is drawn in its place among the buildings, the side
  // facing the camera, lit from the left, with its shadow to the right.
  // style: 'stone' (a city), 'wood' (a town: a palisade of pointed stakes, no towers, its gates
  // only openings), 'ruin' (a metropolis: the old wall, a stretch here and there, broken down,
  // a few towers without their roofs).
  function cityWall(edges, outline, style = 'stone') {
    const wood = style === 'wood', ruin = style === 'ruin';
    const T = wood ? 3 : 8, H = wood ? 24 : 40, PIECE = 24, n = outline.length;
    let walked = 0;
    // How much of a ruined stretch stands, 0 to 1, from where it is along the wall: stretches
    // of about 120 standing, then gaps, so it reads as old wall kept in pieces.
    const standing = d => { const k = Math.floor(d / 120), r = rng(k * 9973 + 5)(); return r < 0.6 ? 0.55 + 0.45 * rng(Math.floor(d / 24) * 31 + 7)() : 0; };
    let skipped = 0;
    // The middle of the outline, and each point's way out from it (for which face shows).
    const mid = outline.reduce((a, q) => ({x: a.x + q.x / n, y: a.y + q.y / n}), {x: 0, y: 0});
    // Where roads and the river cross it: [x, y, half width, an avenue?].
    const gaps = [];
    const hit = (p, q, a, b) => {
      const d = (q.x - p.x) * (b.y - a.y) - (q.y - p.y) * (b.x - a.x);
      if (!d) return null;
      const t = ((a.x - p.x) * (b.y - a.y) - (a.y - p.y) * (b.x - a.x)) / d, u = ((a.x - p.x) * (q.y - p.y) - (a.y - p.y) * (q.x - p.x)) / d;
      return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? {x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t} : null;
    };
    const cross = (line, half, big) => {
      for (let i = 1; i < line.length; i++) for (let j = 0; j < n; j++) {
        const c = hit(line[i - 1], line[i], outline[j], outline[(j + 1) % n]);
        if (c && !gaps.some(g => Math.hypot(g[0] - c.x, (g[1] - c.y) / KY) < g[2] + half)) gaps.push([c.x, c.y, half, big]);
      }
    };
    for (const {line, width} of edges) cross(line, plot * width / 2 + 8, width >= 0.2);
    // The river: no wall over the water, a tower (a palisade: a post) on each bank instead.
    const wetAt = q => riverGap(q.x, q.y) < riverWidth() / 2 + 6, banks = [];
    // Each bank: walking round the outline in steps of 4, where it goes into or out of the water.
    for (let j = 0; j < n; j++) {
      const p = outline[j], q = outline[(j + 1) % n], s = Math.max(1, Math.round(Math.hypot(q.x - p.x, (q.y - p.y) / KY) / 4));
      for (let i = 0; i < s; i++) {
        const u = {x: p.x + (q.x - p.x) * i / s, y: p.y + (q.y - p.y) * i / s}, v = {x: p.x + (q.x - p.x) * (i + 1) / s, y: p.y + (q.y - p.y) * (i + 1) / s};
        if (wetAt(u) !== wetAt(v)) banks.push(wetAt(u) ? v : u);
      }
    }
    const gapAt = q => gaps.find(g => Math.hypot(g[0] - q.x, (g[1] - q.y) / KY) < g[2]);
    const items = [], brick = img['tex-brick'], roof = img['tex-roof'], pats = new Map();
    const pat = (g, im, none) => { if (!im) return none; if (!pats.has(g)) pats.set(g, [g.createPattern(brick, 'repeat'), roof && g.createPattern(roof, 'repeat')]); return pats.get(g)[im === brick ? 0 : 1] || none; };
    const lift = (q, h) => { const [X, Y] = warp(q.x, q.y); return [X, Y - h * depth(q.y)]; };
    const face = (g, P, light) => {
      g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); g.closePath();
      g.fillStyle = wood ? '#6e4c2c' : pat(g, brick, '#9b958a'); g.fill();
      g.fillStyle = light > 0 ? `rgba(255, 248, 230, ${0.12 * light})` : `rgba(20, 16, 12, ${0.38 * -light + 0.08})`; g.fill();
    };
    for (let j = 0; j < n; j++) {
      const p = outline[j], q = outline[(j + 1) % n], gx = q.x - p.x, gy = (q.y - p.y) / KY, len = Math.hypot(gx, gy) || 1;
      // Its normal on the ground, pointing out of the town.
      let nx = gy / len, ny = -gx / len;
      const mx = (p.x + q.x) / 2 - mid.x, my = ((p.y + q.y) / 2 - mid.y) / KY;
      if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
      const front = ny > 0, sx = (front ? nx : -nx) * T, sy = (front ? ny : -ny) * T * KY;    // the face seen
      const light = front ? -nx : nx;
      const k = Math.max(1, Math.round(len / PIECE));
      for (let i = 0; i < k; i++) {
        const f0 = i / k, f1 = (i + 1) / k, a0 = {x: p.x + (q.x - p.x) * f0, y: p.y + (q.y - p.y) * f0}, b0 = {x: p.x + (q.x - p.x) * f1, y: p.y + (q.y - p.y) * f1};
        const m = {x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2}, gap = gapAt(m);
        walked += len / k;
        const wet = wetAt(a0) || wetAt(b0) || wetAt(m);
        if (wet) continue;
        if (!wallFree(a0) || !wallFree(b0)) { skipped++; continue; }   // a building stands there: it is the wall
        // A ruin keeps its gates whole; the rest of it stands here and there.
        const left = ruin && !gap ? standing(walked) : 1;
        if (!left) continue;
        const a = {x: a0.x + sx, y: a0.y + sy}, b = {x: b0.x + sx, y: b0.y + sy}, ia = {x: a0.x - sx, y: a0.y - sy}, ib = {x: b0.x - sx, y: b0.y - sy};
        items.push({x: m.x, y: m.y + (front ? 4 : -4), b: {wall: true, draw: g => {
          const HH = H * left, low = gap ? H * 0.62 : 0, A = lift(a, low), B = lift(b, low), At = lift(a, HH), Bt = lift(b, HH);
          if (!gap) {
            const ha = HH * depth(a.y), hb = HH * depth(b.y), [ax, ay] = warp(a.x, a.y), [bx, by] = warp(b.x, b.y);
            g.fillStyle = 'rgba(12, 28, 12, 0.22)';
            g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(bx + 0.6 * hb, by - 0.25 * hb); g.lineTo(ax + 0.6 * ha, ay - 0.25 * ha); g.closePath(); g.fill();
          }
          if (wood && gap) {                   // a palisade's gate: a beam over the way in
            const k = 1.25, Ah = lift(a, H * k), Bh = lift(b, H * k), th = 4 * depth(m.y);
            g.fillStyle = light > 0 ? '#86613a' : '#5a3d22';
            g.beginPath(); g.moveTo(...Ah); g.lineTo(...Bh); g.lineTo(Bh[0], Bh[1] + th); g.lineTo(Ah[0], Ah[1] + th); g.closePath(); g.fill();
            return;
          }
          face(g, [A, B, Bt, At], light);
          if (wood) {                          // the stakes: a seam between each, a point on top
            const N = 4;
            g.strokeStyle = 'rgba(30, 18, 8, 0.5)'; g.lineWidth = 1;
            g.fillStyle = light > 0 ? '#86613a' : '#5a3d22';
            for (let s = 0; s < N; s++) {
              const f0 = s / N, f1 = (s + 1) / N, x0 = A[0] + (B[0] - A[0]) * f0, x1 = A[0] + (B[0] - A[0]) * f1;
              const t0 = At[1] + (Bt[1] - At[1]) * f0, t1 = At[1] + (Bt[1] - At[1]) * f1, b0 = A[1] + (B[1] - A[1]) * f0;
              g.beginPath(); g.moveTo(x0, b0); g.lineTo(x0, t0); g.stroke();
              g.beginPath(); g.moveTo(x0, t0); g.lineTo((x0 + x1) / 2, (t0 + t1) / 2 - 5 * depth(m.y)); g.lineTo(x1, t1); g.closePath(); g.fill();
            }
            return;
          }
          if (ruin && !gap) {                  // a broken top: no walk, no merlons, rubble at its foot
            g.fillStyle = 'rgba(120, 112, 100, 0.9)';
            g.beginPath(); g.moveTo(...At); g.lineTo((At[0] + Bt[0]) / 2, (At[1] + Bt[1]) / 2 - 4 * depth(m.y) * (left > 0.6 ? 1 : -1)); g.lineTo(...Bt); g.lineTo(Bt[0], Bt[1] + 3); g.lineTo(At[0], At[1] + 3); g.closePath(); g.fill();
            return;
          }
          if (gap) {
            g.fillStyle = 'rgba(20, 16, 12, 0.55)';
            g.beginPath(); g.moveTo(...A); g.lineTo(...B); g.lineTo(B[0], B[1] - 3 * depth(b.y)); g.lineTo(A[0], A[1] - 3 * depth(a.y)); g.closePath(); g.fill();
          }
          const Ia = lift(ia, H), Ib = lift(ib, H);
          g.fillStyle = '#7d776c'; g.beginPath(); g.moveTo(...At); g.lineTo(...Bt); g.lineTo(...Ib); g.lineTo(...Ia); g.closePath(); g.fill();
          const kk = 7 * depth(m.y), cx = (At[0] + Bt[0]) / 2, cy = (At[1] + Bt[1]) / 2, dx = (Bt[0] - At[0]) * 0.27, dy = (Bt[1] - At[1]) * 0.27;
          face(g, [[cx - dx, cy - dy], [cx + dx, cy + dy], [cx + dx, cy + dy - kk], [cx - dx, cy - dy - kk]], light);
        }}});
      }
    }
    // Towers: at each corner, and each side of an avenue's gate.
    const towers = [];
    if (wood) {                              // a palisade: a tall post each side of every gate
      const posts = [];
      for (const [gx, gy, half] of gaps) for (let j = 0; j < n; j++) {
        const p = outline[j], q = outline[(j + 1) % n], len = Math.hypot(q.x - p.x, (q.y - p.y) / KY) || 1;
        const t = ((gx - p.x) * (q.x - p.x) + (gy - p.y) / KY * (q.y - p.y) / KY) / (len * len);
        if (t < 0 || t > 1 || Math.hypot(p.x + (q.x - p.x) * t - gx, (p.y + (q.y - p.y) * t - gy) / KY) > 2) continue;
        for (const s of [-1, 1]) {
          const f = t + s * half / len;
          if (f <= 0 || f >= 1) continue;
          posts.push({x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f});
        }
      }
      for (const c of [...posts, ...banks]) {
          if (!wallFree(c)) continue;
          items.push({x: c.x, y: c.y + 6, b: {wall: true, draw: g => {
            const [X, Y] = warp(c.x, c.y), m = depth(c.y), w = 7 * m, h = H * 1.45 * m;
            g.fillStyle = 'rgba(12, 28, 12, 0.22)';
            g.beginPath(); g.moveTo(X - w / 2, Y); g.lineTo(X + w / 2, Y); g.lineTo(X + w / 2 + 0.6 * h, Y - 0.25 * h); g.lineTo(X - w / 2 + 0.6 * h, Y - 0.25 * h); g.closePath(); g.fill();
            g.fillStyle = '#86613a'; g.fillRect(X - w / 2, Y - h, w / 2, h);
            g.fillStyle = '#5a3d22'; g.fillRect(X, Y - h, w / 2, h);
            g.beginPath(); g.moveTo(X - w / 2, Y - h); g.lineTo(X, Y - h - w); g.lineTo(X + w / 2, Y - h); g.closePath(); g.fill();
          }}});
      }
      wallSkipped = skipped; wallPieces = items.length; return items;
    }
    for (let j = 0; j < n; j++) {
      const a = outline[(j - 1 + n) % n], c = outline[j], b = outline[(j + 1) % n];
      const t1 = Math.atan2((c.y - a.y) / KY, c.x - a.x), t2 = Math.atan2((b.y - c.y) / KY, b.x - c.x);
      if (Math.abs(Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1))) > 0.25 && !gapAt(c) && !wetAt(c)) towers.push([c, 1]);
    }
    for (const [gx, gy, half, big] of gaps) {
      if (!big) continue;
      // The two points on the outline either side of the gate.
      for (let j = 0; j < n; j++) {
        const p = outline[j], q = outline[(j + 1) % n], len = Math.hypot(q.x - p.x, (q.y - p.y) / KY) || 1;
        const t = ((gx - p.x) * (q.x - p.x) + (gy - p.y) / KY * (q.y - p.y) / KY) / (len * len);
        if (t < 0 || t > 1 || Math.hypot(p.x + (q.x - p.x) * t - gx, (p.y + (q.y - p.y) * t - gy) / KY) > 2) continue;
        for (const s of [-1, 1]) { const f = t + s * (half + 14) / len; if (f > 0 && f < 1) towers.push([{x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f}, 1.15]); }
      }
    }
    for (const c of banks) towers.push([c, 1.15]);
    wallSkipped = skipped; wallPieces = items.length;
    for (const [ti, [c, big]] of towers.entries()) {
      if (!wallFree(c)) continue;
      // A metropolis keeps its gatehouses whole, and one corner tower in two, unroofed.
      const broken = ruin && big === 1;
      if (broken && ti % 2) continue;
      const tall = broken ? 0.7 : 1;
      items.push({x: c.x, y: c.y + 12, b: {wall: true, draw: g => {
        const [X, Y] = warp(c.x, c.y), m = depth(c.y), w = 30 * big * m, h = H * 1.75 * big * m * tall, ry = w * 0.3;
        g.fillStyle = 'rgba(12, 28, 12, 0.22)';
        g.beginPath(); g.moveTo(X - w / 2, Y); g.lineTo(X + w / 2, Y); g.lineTo(X + w / 2 + 0.6 * h, Y - 0.25 * h); g.lineTo(X - w / 2 + 0.6 * h, Y - 0.25 * h); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(X - w / 2, Y - h); g.lineTo(X - w / 2, Y); g.ellipse(X, Y, w / 2, ry, 0, Math.PI, 0, true); g.lineTo(X + w / 2, Y - h); g.closePath();
        g.fillStyle = pat(g, brick, '#9b958a'); g.fill();
        const round = g.createLinearGradient(X - w / 2, 0, X + w / 2, 0);
        round.addColorStop(0, 'rgba(255, 248, 230, 0.16)'); round.addColorStop(0.35, 'rgba(255, 248, 230, 0)'); round.addColorStop(1, 'rgba(20, 16, 12, 0.45)');
        g.fillStyle = round; g.fill();
        g.fillStyle = 'rgba(20, 16, 12, 0.6)';
        g.fillRect(X - w * 0.08, Y - h * 0.62, w * 0.12, h * 0.16);
        if (broken) {                          // its broken top, open to the sky
          g.fillStyle = 'rgba(40, 34, 28, 0.75)'; g.beginPath(); g.ellipse(X, Y - h, w / 2, ry, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#9b958a'; g.fillRect(X - w / 2, Y - h - 5 * m, w * 0.22, 5 * m); g.fillRect(X + w * 0.1, Y - h - 3 * m, w * 0.3, 3 * m);
          return;
        }
        g.beginPath(); g.moveTo(X - w * 0.62, Y - h); g.lineTo(X, Y - h - w * 1.25); g.lineTo(X + w * 0.62, Y - h); g.ellipse(X, Y - h, w * 0.62, ry * 1.2, 0, 0, Math.PI); g.closePath();
        g.fillStyle = pat(g, roof, '#b5533a'); g.fill();
        const cone = g.createLinearGradient(X - w * 0.62, 0, X + w * 0.62, 0);
        cone.addColorStop(0, 'rgba(255, 240, 220, 0.12)'); cone.addColorStop(0.45, 'rgba(0, 0, 0, 0)'); cone.addColorStop(1, 'rgba(30, 10, 5, 0.42)');
        g.fillStyle = cone; g.fill();
      }}});
    }
    return items;
  }
  // Top left: what the camp is now, and how far the next one is.
  let eraNow = null;
  function eraLabel(g, e) {
    const next = ERAS[ERAS.indexOf(e) - 1];
    const text = `${ICON[e[1]]} ${named(e[1])} · ${camp} messages` + (next ? ` · ${named(next[1])} at ${next[0]}` : '') + ` · ${SEASON_ICON[seasonNow()]} ${seasonNow()} · ${WEATHER_ICON[weatherDrawn]} ${weatherDrawn}`;
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
  let wharf = [];                          // this draw's wharf sides: {line, side, h, kind}, stood up after the warp
  let docks = [];                          // this draw's harbour things that stand up (ships, goods, a warehouse), drawn in turn with the buildings
  let herd = [], fleet = [];   // fleet: this draw's boats on the river: {row, at (0 to 1 along it), way, lane}                            // this draw's animals: {kind, x, y}, x and y their home
  let rails = [], frontFence = null;        // this draw's paddock fences: lines of post points; the front ones' layer
  // A paddock's fence, after the warp: a post at each point, two rails between them, and their
  // shadow on the ground, all sized for how far away they stand. Back sides first.
  function fences(g, only) {
    const H = 22, W = p => warp(p.x, p.y), sorted = rails.filter(l => !only || l.front).sort((a, c) => (a[0].y + a[a.length - 1].y) - (c[0].y + c[c.length - 1].y));
    g.lineCap = 'round';
    for (const line of sorted) {
      const pts = line.map(p => { const [X, Y] = W(p), m = depth(p.y); return {X, Y, h: H * m, m}; });
      if (!only) {
      g.strokeStyle = 'rgba(12, 28, 12, 0.25)';
      g.beginPath();
      pts.forEach((q, i) => { const x = q.X + q.h * 0.35, y = q.Y - q.h * 0.15; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.lineWidth = 3 * pts[0].m; g.stroke();
      }
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
        if (p.mode !== 'walk') { p.x += x - p.home.x; p.y += y - p.home.y; }
        if (p.flip !== !!flip && p.mode !== 'walk') { p.mode = 'go'; p.goal = spot(p.want === 'rest' ? 'seat' : p.want, !!flip); }
        Object.assign(p, {home, tool: b.tool, status: b.status, flip: !!flip});
      } else {
        // A new person starts where its status puts it, already at it.
        const w = want(b.status), g = spot(w === 'rest' ? 'seat' : w, !!flip);
        people.set(b.id, {home, x: x + g.dx, y: y + g.dy, dir: g.dir, frame: -1, tick: 0, tool: b.tool, status: b.status,
                          want: w, mode: 'at', goal: g, flip: !!flip, wait: 5 + Math.random() * 30, laps: 0, pause: 0});
      }
    }
    fleet.forEach((f, i) => {
      const id = 'boat#' + i, p = people.get(id);
      keep.add(id);
      if (p && p.row === f.row) return;
      people.set(id, {boat: true, row: f.row, s: f.at, way: f.way, lane: f.lane, x: 0, y: 0, frame: 0, dir: 0, tick: 0});
      boatStep(people.get(id), 0);
    });
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
    const pic = p.boat ? img.boats : p.animal ? img.animals : img.people, s = size() * (p.boat ? 0.62 : 1);   // a boat fits the river
    if (!pic || p.frame < 0) return;
    const row = p.boat ? p.row : p.animal ? p.kind : PEOPLE_ROW[p.tool] ?? 0, col = p.boat ? p.frame : p.dir * (p.animal ? 9 : PER_DIR) + p.frame;
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
    if (h >= 20 || h < 5.5 || weatherDrawn === 'rain') { p.frame = 0; return before !== [p.x, p.y, p.dir, p.frame].join(); }   // asleep, or sheltering, on its feet
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
  // A boat on the river: along it slowly, turning at either end of the stretch below the hills,
  // facing the way the water runs there (8 pictures, every 45 degrees).
  function boatStep(p, dt) {
    const before = [Math.round(p.x), Math.round(p.y), p.frame].join();
    const out = river.filter(q => q.y > plot * 1.4 && q.y < MAP_H - 20);
    if (out.length < 4) return false;
    p.s += p.way * dt * 0.012;
    if (p.s > 0.95 || p.s < 0.05) { p.way = -p.way; p.s = Math.max(0.05, Math.min(0.95, p.s)); }
    const f = p.s * (out.length - 1), i = Math.min(out.length - 2, Math.floor(f)), t = f - i, a = out[i], b = out[i + 1];
    const gx = (b.x - a.x) * p.way, gy = (b.y - a.y) / KY * p.way, gl = Math.hypot(gx, gy) || 1;
    p.x = a.x + (b.x - a.x) * t - gy / gl * riverWidth() * p.lane; p.y = a.y + (b.y - a.y) * t + gx / gl * riverWidth() * p.lane * KY;
    let best = 0, most = -2;
    for (let k = 0; k < 8; k++) {
      const r = k * Math.PI / 4, fx = Math.sin(r), fz = Math.cos(r), dot = ((fx - fz) * gx + (fx + fz) * gy) / Math.SQRT2 / gl;
      if (dot > most) { most = dot; best = k; }
    }
    p.frame = best;
    return [Math.round(p.x), Math.round(p.y), p.frame].join() !== before;
  }
  function step(p, dt) {
    if (p.boat) return boatStep(p, dt);
    if (p.animal) return animalStep(p, dt);
    const before = [p.x, p.y, p.dir, p.frame].join();
    const w = want(p.status);
    if (w !== p.want) {                    // the status changed: off to that spot (from a walk, home along the streets first)
      p.want = w; p.pause = 0;
      if (p.mode === 'walk' && walkTo(p, door(p))) p.leg = 'back';
      else { p.mode = 'go'; p.goal = spot(w === 'rest' ? 'seat' : w, p.flip); }
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
        if (p.wait <= 0) {
          // A walk through the camp, along its streets, to anywhere on them; but not at night
          // or in the rain. Without streets, a stroll in front of the building.
          const h = hourNow(), out = !(h >= 20 || h < 5.5 || weatherDrawn === 'rain') && ways && walkTo(p, ways.pts[Math.floor(Math.random() * ways.pts.length)]);
          if (out) p.leg = 'out';
          else if (ways) p.wait = 20 + Math.random() * 20;
          else { p.mode = 'stroll'; p.laps = 2 + Math.floor(Math.random() * 2); p.goal = stroll(); }
        }
      }
    } else if (p.mode === 'walk') {        // along the streets, point by point
      const q = p.path[0], speed = plot * 0.2 * dt, dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      if (d <= speed) {
        p.x = q.x; p.y = q.y; p.path.shift();
        if (!p.path.length) {
          // There: a look round, then home the same way; home: to its spot by the building.
          if (p.leg === 'out') { p.pause = 2 + Math.random() * 5; if (walkTo(p, door(p))) p.leg = 'back'; else { p.mode = 'go'; p.goal = spot(p.want === 'rest' ? 'seat' : p.want, p.flip); } }
          else { p.mode = 'go'; p.goal = spot(p.want === 'rest' ? 'seat' : p.want, p.flip); }
        }
      } else {
        p.x += dx / d * speed; p.y += dy / d * speed;
        p.dir = dx >= 0 ? 0 : 1;
        p.tick++;
        p.frame = F.walk + p.tick % 4;
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
      const g = flatNight.getContext('2d', SOFT);
      g.setTransform(1, 0, 0, 1, PAD, PADY);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = nightColor;
      g.fillRect(-PAD, -PADY, MAP_W + 2 * PAD, MAP_H + PADY);
      // The lights come on as it gets dark: each lets the daylight through around it.
      g.globalCompositeOperation = 'destination-out';
      for (const {x, y, r, lamp, head} of lights) {
        if (lamp) {
          // A lamp: a pool of light on the ground under it, wide and flat, and its light itself.
          g.save(); g.translate(x, y); g.scale(1, 0.42);
          const pool = g.createRadialGradient(0, 0, 0, 0, 0, r);
          pool.addColorStop(0, `rgba(0, 0, 0, ${Math.min(0.85, dark * 1.25)})`);
          pool.addColorStop(0.55, `rgba(0, 0, 0, ${Math.min(0.42, dark * 0.6)})`);
          pool.addColorStop(1, 'rgba(0, 0, 0, 0)');
          g.fillStyle = pool; g.fillRect(-r, -r, r * 2, r * 2);
          g.restore();
          const hy = y - head, hr = plot * 0.13, halo = g.createRadialGradient(x, hy, 0, x, hy, hr);
          halo.addColorStop(0, `rgba(0, 0, 0, ${Math.min(0.9, dark * 1.3)})`); halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
          g.fillStyle = halo; g.fillRect(x - hr, hy - hr, hr * 2, hr * 2);
          continue;
        }
        const glow = g.createRadialGradient(x, y, 0, x, y, r);
        glow.addColorStop(0, `rgba(0, 0, 0, ${Math.min(0.85, dark * 1.3)})`);
        glow.addColorStop(0.4, `rgba(0, 0, 0, ${Math.min(0.5, dark * 0.75)})`);
        glow.addColorStop(0.75, `rgba(0, 0, 0, ${Math.min(0.14, dark * 0.2)})`);
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        g.fillStyle = glow;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      nightMap = keep(nightMap);
      warpCanvas(flatNight, 1, nightMap, 1);
    }
    // A metropolis's windows, warm, on a canvas of their own over the dark: each building
    // first wipes out what it stands in front of. Only while it is dark at all.
    litOn = false;
    if (nightOn && litList.length) {
      const dark = 1 - Math.min(...c) / 255;
      litAlpha = Math.min(0.8, dark * 1.2);
      litMap = keep(litMap);
      litMap.width = MAP_W; litMap.height = MAP_H;
      const g = litMap.getContext('2d', SOFT);
      // Back to front, buildings and lamps together, so a building in front of a lamp hides
      // its glow: each building first wipes out what it stands in front of.
      const order = [...litList.map(([kind, x, y, s, flip, gx, gy, dark]) => [gy, () => onGround(g, gx, gy, () => {
          if (img[kind]) { g.globalCompositeOperation = 'destination-out'; put(g, img[kind], x, y, s, flip); }
          g.globalCompositeOperation = 'source-over';
          if (!dark && img[kind + '-lit']) put(g, img[kind + '-lit'], x, y, s, flip);
        })]),
        ...lights.filter(l => l.lamp).map(({x, y, head}) => [y, () => onGround(g, x, y, () => {
          const hy = y - head, hr = plot * 0.2, warm = g.createRadialGradient(x, hy, 0, x, hy, hr);
          warm.addColorStop(0, 'rgba(255, 214, 140, 0.85)'); warm.addColorStop(0.3, 'rgba(255, 190, 110, 0.35)'); warm.addColorStop(1, 'rgba(255, 170, 90, 0)');
          g.fillStyle = warm; g.fillRect(x - hr, hy - hr, hr * 2, hr * 2);
        })])];
      for (const [, paint] of order.sort((p, q) => p[0] - q[0])) paint();
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

  // What stands nearer the camera than a person hides it: its own pixels, cut to its shape,
  // drawn again over the person (right after it, so a person in front of that is drawn over).
  let mask = null;
  function hide(g, p, k) {
    const [bx, by, bw, bh] = warpBox(box(p));
    const over = fronts.filter(f => f.y > p.y && f.x0 < bx + bw && bx < f.x1 && f.y0 < by + bh && by < f.y1);
    if (!over.length) return;
    const sx = Math.max(0, Math.floor((bx - ox) * k)), sy = Math.max(0, Math.floor((by - oy) * k));
    const sw = Math.min(view.width - sx, Math.ceil(bw * k) + 2), sh = Math.min(view.height - sy, Math.ceil(bh * k) + 2);
    if (sw <= 0 || sh <= 0) return;
    mask = keep(mask);
    mask.width = sw; mask.height = sh;
    const m = mask.getContext('2d', SOFT);
    m.setTransform(k, 0, 0, k, -ox * k - sx, -oy * k - sy);
    for (const f of over) f.paint(m);
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = 'source-in';
    m.drawImage(view, sx, sy, sw, sh, 0, 0, sw, sh);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(mask, sx, sy); g.restore();
  }
  // The streets as a net to walk on: a point about every 20 units along each road, joined to
  // the next along it and to any other road's within 14 (where roads meet).
  function waysOf(edges) {
    const pts = [], nb = [];
    edges.forEach(({line}, e) => {
      let last = -1, run = 0;
      line.forEach((q, i) => {
        if (i) run += Math.hypot(q.x - line[i - 1].x, q.y - line[i - 1].y);
        if (i && run < 20 && i < line.length - 1) return;
        run = 0;
        const n = pts.push({x: q.x, y: q.y, e}) - 1;
        nb.push([]);
        if (last >= 0) { nb[n].push(last); nb[last].push(n); }
        last = n;
      });
    });
    for (let a = 0; a < pts.length; a++)
      for (let b = a + 1; b < pts.length; b++)
        if (pts[a].e !== pts[b].e && Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y) < 14) { nb[a].push(b); nb[b].push(a); }
    return {pts, nb};
  }
  const nearestWay = q => { let best = -1, d = Infinity; ways.pts.forEach((w, i) => { const e = Math.hypot(w.x - q.x, w.y - q.y); if (e < d) { d = e; best = i; } }); return best; };
  // The shortest way along the streets from one point of the net to another, or null.
  function wayRoute(a, b) {
    const n = ways.pts.length, dist = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    dist[a] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0 || u === b) break;
      done[u] = 1;
      for (const v of ways.nb[u]) {
        const d = best + Math.hypot(ways.pts[v].x - ways.pts[u].x, ways.pts[v].y - ways.pts[u].y);
        if (d < dist[v]) { dist[v] = d; from[v] = u; }
      }
    }
    if (!isFinite(dist[b])) return null;
    const path = [];
    for (let i = b; i >= 0; i = from[i]) path.unshift(ways.pts[i]);
    return path;
  }
  // In front of a person's own door, where its building's road ends.
  const door = p => ({x: p.home.x + plot * 0.18 * (p.flip ? 1 : -1), y: p.home.y + plot * 0.16});
  // Off along the streets to `to`: false if there is no way there.
  function walkTo(p, to) {
    if (!ways) return false;
    const path = wayRoute(nearestWay(p), nearestWay(to));
    if (!path || path.length < 2) return false;
    const side = (Math.random() - 0.5) * 10;   // a little to one side of the middle of the street
    p.path = path.map(q => ({x: q.x + side, y: q.y + side * KY}));
    p.mode = 'walk';
    return true;
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
    for (const p of [...people.values()].filter(p => hit(warpBox(box(p)))).sort((a, c) => a.y - c.y)) {
      onGround(g, p.x, p.y, () => person(g, p));
      hide(g, p, k);
    }
    frontOver(g, hit);
  }
  // The timer runs only while it has something to move and someone to see it.
  // --- the weather, from the clock, the same in every window. Each half hour is cut in two
  // at a random point, 10 to 20 minutes in, so the weather lasts 10 to 20 minutes; each
  // part's weather differs from the one before it. Snow only from
  // November to February. A change fades in over FADE: the old picture under the new one,
  // the new one growing clearer, the rain or snow thinning or thickening. Rain and snow fall
  // in the world, on a canvas of their own over the camp, 20 times a second, only while it
  // shows; the rest is in the picture.
  const HALF = 30 * 60 * 1000, FADE = 3 * 60 * 1000;
  const WEATHER_ICON = {clear: '☀', cloudy: '☁', rain: '🌧', fog: '🌫', snow: '❄'};
  let weatherForTest = null, weatherDrawn = 'clear', fallTimer = 0, fadeTimer = 0, flakes = [], bgPrev = null;
  const cut = q => (10 + rng(q * 104729 + 7)() * 10) * 60 * 1000;        // where half hour q is cut
  const partStart = i => Math.floor(i / 2) * HALF + (i % 2 ? cut(Math.floor(i / 2)) : 0);
  function partOf(t) { const q = Math.floor(t / HALF); return q * 2 + (t - q * HALF >= cut(q) ? 1 : 0); }
  function weatherOf(part, month, not) {
    const r = rng(part * 7919 + 13);
    r(); const v = r();
    const table = (month >= 10 || month <= 1 ? [['clear', 0.3], ['cloudy', 0.25], ['snow', 0.2], ['rain', 0.1], ['fog', 0.15]]
      : [['clear', 0.4], ['cloudy', 0.27], ['rain', 0.2], ['fog', 0.13]]).filter(([k]) => k !== not);
    const all = table.reduce((a, [, p]) => a + p, 0);
    let sum = 0;
    for (const [k, p] of table) if (v * all < (sum += p)) return k;
    return table[0][0];
  }
  // A day of parts back, each unlike the one before; the result is the same every time.
  function weatherAt(part, month) {
    let w = weatherOf(part - 200, month);
    for (let i = part - 199; i <= part; i++) w = weatherOf(i, month, w);
    return w;
  }
  // {kind: now, from: the part before's, t: how far the fade has come, 0 to 1}
  function weatherNow() {
    if (weatherForTest) return weatherForTest;
    const t = Date.now(), i = partOf(t), m = new Date(t).getMonth();
    if (weatherNow.part !== i) { weatherNow.part = i; weatherNow.kind = weatherAt(i, m); weatherNow.from = weatherAt(i - 1, m); }
    return {kind: weatherNow.kind, from: weatherNow.from, t: Math.min(1, (t - partStart(i)) / FADE)};
  }
  function fallCanvas() {
    let cv = $('relax-weather');
    if (!cv) {
      cv = document.createElement('canvas');
      cv.id = 'relax-weather';
      cv.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
      $('relax-labels').before(cv);
    }
    return cv;
  }
  function weatherClock() {
    const w = weatherNow(), cv = fallCanvas();
    // What falls, and how much of it: the new weather's, growing, or the old one's, going.
    const wet = k => k === 'rain' || k === 'snow';
    const kind = wet(w.kind) ? w.kind : wet(w.from) && w.t < 1 ? w.from : null, share = kind === w.kind ? w.t : 1 - w.t;
    const want = on && !document.hidden && kind && share > 0.02;
    // While a fade runs, the picture is composed again every 3 s; afterwards the old one goes.
    const fading = on && !document.hidden && w.t < 1 && bgPrev;
    if (fading && !fadeTimer) fadeTimer = setInterval(() => { compose(); weatherClock(); }, 3000);
    if (!fading && fadeTimer) { clearInterval(fadeTimer); fadeTimer = 0; }
    if (w.t >= 1 && bgPrev) { bgPrev = null; compose(); }
    if (!want) {
      if (fallTimer) { clearInterval(fallTimer); fallTimer = 0; }
      cv.style.display = 'none';
      return;
    }
    cv.style.display = 'block';
    if (cv.width !== viewW || cv.height !== viewH) { cv.width = viewW; cv.height = viewH; cv.style.width = viewW + 'px'; cv.style.height = viewH + 'px'; }
    const n = Math.round((kind === 'rain' ? 650 : 550) * share);
    if (flakes.kind !== kind) flakes = Object.assign([], {kind});
    while (flakes.length < n) flakes.push(drop({}, true));
    flakes.length = n;
    if (!fallTimer) fallTimer = setInterval(fall, 50);
  }
  // A drop or a flake: over a point on the ground (in the world, so the far ones are smaller
  // and slower, and zooming in brings them close), some way up, falling to it.
  function drop(f, anywhere) {
    const y = HORIZON + Math.random() * (MAP_H - HORIZON), out = MAP_W / 2 * (1 / depth(y) - 1);
    f.x = -out + Math.random() * (MAP_W + 2 * out); f.y = y; f.z = 0.6 + Math.random() * 0.4; f.s = Math.random() * 6.28;
    f.h = (anywhere ? Math.random() : 1) * plot * 3;
    return f;
  }
  function fall() {
    const cv = $('relax-weather'), g = cv.getContext('2d'), rain = flakes.kind === 'rain', dt = 0.05;
    g.clearRect(0, 0, cv.width, cv.height);
    g.strokeStyle = 'rgba(200, 215, 235, 0.45)'; g.fillStyle = 'rgba(255, 255, 255, 0.9)'; g.lineWidth = 1;
    if (rain) g.beginPath();
    for (const f of flakes) {
      if (rain) f.h -= plot * 6 * f.z * dt;
      else { f.h -= plot * 0.35 * f.z * dt; f.s += dt; f.x += Math.sin(f.s * 1.3) * 10 * dt; }
      if (f.h <= 0) { drop(f, false); continue; }
      const [X, Y] = warp(f.x, f.y), m = depth(f.y), sx = (X - ox) * zoom, sy = (Y - f.h * m - oy) * zoom;
      if (sx < -10 || sx > cv.width + 10 || sy < -30 || sy > cv.height + 10) continue;
      if (rain) { const l = 22 * m * zoom * f.z; g.moveTo(sx, sy); g.lineTo(sx + l * 0.16, sy - l); }
      else { g.beginPath(); g.arc(sx, sy, (1.6 + 2 * f.z) * m * zoom, 0, Math.PI * 2); g.fill(); }
    }
    if (rain) g.stroke();
  }
  // --- the season, from this computer's calendar: spring from March, summer from June,
  // autumn from September, winter from December. The trees change with it: in autumn most
  // turn orange, red or yellow (some pines stay green), in winter they carry snow and the
  // round ones are bare, in spring some round ones blossom pink. Each tree keeps its colour
  // (from where it stands).
  const SEASON_ICON = {spring: '🌸', summer: '🌿', autumn: '🍂', winter: '⛄'};
  let seasonForTest = null;
  function seasonNow() {
    if (seasonForTest) return seasonForTest;
    const m = new Date().getMonth();
    return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter';
  }
  const tints = new Map();
  function tinted(pic, color, snow) {
    const key = pic.src + color + snow;
    if (tints.has(key)) return tints.get(key);
    const c = document.createElement('canvas');
    c.width = pic.naturalWidth || pic.width; c.height = pic.naturalHeight || pic.height;
    const g = c.getContext('2d');
    g.drawImage(pic, 0, 0);
    let d;
    try { d = g.getImageData(0, 0, c.width, c.height); } catch (x) { tints.set(key, pic); return pic; }   // a page from file:// may not read it
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], gr = px[i + 1], b = px[i + 2];
      if (px[i + 3] < 20 || !(gr > r + 12 && gr >= b - 25)) continue;      // leaves only, not the trunk
      const k = (r + gr + b) / 3 / 120;
      let [nr, ng, nb] = color ? color.map(v => Math.min(255, v * k)) : [r, gr, b];
      if (snow) { const w = Math.min(1, 0.35 + k * 0.45); nr += (245 - nr) * w; ng += (248 - ng) * w; nb += (252 - nb) * w; }
      px[i] = nr; px[i + 1] = ng; px[i + 2] = nb;
    }
    g.putImageData(d, 0, 0);
    c.src = key;
    tints.set(key, c);
    return c;
  }
  const AUTUMN = [[222, 120, 40], [196, 68, 42], [232, 186, 60], [210, 150, 50]];
  function seasonal(pic, x, y) {
    if (!pic || !pic.src) return pic;
    const season = seasonNow(), pine = /\/tree\.png$/.test(pic.src), round = /\/tree-city\.png$/.test(pic.src);
    if (!pine && !round) return pic;
    const v = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 % 1 + 1) % 1;
    if (season === 'autumn') return pine && v < 0.35 ? pic : tinted(pic, AUTUMN[Math.floor(v * 4) % 4], false);
    if (season === 'winter') return tinted(pic, round ? [130, 112, 96] : null, true);
    if (season === 'spring' && round && v < 0.45) return tinted(pic, [240, 168, 200], false);
    return pic;
  }

  // --- fireworks when the camp reaches a new era: rockets from below bursting over it for
  // about 10 seconds, and the news at the top. Once for each new era, kept per computer, so
  // a restart does not set them off again; not the first time Relax mode is shown.
  const ERA_KEY = 'amc-relax-era';
  let fx = null, fxTimer = 0;
  function eraCheck(e) {
    if (!on || document.hidden) return;
    const now = ERAS.length - 1 - ERAS.indexOf(e);
    let was = null;
    try { was = localStorage.getItem(ERA_KEY); } catch (x) {}
    // Only the highest era is kept. Right after a start the count can be low for a moment
    // (sessions still being read, slowest on Windows); keeping that lower era made the next
    // count, the real one, set the fireworks off again at every start.
    if (was !== null && now <= Number(was)) return;
    try { localStorage.setItem(ERA_KEY, String(now)); } catch (x) {}
    if (was !== null) celebrate(named(ERAS[ERAS.length - 1 - Number(was)][1]), named(e[1]));
  }
  function celebrate(from, to) {
    let cv = $('relax-fx');
    if (!cv) {
      cv = document.createElement('canvas');
      cv.id = 'relax-fx';
      cv.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
      $('relax-labels').after(cv);
    }
    cv.width = viewW; cv.height = viewH; cv.style.width = viewW + 'px'; cv.style.height = viewH + 'px'; cv.style.display = 'block';
    fx = {t: 0, rockets: [], sparks: [], text: `🎆 ${from} → ${to} 🎆`, next: 0};
    clearInterval(fxTimer);
    fxTimer = setInterval(firework, 1000 / 30);
  }
  const SPARK = ['#ffd84a', '#ff6b5e', '#7ee0ff', '#b48cff', '#7dff9a', '#ffffff', '#ff9ff3'];
  function firework() {
    const cv = $('relax-fx'), g = cv.getContext('2d'), dt = 1 / 30, W = cv.width, H = cv.height;
    fx.t += dt;
    if (fx.t < 7.5 && fx.t >= fx.next) {         // a rocket, now and then two
      fx.next = fx.t + 0.25 + Math.random() * 0.45;
      for (let k = Math.random() < 0.3 ? 2 : 1; k > 0; k--)
        fx.rockets.push({x: W * (0.12 + Math.random() * 0.76), y: H, top: H * (0.12 + Math.random() * 0.33), vx: (Math.random() - 0.5) * 40, color: SPARK[Math.floor(Math.random() * SPARK.length)]});
    }
    for (const r of fx.rockets) {
      r.y -= H * 0.95 * dt; r.x += r.vx * dt;
      if (r.y <= r.top) {
        r.done = true;
        const n = 46 + Math.floor(Math.random() * 30), sp = 90 + Math.random() * 90;
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2, v = sp * (0.6 + Math.random() * 0.4);
          fx.sparks.push({x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.3 + Math.random() * 0.6, color: Math.random() < 0.8 ? r.color : '#ffffff'});
        }
      }
    }
    fx.rockets = fx.rockets.filter(r => !r.done);
    for (const s of fx.sparks) { s.vy += 70 * dt; s.vx *= 0.985; s.vy *= 0.985; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
    fx.sparks = fx.sparks.filter(s => s.life > 0);
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#ffe9a8';
    for (const r of fx.rockets) { g.beginPath(); g.arc(r.x, r.y, 2, 0, Math.PI * 2); g.fill(); g.fillRect(r.x - 0.6, r.y, 1.2, 10); }
    for (const s of fx.sparks) { g.globalAlpha = Math.min(1, s.life); g.fillStyle = s.color; g.beginPath(); g.arc(s.x, s.y, 2.1, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = Math.min(1, fx.t * 2, Math.max(0, 10 - fx.t));
    g.font = "bold 20px 'DejaVu Sans Mono', Consolas, monospace"; g.textAlign = 'center';
    const tw = g.measureText(fx.text).width;
    g.fillStyle = 'rgba(0, 0, 0, 0.55)'; g.fillRect(W / 2 - tw / 2 - 16, 40, tw + 32, 36);
    g.fillStyle = '#ffffff'; g.fillText(fx.text, W / 2, 65);
    g.globalAlpha = 1;
    if (fx.t > 10 && !fx.sparks.length) { clearInterval(fxTimer); fxTimer = 0; g.clearRect(0, 0, W, H); cv.style.display = 'none'; fx = null; }
  }
  function clock() {
    const want = on && !document.hidden && (people.size > 0 || fires.length > 0);
    if (want && !timer) timer = setInterval(tick, TICK);
    if (!want && timer) { clearInterval(timer); timer = 0; }
  }

  // A name sign: the task board's wood (#a87b4f, a dark edge and a light inner line), with a
  // soft shadow on the ground; weathered grey for an ended session.
  function plank(g, [x, y, w, h], old) {
    const r = 3, path = () => {
      g.beginPath();
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    };
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.35)'; g.shadowOffsetY = 2; g.shadowBlur = 3;
    path(); g.fillStyle = old ? '#9c968a' : '#a87b4f'; g.fill();
    g.restore();
    g.lineWidth = 1.5; g.strokeStyle = old ? '#5a554c' : '#4a3019'; g.stroke();
    g.beginPath(); g.moveTo(x + 3, y + 2.5); g.lineTo(x + w - 3, y + 2.5);
    g.lineWidth = 1; g.strokeStyle = old ? '#b4aea2' : '#c4955f'; g.stroke();
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
    const vx = e.clientX - r.left, vy = e.clientY - r.top;
    const sign = signs.find(({rect: [x, y, w, h]}) => vx >= x && vx < x + w && vy >= y && vy < y + h);
    if (sign) return sign.b;
    const x = vx / zoom + ox, y = vy / zoom + oy;
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
    const now = JSON.stringify([camp, weatherNow().kind, list.map(b => [b.id, b.name, b.tool, b.status, b.level, b.people])]);
    if (now === sig && !force) { if (measure()) compose(); weatherClock(); return; }
    // A new kind of weather: keep the picture as it was, to fade the new one in over it.
    const w = weatherNow();
    if (bg && w.kind !== weatherDrawn && w.t < 1) {
      bgPrev = keep(bgPrev);
      bgPrev.width = bg.width; bgPrev.height = bg.height;
      bgPrev.getContext('2d', SOFT).drawImage(bg, 0, 0);
    }
    sig = now;
    draw(list);
    weatherClock();
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
    clock();
    weatherClock();
    // Back in Relax: the picture drawn last time shows at once, and is drawn anew only if what
    // it shows changed meanwhile (the same check as every refresh), a moment later; or if it
    // was drawn before the pictures were in (a refresh at start can come first).
    if (on) {
      loadTasks();
      if (bg) { measure(); compose(); }
      load().then(() => setTimeout(() => update(bare), 30));
    }
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
      // A building you moved: Reset place puts it back where it would be.
      const it = $('row-menu').querySelector('[data-act="place"]');
      if (it && b && places[b.id]) { it.style.display = ''; it.classList.remove('disabled'); it.dataset.id = b.id; }
    });
    // ✥ Rearrange, top right of the camp: only while it is on does dragging a building move it;
    // ↺ Reset all (shown then, if any were moved) puts them all back.
    const tools = document.createElement('div');
    tools.id = 'relax-tools';
    tools.style.cssText = 'position:absolute;right:8px;top:8px;z-index:5;display:flex;gap:6px;line-height:normal';
    const button = (id, text) => {
      const k = document.createElement('button');
      k.id = id; k.textContent = text;
      k.style.cssText = "font:12px 'DejaVu Sans Mono',Consolas,monospace;color:#fff3dc;background:#8a5a32;border:2px solid #4a3019;border-radius:4px;padding:3px 9px;cursor:pointer";
      tools.append(k); return k;
    };
    const arrange = button('relax-arrange', '✥ Rearrange'), resetAll = button('relax-reset', '↺ Reset all');
    const showTools = () => {
      arrange.textContent = arranging ? '✓ Done' : '✥ Rearrange';
      arrange.style.background = arranging ? '#3d7a3a' : '#8a5a32';
      resetAll.style.display = arranging && Object.keys(places).length ? '' : 'none';
    };
    arrange.addEventListener('click', () => {
      arranging = !arranging; showTools();
      say(arranging ? 'Drag a building to move it; ✓ Done when finished' : '');
    });
    resetAll.addEventListener('click', () => { places = {}; savePlaces(); showTools(); update(true); say('All buildings back in their places'); });
    cv.parentNode.append(tools);
    showTools();
    if ($('row-menu')) $('row-menu').addEventListener('click', e => {
      const id = e.target.dataset.act === 'place' && e.target.dataset.id;
      if (!id || !places[id]) return;
      delete places[id]; savePlaces(); showTools(); update(true);
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
    // Dragging a session's building moves it (a little way first, so a click is still a click);
    // dragging anywhere else moves the map.
    let drag = null;
    const ground = e => { const r = cv.getBoundingClientRect(); return unwarp((e.clientX - r.left) / zoom + ox, (e.clientY - r.top) / zoom + oy); };
    cv.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      const b = arranging && at(e), home = b && b.kind !== 'meeting' && layoutMemo.find(q => q.b.id === b.id);
      if (home) { moving = {b, from: {x: home.x, y: home.y}, x: e.clientX, y: e.clientY, at: ground(e), to: null, ok: false}; return; }
      drag = {x: e.clientX, y: e.clientY, ox, oy};
    });
    window.addEventListener('mousemove', e => {
      if (moving) {
        if (!moving.to && Math.hypot(e.clientX - moving.x, e.clientY - moving.y) < 6) return;
        const g = ground(e), to = {x: moving.from.x + g.x - moving.at.x, y: moving.from.y + g.y - moving.at.y};
        moving.to = to; moving.ok = canStand(moving.b.id, to.x, to.y);
        cv.style.cursor = moving.ok ? 'move' : 'not-allowed';
        viewChanged();
        return;
      }
      if (!drag) return;
      ox = drag.ox - (e.clientX - drag.x) / zoom; oy = drag.oy - (e.clientY - drag.y) / zoom;
      viewChanged();
    });
    window.addEventListener('mouseup', () => {
      drag = null;
      if (!moving) return;
      const {b, to, ok} = moving;
      moving = null;
      if (!to) return;
      if (ok) { places[b.id] = {x: Math.round(to.x), y: Math.round(to.y)}; savePlaces(); showTools(); update(true); }
      else { say(`${b.name} can't stand there`); compose(); }
    });
    cv.addEventListener('mousemove', e => {
      if (drag || moving) return;
      const b = at(e);
      if (b === hover) return;
      hover = b;
      cv.style.cursor = b ? (arranging && b.kind !== 'meeting' ? 'move' : 'pointer') : 'grab';
      cv.title = !b ? '' : b.kind === 'meeting' ? `⚖ ${b.name} · ${b.status === 'busy' ? 'under way' : 'done'} (double-click to open)`
        : (b.status === 'ended' ? `${b.name} · ended (double-click to start)`
        : `${b.name} · ${b.status} · ${b.tool === 'agy' ? (b.row.up || '') + ' open' : (b.row.turns || 0) + ' messages'}`) + (arranging ? ' · drag to move' : '');
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
    document.addEventListener('visibilitychange', () => { update(); clock(); weatherClock(); });
    set(saved() === 'relax' ? 'relax' : 'office');
  }

  return {wire, set, update, stamina, loadTasks, get on() { return on; },
          _people: () => people, _fires: () => fires.length, _era: () => era(camp)[1],   // for tests
          _hour: h => { hourForTest = h; skySig = ''; sky(); },
          _wall: () => wallLine && [wallLine.length, wallSkipped, wallPieces],
          _plaza: () => plazaCount,
          _inWall: () => { const L = wallLine; if (!L) return null; const inside = (x, y) => { let c = false; for (let i = 0, j = L.length - 1; i < L.length; j = i++) if ((L[i].y > y) !== (L[j].y > y) && x < (L[j].x - L[i].x) * (y - L[i].y) / (L[j].y - L[i].y) + L[i].x) c = !c; return c; }; const own = layoutMemo.filter(p => !p.b.prop); return [own.filter(p => inside(p.x, p.y)).length, own.length]; },
          _season: k => { seasonForTest = k; update(true); },
          _celebrate: (a, b) => celebrate(a, b),
          _weather: (kind, from = kind, t = 1) => { weatherForTest = {kind, from, t}; update(true); },
          _warp: warp, _unwarp: unwarp, _places: () => places, _signs: () => signs.map(s => ({id: s.b.id, rect: s.rect})), _layout: () => ({lamps: lampCount, zoom, fit: fitZoom(), ox, oy, things: layoutMemo.map(p => ({id: p.b.id, prop: !!p.b.prop, house: !!p.b.house, kind: p.b.kind, x: p.x, y: p.y, r: p.r})), roads: cityMemo ? cityMemo.edges.map(r => r.line) : [], bridge: cityMemo ? cityMemo.bridge : []})};
})();
