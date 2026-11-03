// The remote desktop page (remote.py, "desktopPort"): index.html in another computer's
// browser. Loaded before the page's own scripts, it stands in for pywebview:
// - window.pywebview.api.<name>(...) becomes POST /api/call/<name>;
// - what the window here is told (amc.syncTabs() ...) comes back from POST /api/poll and
//   runs here too, with each terminal's output after the part already shown.
// The terminals keep this computer's size (both pages type into the same terminals, which
// have one size), so the window used last sets it (claim below); a file dropped on a
// terminal is uploaded there first (drop below); pasting an image from this computer's
// clipboard is not available.
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

  // Each terminal tab: fitted to this window only while it is the one in use, and what it
  // had written before it opened here, then the rest as it comes.
  const shown = {};                         // tab id -> characters of its output shown
  function hook() {
    const add = amc.addTab;
    amc.addTab = function (id, name) {
      const r = add.apply(this, arguments);
      const t = amc.tabs[id];
      if (t && t.fit) {
        t.propose = t.fit.proposeDimensions.bind(t.fit);
        t.fit.fit = () => { if (using) claim(); };
      }
      shown[id] = 0;
      return r;
    };
    poll();
  }
  // The terminals have one size, set by the window used last. A click or a key here gives
  // the shown ones this window's size, and so does resizing here while this window is the one
  // in use; the computer's window taking it back (a click or a key there) ends that.
  let using = false;
  function claim() {
    using = true;
    for (const [id, t] of Object.entries(amc.tabs)) {
      if (!t.propose || !t.el.classList.contains('active')) continue;
      const d = t.propose();
      if (!d || !(d.cols > 0 && d.rows > 0) || (d.cols === t.term.cols && d.rows === t.term.rows)) continue;
      t.claimed = d.cols + ',' + d.rows;
      t.claimedAt = Date.now();
      post('/api/call/resize', {args: [id, d.cols, d.rows]}).catch(() => {});
    }
  }
  document.addEventListener('mousedown', claim, true);
  document.addEventListener('keydown', claim, true);
  // Files dropped on a terminal here: each one goes to that computer (POST /api/upload, as
  // the phone's 📎 does, at most 500 MB) and its path there is typed into the pane it was
  // dropped on. Ahead of the page's own drop, which would type this computer's paths.
  // How far it is shows at the bottom right until it is done.
  const UPLOAD_MAX = 500 * 1024 * 1024;
  function progress(text) {
    let el = document.getElementById('upload-progress');
    if (!el) {
      el = document.createElement('div');
      el.id = 'upload-progress';
      Object.assign(el.style, {position: 'fixed', right: '12px', bottom: '12px', zIndex: 30, padding: '6px 10px',
        background: 'var(--bar)', color: 'var(--title)', border: '1px solid var(--desc)', fontSize: '13px'});
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.display = text ? '' : 'none';
  }
  function upload(file, n, of) {
    return new Promise(ok => {
      if (file.size > UPLOAD_MAX) return ok({error: `${file.name}: over 500 MB`});
      const x = new XMLHttpRequest(), mb = b => (b / 1024 / 1024).toFixed(1);
      x.open('POST', '/api/upload');
      x.setRequestHeader('X-AMC-Token', token);
      x.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      x.upload.onprogress = e => {
        if (e.lengthComputable) progress(`uploading ${of > 1 ? `${n}/${of} ` : ''}${file.name} ` +
          `${Math.round(e.loaded / e.total * 100)}% (${mb(e.loaded)} / ${mb(e.total)} MB)`);
      };
      x.onload = () => { try { ok(JSON.parse(x.responseText)); } catch (e) { ok({error: `${file.name}: upload failed (${x.status})`}); } };
      x.onerror = () => ok({error: `${file.name}: upload failed: no connection`});
      x.send(file);
    });
  }
  window.addEventListener('drop', async e => {
    const files = [...(e.dataTransfer && e.dataTransfer.files || [])];
    if (!files.length || !document.getElementById('terms').contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('drop').style.display = 'none';
    const b = document.getElementById('terms').getBoundingClientRect();
    const at = amc.dropAt(e.clientX - b.left, e.clientY - b.top);
    const id = at && at.leaf.id ? at.leaf.id : amc.active;
    if (!id) return;
    amc.select(id);
    const paths = [];
    for (const [i, f] of files.entries()) {
      progress(`uploading ${f.name}…`);
      const r = await upload(f, i + 1, files.length);
      if (r.error) { progress(''); alert(r.error); break; }
      paths.push(r.path);
    }
    progress('');
    // Quoted the way that computer's shell reads them (a backslash: Windows).
    const quote = p => !/[^\w@%+=:,./\\-]/.test(p) ? p
      : p.includes('\\') ? `"${p}"` : `'${p.replace(/'/g, `'\\''`)}'`;
    if (paths.length) call('write', [id, paths.map(quote).join(' ') + ' ']);
  }, true);
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
        if (o.size && (t.term.cols !== o.size[0] || t.term.rows !== o.size[1])) {
          // Another size than the one asked for here, a moment later: the computer took it back.
          if (t.claimed && o.size.join() !== t.claimed && Date.now() - t.claimedAt > 1500) { using = false; t.claimed = null; }
          t.term.resize(o.size[0], o.size[1]);
        }
        if (o.reset) t.term.reset();
        if (o.data) t.term.write(o.data);
        shown[id] = o.end;
      }
    } catch (e) {}
    setTimeout(poll, 300);
  }
})();
