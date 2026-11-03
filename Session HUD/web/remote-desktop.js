// The remote desktop page (remote.py, "desktopPort"): index.html in another computer's
// browser. Loaded before the page's own scripts, it stands in for pywebview:
// - window.pywebview.api.<name>(...) becomes POST /api/call/<name>;
// - what the window here is told (amc.syncTabs() ...) comes back from POST /api/poll and
//   runs here too, with each terminal's output after the part already shown.
// The terminals keep this computer's size (both pages type into the same terminals, which
// have one size), so resizing here does nothing, and one larger than its pane here gets a
// smaller font; pasting an image from this computer's clipboard and dropping files are not
// available.
(() => {
  function store(k, v) { try { v === undefined ? (v = localStorage.getItem(k)) : localStorage.setItem(k, v); } catch (e) {} return v; }
  const fromLink = new URLSearchParams(location.hash.slice(1)).get('t');
  if (fromLink) { store('amc-token', fromLink); history.replaceState(null, '', location.pathname); }
  let token = fromLink || store('amc-token');   // the link's, also where nothing can be stored
  if (!token) token = prompt('Agent Mission Control token (hud-config.json, "remote")') || '';
  store('amc-token', token);

  async function post(path, body) {
    const r = await fetch(path, {method: 'POST', body: JSON.stringify(body),
                                 headers: {'X-AMC-Token': token, 'Content-Type': 'application/json'}});
    if (r.status === 403) { store('amc-token', ''); throw new Error('wrong token: reload the page with #t=<token>'); }
    return r.json();
  }
  const LOCAL = {
    resize: () => null,                    // the terminals keep this computer's size
    paste_clipboard_image: () => null,     // that clipboard is the other computer's
    // The issue is written in this computer's browser.
    send_feedback: () => { window.open('https://github.com/Qertile/Agent-Mission-Control/issues/new', '_blank'); },
  };
  async function call(name, args) {
    if (LOCAL[name]) return LOCAL[name]();
    const r = await post('/api/call/' + name, {args});
    if (r.error) throw new Error(r.error);
    if (name === 'init') hook();
    return r.result;
  }
  // Any name is a call, except 'then' (so awaiting the api object itself is not a call).
  // Kept in place: a page that sets window.pywebview (pywebview does, when this page is
  // tested in a pywebview window) adds to it but keeps this api.
  const pv = {api: new Proxy({}, {get: (_, name) =>
    typeof name === 'string' && name !== 'then' ? (...args) => call(name, args) : undefined})};
  Object.defineProperty(window, 'pywebview', {configurable: false, get: () => pv,
    set: v => { for (const k of Object.keys(v || {})) if (k !== 'api') pv[k] = v[k]; }});

  // Each terminal tab: no fitting to this window, and what it had written before it opened
  // here, then the rest as it comes.
  const shown = {};                         // tab id -> characters of its output shown
  function hook() {
    const add = amc.addTab;
    amc.addTab = function (id, name) {
      const r = add.apply(this, arguments);
      const t = amc.tabs[id];
      if (t && t.fit) t.fit.fit = () => {};
      shown[id] = 0;
      return r;
    };
    poll();
  }
  // A terminal larger than its pane here gets a smaller font until all of it shows, or its
  // bottom (the message box of Claude Code and Codex) and right edge would be cut off. One
  // step on each poll, starting again from the full size when the pane or the terminal changes.
  const FULL_FONT = 14, MIN_FONT = 6, SCROLLBAR = 14;
  function shrinkToPane(t) {
    const box = t.el, screen = box && box.querySelector('.xterm-screen');
    if (!screen || !box.classList.contains('active')) return;
    const key = [box.clientWidth, box.clientHeight, t.term.cols, t.term.rows].join();
    if (t.paneKey !== key) {
      t.paneKey = key;
      if (t.term.options.fontSize !== FULL_FONT) { t.term.options.fontSize = FULL_FONT; return; }
    }
    const tooBig = screen.offsetWidth > box.clientWidth - SCROLLBAR || screen.offsetHeight > box.clientHeight;
    if (tooBig && t.term.options.fontSize > MIN_FONT) t.term.options.fontSize -= 1;
  }
  let since = -1;
  async function poll() {
    try {
      const out = {};
      for (const id of Object.keys(shown)) if (amc.tabs[id]) out[id] = shown[id];
      const r = await post('/api/poll', {since, out});
      if (r.gap) return location.reload();
      if (since >= 0) for (const code of r.codes) { try { (0, eval)(code); } catch (e) {} }
      since = r.n;
      for (const [id, o] of Object.entries(r.out)) {
        const t = amc.tabs[id];
        if (!t) continue;
        if (o.size && (t.term.cols !== o.size[0] || t.term.rows !== o.size[1])) t.term.resize(o.size[0], o.size[1]);
        if (o.reset) t.term.reset();
        if (o.data) t.term.write(o.data);
        shown[id] = o.end;
        shrinkToPane(t);
      }
    } catch (e) {}
    setTimeout(poll, 300);
  }
})();
