// The remote desktop page (remote.py, "desktopPort"): index.html in another computer's
// browser. Loaded before the page's own scripts, it stands in for pywebview:
// - window.pywebview.api.<name>(...) becomes POST /api/call/<name>;
// - what the window here is told (amc.syncTabs() ...) comes back from POST /api/poll and
//   runs here too, with each terminal's output after the part already shown.
// The terminals keep this computer's size (both pages type into the same terminals, which
// have one size), so the window used last sets it (claim below); a file dropped on the page
// or picked with the 📎 by + is uploaded there first (sendFiles below), and a full path in a
// terminal is a link that downloads that file here (links below); pasting an image from
// this computer's clipboard is not available.
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
    // The issue is written in this computer's browser, filled in by the other one. The tab
    // opens at once, with the click, so the browser does not block it as a popup.
    send_feedback: page => {
      const w = window.open('about:blank', '_blank');
      call('feedback_url', [page]).then(url => { if (w) w.location = url; else window.open(url, '_blank'); })
        .catch(() => { if (w) w.location = 'https://github.com/Qertile/Agent-Mission-Control/issues/new'; });
    },
    // A web link in a terminal opens in this computer's browser too.
    open_url: url => { window.open(url, '_blank', 'noopener'); return null; },
  };
  async function call(name, args) {
    if (LOCAL[name]) return LOCAL[name](...args);
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
    addAttach();
    // A path clicked in a terminal: the file comes here, not opened on that computer. Tried
    // whole, then cut at each break the AI made (pathLinks in index.html).
    amc.openPath = async tries => {
      let err = null;
      for (const path of tries) {
        err = await downloadFile(path, progress);
        if (!err || !err.startsWith('no such file')) break;
      }
      if (err) alert(err);
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
  // Uploads the files, then types their paths there into tab id, quoted the way that
  // computer's shell reads them (a backslash: Windows).
  async function sendFiles(files, id) {
    if (!id || !files.length) return;
    amc.select(id);
    const paths = [];
    for (const [i, f] of files.entries()) {
      progress(`uploading ${f.name}…`);
      const r = await upload(f, i + 1, files.length);
      if (r.error) { progress(''); alert(r.error); break; }
      paths.push(r.path);
    }
    progress('');
    const quote = p => !/[^\w@%+=:,./\\-]/.test(p) ? p
      : p.includes('\\') ? `"${p}"` : `'${p.replace(/'/g, `'\\''`)}'`;
    if (paths.length) call('write', [id, paths.map(quote).join(' ') + ' ']);
  }
  // A file dragged anywhere over the page can be dropped (some app windows do not drop
  // otherwise); over a pane it goes to that pane's tab, elsewhere to the active one.
  const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  window.addEventListener('dragover', e => {
    if (hasFiles(e) && !amc.dragging) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  }, true);
  window.addEventListener('drop', e => {
    const files = [...(e.dataTransfer && e.dataTransfer.files || [])];
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('drop').style.display = 'none';
    const terms = document.getElementById('terms'), b = terms.getBoundingClientRect();
    const at = terms.contains(e.target) && amc.dropAt(e.clientX - b.left, e.clientY - b.top);
    sendFiles(files, at && at.leaf.id ? at.leaf.id : amc.active);
  }, true);
  // 📎 by the tab bar's + : files picked here go to the active tab the same way.
  function addAttach() {
    const tools = document.getElementById('tab-tools');
    if (!tools || document.getElementById('attach-btn')) return;
    const btn = document.createElement('div'), pick = document.createElement('input');
    btn.id = 'attach-btn';
    // Drawn in the tab bar's own color (an emoji keeps its own colors), like the others there.
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px">' +
      '<path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/></svg>';
    btn.title = 'upload files from this computer to the active tab (their paths there are typed in)';
    pick.type = 'file';
    pick.multiple = true;
    pick.hidden = true;
    btn.onclick = () => {
      if (!amc.active || !amc.tabs[amc.active] || !amc.tabs[amc.active].term) return alert('open a session tab first');
      pick.click();
    };
    pick.onchange = () => { const files = [...pick.files]; pick.value = ''; sendFiles(files, amc.active); };
    tools.insertBefore(btn, tools.firstChild);
    document.body.appendChild(pick);
  }
  // A file of the computer (GET /api/download, the token in its header) saved on this device,
  // with its progress shown by show(text). Returns null or what went wrong.
  async function downloadFile(path, show) {
    const name = path.split(/[\\/]/).pop() || 'file', mb = b => (b / 1024 / 1024).toFixed(1);
    show(`downloading ${name}…`);
    try {
      const r = await fetch('/api/download?path=' + encodeURIComponent(path), {headers: {'X-AMC-Token': token}});
      if (!r.ok) {
        let err = `download failed (${r.status})`;
        try { err = (await r.json()).error || err; } catch (e) {}
        show('');
        return err;
      }
      const total = +r.headers.get('Content-Length') || 0, reader = r.body.getReader(), parts = [];
      for (let got = 0; ;) {
        const {done, value} = await reader.read();
        if (done) break;
        parts.push(value);
        got += value.length;
        show(`downloading ${name} ${total ? Math.round(got / total * 100) + '% ' : ''}(${mb(got)} / ${mb(total)} MB)`);
      }
      const url = URL.createObjectURL(new Blob(parts, {type: r.headers.get('Content-Type') || 'application/octet-stream'}));
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      show('');
      return null;
    } catch (e) {
      show('');
      return `${name}: download failed: ${e.message}`;
    }
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
