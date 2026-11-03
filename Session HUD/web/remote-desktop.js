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
      if (t && t.term && t.term.registerLinkProvider)
        t.term.registerLinkProvider({provideLinks: (y, done) => done(pathLinks(t.term, y))});
      if (t && t.fit) {
        t.propose = t.fit.proposeDimensions.bind(t.fit);
        t.fit.fit = () => { if (using) claim(); };
      }
      shown[id] = 0;
      return r;
    };
    addAttach();
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
  // Full paths in a text, of this computer's files or the other's: C:\..., /a/b... (two
  // parts at least, so "/config" is not one), ~/...; one in backticks may have spaces.
  // [{start, end, path}], end not included, trailing punctuation left out.
  // (Here \u0001 marks where the AI broke a long line itself; see pathLinks.)
  const PATH_RE = /`((?:[A-Za-z]:\\|~\/|\/)[^`\n]+)`|(^|[\s\u0001(\[{"'“「：:,，])((?:[A-Za-z]:\\|~\/|\/[\w.@-]+\/)[^\s"'`<>|*?)\]}」，。；]+)/g;
  function findPaths(text) {
    const out = [];
    for (const m of text.matchAll(PATH_RE)) {
      let path = m[1] || m[3], start = m.index + (m[1] ? 1 : m[2].length);
      if (!m[1]) path = path.replace(/[.,;:!?]+$/, '');
      if (path.length > 2) out.push({start, end: start + path.length, path});
    }
    return out;
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
  // The links of terminal row y (1-based). A path can go on past its row two ways: the
  // terminal wrapped it (the next row isWrapped), or the AI broke the line itself (Claude
  // Code does, at about the width): a row that ends at the right edge goes on in the next one,
  // after its indent, marked \u0001. Read cell by cell, so a path's place is right with wide
  // (Chinese) characters before it.
  const MARK = '\u0001';
  // (A row can be longer than the terminal is wide, after it was made narrower: cols counts.)
  function full(line, cols) {
    for (let x = Math.min(line.length, cols) - 1; x >= 0; x--) {
      const ch = line.getCell(x) && line.getCell(x).getChars();
      if (ch && ch !== ' ') return x >= cols - 4;
    }
    return false;
  }
  function goesOn(buf, row, cols) {         // row + 1 continues row
    const line = buf.getLine(row), next = buf.getLine(row + 1);
    return !!(line && next && (next.isWrapped || full(line, cols)));
  }
  function pathLinks(term, y) {
    const buf = term.buffer.active;
    let top = y - 1, bottom = y - 1;
    while (top > 0 && y - 1 - top < 10 && goesOn(buf, top - 1, term.cols)) top--;
    while (bottom < buf.length - 1 && bottom - (y - 1) < 10 && goesOn(buf, bottom, term.cols)) bottom++;
    let text = '';
    const cell = [];                         // cell[i]: [x, y] of text[i]
    for (let row = top; row <= bottom; row++) {
      const line = buf.getLine(row);
      let x = 0;
      if (row > top && !line.isWrapped) {    // the AI's own line break: its indent left out
        while (x < term.cols && (line.getCell(x).getChars() || ' ') === ' ') x++;
        while (text.endsWith(' ')) { text = text.slice(0, -1); cell.pop(); }   // the empty cells at its end too
        text += MARK;
        cell.push(cell.length ? cell[cell.length - 1] : [1, row + 1]);
      }
      for (; x < Math.min(line.length, term.cols); x++) {
        const c = line.getCell(x);
        if (!c || c.getWidth() === 0) continue;
        const ch = c.getChars() || ' ';
        text += ch;
        for (let k = 0; k < ch.length; k++) cell.push([x + 1, row + 1]);
      }
    }
    return findPaths(text).filter(p => cell[p.start][1] <= y && cell[p.end - 1][1] >= y).map(p => {
      // Tried whole first; if there is no such file, up to each break the AI made, last first
      // (the text after a break can be words, not the rest of the path).
      const parts = p.path.split(MARK), tries = [];
      for (let n = parts.length; n > 0; n--) tries.push(parts.slice(0, n).join('').replace(/[.,;:!?]+$/, ''));
      return {
        text: tries[0],
        range: {start: {x: cell[p.start][0], y: cell[p.start][1]}, end: {x: cell[p.end - 1][0], y: cell[p.end - 1][1]}},
        activate: async () => {
          let err = null;
          for (const path of tries) {
            err = await downloadFile(path, progress);
            if (!err || !err.startsWith('no such file')) break;
          }
          if (err) alert(err);
        },
      };
    });
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
