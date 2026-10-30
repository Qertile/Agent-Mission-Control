# Changelog

All notable changes to this project are listed here, newest first.

## 2026-10-30 – v2.5: remote desktop

### Added
- **The whole window in another computer's browser** (`"desktopPort"` in the `"remote"`
  block, e.g. 8771; Tailscale address and token as the phone page). `remote.py` serves
  `web/index.html` with `web/remote-desktop.js` in front, which turns the page's
  `window.pywebview.api` calls into requests and runs what the window here is told
  (`amc.syncTabs()` ...), plus each terminal's output. Private methods and pasting from
  this computer's clipboard cannot be called; files outside `web/` are not served.
- The terminals keep this computer's size there; dropping files is not available.
- `init()` runs once: a remote page opening does not start the sessions again.
- README: *Remote desktop* (both languages); Versions: `v2.5`.
- Tagged `v2.5`.

## 2026-10-30 – two word limits in Cross-check

### Changed
- **Cross-check has two word limits:** *reply* for the answers, revisions, reviews and
  follow-up answers (default 200, was 100 for everything), and *conclusion* for the
  summary and each follow-up's conclusion (default 500). Both are in the form and in
  *Settings…*, and on the tab's subtitle. A discussion from before keeps its one limit
  for both.
- README: *Cross-check* (both languages).

## 2026-10-30 – v2.4.1: Codex in Cross-check by default

### Changed
- **Cross-check ticks Codex by default** when it is installed, like Claude and
  Antigravity (it was left unticked). Its model stays Codex's own default.
- README: *Cross-check* (both languages); Versions: `v2.4.1`.
- Tagged `v2.4.1`.

## 2026-10-30 – right-click a tab

### Added
- **Right-clicking a tab** in the tab bar opens the session list's menu for that session
  (Copy, Copy all rows, Open on start, Terminate, Model; Settings… for a Cross-check).
  A closed tab has no row in the list, so only Copy all rows is enabled.
- README: *Session list* (both languages).

## 2026-10-30 – usage on the phone; no agy window on Windows

### Added
- **Phone page: usage**, a line per tool with each limit in percent used (Claude 5H and
  WEEK, Codex's windows, Antigravity's model groups), refreshed every 30 seconds.
- README: *Phone* (both languages).

### Fixed
- **Windows: a console window flashed every 10 minutes** while Agent Mission Control read
  `agy models`; that call now starts agy with no window, as Cross-check already did.

## 2026-10-30 – v2.4: thinking… on the phone

### Added
- **Chat view shows *thinking…*** at the bottom while the session is busy, pulsing like a
  busy tab's dot on the desktop; it goes when the session is idle. The chat API now
  returns the session's status.
- Tagged `v2.4`.

## 2026-10-30 – phone page

### Added
- **A page for the phone** (`Session HUD/remote.py`, `web/mobile.html`), off unless
  `hud-config.json` has `"remote": {"token": ...}`. It listens only on the Tailscale
  address, port 8770, and every API call needs the token (403 otherwise).
- The running sessions in a list, the closed ones under *History* (picking one opens it).
- *Chat* view: only the typed messages and the replies, read from the Claude transcript or
  the Codex rollout (no tool calls, no thinking). *Term* view: the tab's terminal at the
  desktop's size, from the last 400,000 characters of its output that the window now
  keeps. Antigravity has *Term* only.
- Keys `1 2 3 ↑ ↓ ⌫ Enter Esc ⇧Tab` and a message box that types into the session.
- README: *Phone* (both languages).

## 2026-10-30 – name: Agent Mission Control

### Changed
- **The project is called Agent Mission Control** everywhere instead of AI-Infra: README
  titles (and the link to the Chinese part), the setup comments, and the folder paths in
  `Task Manager/CLAUDE.md` and the README's schedule command, which now say
  `Agent-Mission-Control\...` because that is the folder a clone makes.

## 2026-10-30 – reorder sessions in the session list

### Added
- **Drag a session up or down the session list** to reorder it; a bar marks where it will
  go. The order is saved in `agents.json` (as dragging a tab does), so the tab bar follows.
  Only `agents.json` sessions move; discussions and sessions from other terminals don't.
- README: *Session list* (both languages).

## 2026-10-30 – status menu order

### Changed
- **Task status menu:** Pending / Ongoing / Checking, then a line, then Finished and
  Discard together (the two that ask for a result and take the task off the list).

## 2026-10-30 – a reason on Discard

### Added
- **Discard asks for the reason**, in the same box as Finished's result (Enter; empty =
  `discarded`; Esc cancels). It goes in as the result `discarded: <reason>` (where
  Finished's would), so the Excel file's Discarded rows carry it; restoring the task
  drops it and keeps the results from before.
- README: Status and Task history (both languages).

## 2026-10-30 – task results, task history, Discard, `+` History

### Added
- **Result on Finished:** picking Finished asks for the task's result (Enter; empty =
  `finished`; Esc or a click elsewhere cancels). It is written to `tasks.md` as
  `→ 結果 (YYYY-MM-DD)：…` under the task, or under each sub-item that has no result yet
  (results already there stay), so the sync puts it in the Excel Result column.
- **Task history:** a clock at the top right of the task list switches it to the finished
  tasks in `tasks.md` (latest first, with sub-items and results) and the Excel file's
  Discarded tasks. *Restore → Pending* on a task's status: a finished one is unticked and
  loses the result lines dated its finish day; a Discarded one is written back to
  `tasks.md` (dates, sub-items, results) and its Discarded rows leave the sheet.
- **Discard** in the task status menu: the task's rows become Discarded in the Excel file
  and it leaves `tasks.md`; the task history can restore it.

### Changed
- **`+` menu:** new sessions and Cross-check… only; the sessions not running and the past
  discussions (all of them now) moved into *History (n) ▸*, with *◂ Back*.
- README: Status, Task history, `+` → History (both languages).

## 2026-10-29 – paste images

### Added
- **Paste an image into a tab:** Ctrl+V / Ctrl+Shift+V with an image on the clipboard
  saves it as `<temp>/amc-paste/paste-<time>.png` and types the path into the tab (as a
  dropped file); Claude reads it on send. On Linux WebKitGTK gives the page no image, so
  it is read from the GTK clipboard; on Windows the page's paste event (not tested yet).
  This also covers Claude Code's own Ctrl+V image paste, which needs `xclip` / `wl-paste`
  on Linux.

### Changed
- **Ctrl+V** in a tab is the browser's paste (text or image), like Ctrl+Shift+V; it is no
  longer sent to the program as `^V`.
- README: *Images* under *Working in the window* (both languages).

## v2.3 – 2026-10-29

Tagged `v2.3`. Since `v2.2`: Cross-check (below).
- README: `v2.3` in the Versions table, *Cross-check* under *Working in the window* (both
  languages).

## 2026-10-29 – Cross-check

### Added
- **Cross-check** (`Session HUD/discuss.py`): `+` → *Cross-check…* asks Claude, Codex and
  Antigravity one question, each in print mode on a conversation of its own, resumed every
  turn. Modes *discuss* (all answer, then revise on the others' answers; the lead sums up)
  and *review* (the lead answers, the others review, the lead replies; the first reviewer
  sums up). Rounds 1–3, default 2; a word limit per reply, default 100. Models default to
  Sonnet and agy's medium Flash.
- **Discussion tab** (`⚖`): the rounds side by side; a follow-up goes to every participant
  and then one writes the conclusion. *Send to…* on a summary or conclusion pastes it into
  a running session's tab and submits it.
- **Session list:** open or running discussions show with `⚖` and the tokens of all their
  models. Right-click: Open on start, Terminate (kills the step under way, closes the tab),
  Settings… (name, models, lead, word limit; who takes part, the mode and the rounds stay).
- A conversation that cannot go on (agy has answered `INVALID_ARGUMENT`) is retried once on
  a new one, given the question and the latest summary or conclusion.
- Discussions are saved in `Session HUD/discussions/` (git-ignored).

### Not tested
- Codex as a participant (no codex on the test machine); Cross-check on Windows.

## v2.2 – 2026-10-29

Tagged `v2.2`. Since `v2.1` (the sections below, down to *taskbar icon*):
- Themes under `⚙`: Classic (the original colors, the default) and nine more.
- Antigravity (`agy`) tabs: *New Antigravity session…* in the `+` menu, resumed by
  conversation, model per session, busy / idle.
- The usage panel split per tool (CLAUDE, CODEX, ANTIGRAVITY), each with its pies and its
  weekly reset; agy's limits read from its `/usage`.
- A busy tab's status dot pulses; a session with no terminal is called a background job.
- The window's taskbar icon is the desktop shortcut's (Linux and Windows).
- `+`, `⇔` and `⚙` pinned at the right of the tab bar.
- README: `v2.2` in the Versions table (both languages).

## 2026-10-29 – tab bar buttons, limit lines, menu order

### Changed
- **`+`** moved from after the tabs to the right end of the tab bar, left of `⇔`, pinned
  there with `⇔` and `⚙` (24px like them).
- **Codex and Antigravity limits** look like Claude's: the label line shows `5% used`,
  the reset (`resets Thu 11-05 11:24 · 6d23h left`) is the small italic line under it.
- **Session list right-click menu:** Open on start and Terminate come before the Model
  list, which is now last.

## 2026-10-29 – Antigravity tabs, usage per tool

### Added
- **Antigravity (`agy`) tabs:** `+` → *New Antigravity session…* (`"tool": "agy"`). The
  conversation agy makes at the first message is found (new since the tab started, in the
  working folder, after the tab's latest Enter) and saved as `"conversation"`; later starts
  run `agy --conversation <id>`. Model per session from `agy models` (`--model`). Busy /
  idle from the conversation's last step (status 8 while a reply runs).
- **Usage per tool:** the usage panel has a CLAUDE, a CODEX and an ANTIGRAVITY section,
  each with its own pies. CLAUDE shows when the week resets; CODEX each window's reset with
  the time left. ANTIGRAVITY shows the weekly limit of each model group (GEMINI,
  CLAUDE/GPT), read from a hidden `agy` → `/usage` every 10 minutes.
- **Background jobs:** double-clicking a session with no terminal (a scheduled `claude -p`)
  says "<name> is a background job (no window)" instead of "runs outside this window"
  (Linux; `/proc/<pid>/stat`'s tty).

### Changed
- Time left over a day reads `6d5h`, not `149h12m`.

### Fixed
- An *Open on start* session whose tool is not installed (for example `codex`) stopped the
  window from starting any tab or showing usage. It now says "could not start" in its tab
  and the rest start.

## 2026-10-27 – busy tab dot pulses

### Changed
- A tab's status dot pulses while its session is busy, so busy and idle differ without the
  colors: in Nord the busy dot is the active tab's text color, and the Solarized themes' busy,
  waiting and idle colors are equally bright. Only the dot fades, so it stays apart from the
  tab's own background blink (finished or waiting, not on screen).

## 2026-10-27 – themes

### Added
- **Themes**, under the new `⚙` (settings) at the right of the tab bar: Classic (the original
  colors, the default), Dark, Light, Monokai, Solarized Dark, Solarized Light, Dracula, Nord,
  Gruvbox Dark and One Dark. A theme colors the page, the usage pies, the sparklines and the
  terminals (their 16 ANSI colors too), and is kept for the next start.

### Changed
- `⇔ full width` is now just `⇔` (its tooltip says what it does); `⇔` and `⚙` are 24px.
- Session status colors come from the theme (`amc_web.py` sends `var(--busy)` and the like).

## 2026-10-27 – taskbar icon

### Changed
- The window's taskbar icon is the desktop shortcut's (`Session HUD/mission-control.svg`)
  instead of python's. Linux: set before the window opens. Windows: set when it shows, and the
  window gets its own taskbar button instead of grouping under python (not yet tested on Windows).
- Windows desktop shortcut (`create-shortcut.ps1`) uses the same icon, from the new
  `Session HUD/mission-control.ico`, instead of a built-in Windows one.

## v2.1 – 2026-10-27

Tagged `v2.1`. Since `v2.0` (the sections below, down to *one window*):
- A model per session, picked from the session list's right-click menu.
- Codex tabs: *New Codex session…* in the `+` menu (stage 1).
- Panes as in VS Code: drag a tab onto a pane's edge to split it; the bars between panes
  resize them; tab order by dragging along the tab bar.
- Files dragged onto a pane type their full paths into that tab.
- Ctrl+Tab / Ctrl+Shift+Tab switch tabs; the tab bar has no scrollbar and the
  `⇔ full width` button stays on one line.
- README: `v2.1` in the Versions table (both languages).

## 2026-10-27 – drop files on a tab

### Added
- **Ctrl+Tab / Ctrl+Shift+Tab** switch to the next / previous running tab in tab bar
  order (wrapping around), from the terminals and the chat box alike; the tab is scrolled
  into view.
- **Tab bar without a scrollbar:** the bar is hidden; the mouse wheel over the tabs
  scrolls them sideways.
- **Files dragged onto the terminals:** dropping files from the file manager on a pane
  types their full paths into that pane's tab (quoted when they hold spaces or other
  special characters, followed by a space), as a terminal does. On Linux the page reads
  the `file://` addresses WebKitGTK puts in the drop (in its `text/html`, not its empty
  `text/uri-list`); on Windows, where the page only sees file names, `amc_web.py` takes
  the paths from pywebview's drop event. A path is typed once either way.

### Fixed
- **`⇔ full width`** wrapped to two lines when the tabs filled the bar. It stays on one
  line, pinned at the right end of the tab bar, and the tabs scroll under it.

## 2026-10-25 – panes as in VS Code

### Changed
- **Free pane layout in place of the two side-by-side panes:** drag a tab onto the
  terminal area; on a pane's left / right / top / bottom edge it gets a new pane there,
  on its middle it replaces that pane's tab (and leaves the pane it was in). Panes nest
  in any mix of rows and columns, in the three-column view as well as at full width. The
  bars between panes drag to resize (no pane below 120 px), `⊟` at a pane's top right
  closes it while its session keeps running, and a pane whose session ends closes. The
  layout and the focused tab are kept in the page's storage and come back at the next
  start without the sessions not running then. A tab restarting on a new model keeps its
  pane.
- **`⇔ full width`** (was *⇔ side by side*) now only hides the task and session columns.
- **Tabs easier to tell apart:** the tab typed into is lit with a bright underline, a tab
  shown in another pane has a dim underline; a pane's `⊟` is bigger.

### Added
- **Tab order by dragging:** drag a tab along the tab bar to move it; a bar marks the
  spot. The new order is written to `agents.json`, so it is kept and the session list
  follows it. The tabs now always stand in `agents.json` order (a session started from
  `+` used to go to the end).

## 2026-10-25 – Codex tabs (stage 1)

### Added
- **New Codex session… in the `+` menu:** adds a session with `"tool": "codex"` to
  `agents.json` and starts `codex` in its tab (with `prompts/<name>.md` as its first
  message when that file exists). Refused when `codex` is not on PATH.
- **Codex thread found by itself:** Codex chooses its session id and writes the rollout
  only at the first message, so Agent Mission Control takes the new rollout in the work
  folder whose thread started with the tab (by the latest Enter when two new tabs
  started together) and saves its id as `"thread"`. From then on the tab runs
  `codex resume <thread>`.
- **Codex in the session list:** this window's Codex tabs are listed with the Claude
  sessions, in `agents.json` order, with busy / idle from their rollout and the activity
  sparkline from its growth. The id column shows the thread, or `new` before it is known.
- **Codex models:** the right-click *Model* menu of a Codex session lists *Codex default*
  and the models in `~/.codex/models_cache.json` that Codex's picker shows; the choice is
  passed as `-m`, with the same restart-when-idle as for Claude.
- **CODEX in the usage panel:** a line with the plan and each limit window (named by its
  length: 5H, WEEK, 30D) and a pie per window, from the last `token_count` Codex wrote.

### Not yet
- A Codex session waiting for an approval shows busy, not waiting.
- The chat boxes and the Daily Summary still cover Claude sessions only.

## 2026-10-25 – model per session

### Added
- **Model in the session list's right-click menu:** *Claude default*, `fable`, `opus`,
  `sonnet` or `haiku`, the current one marked. The choice is saved as `"model"` in the
  session's `agents.json` entry and passed to `claude` as `--model` on every start and
  resume (*Claude default* removes it). An idle tab restarts on the new model at once and
  resumes the same conversation; a busy or waiting one is left running and takes the
  model at its next start. The result shows under the list.

## 2026-10-24 – one window (web version, stage 3)

### Added
- **New session from `+`:** the tab bar's `+` menu ends with *New session…*: type a name
  and press Enter, and a session with that name and a new id is added to `agents.json`
  and started in a tab (with `prompts/<name>.md` as its first message when that file
  exists). A name already in `agents.json` or an empty one is refused in the menu.
- **Status on the tabs:** each tab starts with a dot in its session's status colour
  (busy cyan, idle green, waiting yellow; the status is its tooltip). A tab not on screen
  whose session finishes (busy -> idle) or starts waiting blinks until it is shown.
- **Side by side (`⇔` at the right of the tab bar):** hides the task and session columns
  and shows two tabs next to each other at full height (about 80 columns each on a
  1440 px screen). Clicking a tab puts it in the focused pane, or focuses it when it is
  already shown; clicking a pane focuses it. `⇔` again goes back to three columns with the
  focused tab shown.

### Changed
- **Agents Launcher starts the web version:** `launch-agents.py` (Linux) and
  `launch-agents.ps1` (Windows) now only start `Session HUD/amc_web.py`, which opens the
  sessions ticked *Open on start* as tabs inside its window. No GNOME Terminal / tmux or
  Windows Terminal tabs are opened. A second click replaces the running window: on Linux
  the new window waits until the old one and its tabs have ended (up to 5 s), on Windows
  the launcher closes it as its close button does and waits up to 10 s; the conversations
  resume in the new window. Windows starts it with `pythonw` (no console); errors go
  to `Session HUD/amc-web.log`, as on Linux.
- **Old windows removed:** `show-session-hud.ps1`, `mission_control.py` and the tab
  scripts `agent.bat`, `agent.sh`, `tmux.conf` are deleted now that the web version runs
  on both Windows and Linux (they are kept in the `v1.0` tag). `agents.json`'s `"window"`
  is no longer used.
- **Install:** `install.sh` checks pywebview, ptyprocess, openpyxl and Tk (for the task
  popup) instead of GNOME Terminal and tmux. `install.ps1` no longer checks Windows
  Terminal; it checks the Python modules pywebview, pywinpty and openpyxl and offers to
  install them with pip, together with a newer `typing_extensions` (Python 3.7).
- **Desktop shortcut:** named `Agent Mission Control` instead of `Agents Launcher`; it
  still runs the Agents Launcher. On Linux (`install.sh`) it has the window's own icon; on
  Windows (`create-shortcut.ps1`) the old `Agents Launcher.lnk` is removed when it points
  at this folder's launcher.
- **README:** a Versions section (both languages) says what `v2.0` and `v1.0` are.
- **README** and `Task Manager/CLAUDE.md` describe the web window: tabs, `+` / `×`,
  double-click, resizable columns, the one `Task Reminder` chat box.

## 2026-10-24 – Linux version

### Changed
- **Sessions Manager → Session Manager:** the session is renamed everywhere: the
  session chat box's caption and default target (both HUDs), the session Agent Mission
  Control opens on first send, `Agents Launcher/prompts/Session Manager.md` (file and
  text), `agents.template.json` and the README. Entries below keep the old name. An
  existing `agents.json` entry (and on Linux its tmux session) is renamed by hand;
  otherwise the chat box opens a new `Session Manager`.
- **One branch:** the Windows and Linux files live side by side on `master`; the
  separate `linux` branch is merged in and no longer used.
- **README:** says so, in English and 繁體中文; the opening line names Windows and Linux,
  and the Agents Launcher row names GNOME Terminal with tmux for Linux.
- **Your own files out of git:** `agents.json`, `Session HUD/hud-config.json`,
  `Task Manager/tasks.md` and `Task Manager/TaskDatabase.xlsx` are no longer tracked
  (`.gitignore`), so a pull never overwrites them. The repo keeps `*.template.*` copies;
  `install.sh` / `install.ps1` make the real files from them when missing (a new session
  id for `agents.json`) and leave existing ones alone. README setup steps: install
  first, then list your tabs.

### Added
- **Linux:** the same tools run on Linux (tested on Linux Mint 22 / Cinnamon, X11) from
  Python files next to the Windows ones: `install.sh`, `Agents Launcher/launch-agents.py`
  + `agent.sh`, `Session HUD/mission_control.py`, `Task Manager/tasks.py` and
  `Daily Summary/jobs.py` (systemd user timers instead of Task Scheduler). Each tab runs
  inside tmux (`tmux -L amc`), which is how the chat boxes type into it.
- **Sessions Manager default prompt:** on a session's first run, `agent.sh` sends
  `Agents Launcher/prompts/<name>.md` as its first message, so a new `Sessions Manager`
  starts knowing its job; resumed sessions are not sent it again.
- **Task Reminder session (Linux):** the first message sent from the task chat box
  opens a `Task Reminder` tab when there is none and adds it to `agents.json`, as the
  session chat box does for `Sessions Manager`. Its first run gets
  `Agents Launcher/prompts/Task Reminder.md`: read `Task Manager/CLAUDE.md` and keep the
  task list from then on.
- **Open on start (Linux):** a tick in the session list's right-click menu, kept as
  `"autoOpen"` in `agents.json` (ticked when missing). The Agents Launcher opens only
  ticked sessions; Agent Mission Control started on its own opens the ticked ones that
  are not running yet. Sessions not listed in `agents.json` have it greyed out.
- **Web version, stage 2 (`Session HUD/amc_web.py`):** the whole Agent Mission Control in
  one window, three columns: tasks (clickable due date with a calendar, clickable status,
  the `Task Reminder` chat box), Session Monitor (usage and pies, the session list with
  sparklines, right-click Copy / Copy all rows / Open on start / Terminate, double-click
  to show that session's tab; for one running elsewhere a line above the note says so
  until the next click), and a terminal tab per `agents.json` session. The bars
  between the columns drag to resize them, and the widths are kept for the next start.
  The page's URL carries its modified time, so an edited page is not served from the
  browser cache.
  The two lines under 5H BLOCK are small grey italics, like the note under the list.
  There is no session chat box: you type into the tab itself. Tabs run `claude` on the session's fixed id like `agent.sh`
  (`--session-id` with the `prompts/<name>.md` first message on the first run, `--resume`
  later); ticked ones start with the window, `+` starts any other listed one, and a tab
  closes when its session ends (its `×`, Terminate, or `/exit`). A session already running
  elsewhere (an old tmux tab) is left there. Double-click in the list is detected by hand,
  since the list is redrawn every second. The chat boxes open
  a missing `Session Manager` / `Task Reminder` tab as before. `--agents FILE` uses
  another `agents.json`. Runs beside the Tk HUD and its tmux tabs; nothing launches it yet.
- **Shared code (`Session HUD/amc_core.py`):** paths, `agents.json`, the session registry,
  account usage and number formats, used by both `mission_control.py` and `amc_web.py`;
  no tmux and nothing Linux-only (a Windows-safe process check instead of `/proc`).
- **Web version, stage 1 prototype (`Session HUD/amc_web.py`):** one window
  (pywebview) with terminal tabs drawn by xterm.js 5.5.0 (kept in `Session HUD/web/vendor`)
  and a two-line chat box that types into the active tab. Each tab is a pseudo-terminal
  the window owns - ptyprocess on Linux, ConPTY (pywinpty) on Windows - so closing the
  window ends them. `--shell` runs shells instead of `claude`. Separate from the current
  HUD and tabs; it does not read `agents.json` yet.
- **Closing Agent Mission Control closes the agents (Linux):** closing its window ends
  every agent tab too (the whole `tmux -L amc` server); the conversations are kept, so
  the Agents Launcher resumes them. A new Agent Mission Control replacing a running one
  leaves the tabs open, and Claude sessions not started in tmux are not touched.
- **Terminate (Linux):** a session list right-click item that ends the session: its
  whole tmux session, which closes its tab, or just the Claude process when it is not
  in tmux. The conversation is kept, so the Agents Launcher can resume it later.
- **Chat boxes and Up column (Linux):** the Windows changes below, ported to
  `mission_control.py`: two-line boxes, Shift+Enter for a newline, Enter to send
  (each line ends with a backslash, then Enter), Up/Down history per box, and the Up
  column in decimal hours (`25.1 hrs`). The window is 805 px high, as on Windows.

### Fixed
- **Tabs opened by Agent Mission Control (Linux):** each session it opened (Open on
  start, or a chat box creating `Sessions Manager` / `Task Reminder`) got its own
  window, because `gnome-terminal --tab` run outside a terminal opens a new one. It now
  joins the window already showing an agent, found through `GNOME_TERMINAL_SCREEN` in a
  tmux client's environment; with none shown, the first tab opens a window and the rest
  join it.
- **Open on start (Linux):** a ticked session still alive in tmux with no terminal
  attached (e.g. after every terminal window closed) got no tab when Agent Mission
  Control started, because it counted as running. It is now opened in a tab that
  re-attaches to the tmux session, so Claude is not restarted. Sessions already shown in
  a tab, or running outside tmux, are still skipped.
- **Session list right-click menu (Linux):** it closed as soon as the right button was
  released, so it had to be held down. It now opens on release and stays open until
  an item is clicked or you click elsewhere.

## 2026-10-24 – chat box editing, pane focus

### Changed
- **Chat boxes:** two lines high; Shift+Enter inserts a newline, Enter sends. A
  multi-line message is typed into the tab the way Claude Code documents for every
  terminal (backslash, then Enter, per line). Up on the first line / Down on the last
  line walk the lines sent from that box, like a shell history (per box, per run).
  No scrollbar on the box.
- **Up column:** hours with one decimal (`25.1 hrs`), no other unit.

### Fixed
- Sending into a tab whose terminal title had changed (Claude Code stops setting it
  after a self-update) lost the keystrokes: the pane is now found by its control
  class, not its title.

## 2026-10-22 – account-wide usage

### Changed
- **Agent Mission Control – usage pies:** the 5H and WEEK pies now show the account's
  own utilization from Anthropic's OAuth usage endpoint - the numbers the Claude app
  and `/usage` show, covering every machine that shares the login - fetched once a
  minute with the token Claude Code keeps in `.credentials.json`. The 5-hour reset time
  comes from the account too. If the fetch fails the pies fall back to this machine's
  spend against `costCap5h` / `costCapWeek`, and the status line says why.
- **Usage panel:** smaller type (13 / 20 / 12 pt) and tighter rows, 166 → 140 px, so the
  headline clears the pies and the session list gets the room.

## 2026-10-22 – edit tasks and talk to sessions from the window

### Added
- **Agent Mission Control – task panel:** the due date is clickable (a small calendar;
  the day is written to `tasks.md` and synced) and so is the status (Pending / Ongoing /
  Checking / Finished written to `TaskDatabase.xlsx`; Finished ticks the task off and
  removes it from the list at once). A chat box under the list types what you enter into
  the `Task Reminder` tab.
- **Agent Mission Control – sessions:** a `Session Monitor` header, and a chat box under
  the list that types into the `Sessions Manager` tab, or into whichever session you
  double-click. Lines reach a tab as real keystrokes (the only input Claude Code's TUI
  takes): the terminal is brought to the front, the tab's pane focused through UI
  Automation, the text typed, then Enter with its scan code; focus returns to the window.
- Default window height 695 → 783 to make room for the header and the two boxes.

### Fixed
- Clicking blank space in the task panel no longer opens the calendar or status menu.
- The calendar lives in its own window: inside a `ToolStripDropDown` clicks landed on the
  wrong day.

## 2026-10-22 – Windows Snap, clean relaunch

### Changed
- **Agent Mission Control – window:** Windows Snap works now (drag to a screen edge,
  Win+Arrow) while the borderless look stays. The form is a `SnapForm` subclass: the
  sizable window styles are added after creation, the frame they imply is removed in
  `WM_NCCALCSIZE` and never painted on (de)activation, corners are square and the DWM
  border is off. Maximize fills the work area (the taskbar stays visible) and restore
  keeps the size. The process is per-monitor DPI aware, so on a second monitor with a
  different scale the window is drawn crisp instead of bitmap-stretched (which also
  produced a stray frame).
- **Agents Launcher:** a second click first closes what the previous click opened – the
  agent tabs (found by their titles through UI Automation and closed with their own
  close button, so other Windows Terminal windows are untouched) and the HUD – then
  opens the new set. `-DryRun` lists what it would close.
- **Task Manager rules (`Task Manager\CLAUDE.md`):** after a task is added, completed,
  edited or reordered, the session edits `tasks.md`, runs `sync-sheet.ps1` and stops
  there – no task list in chat; Agent Mission Control shows the tasks.

## 2026-10-20 – single tab list and one-click setup

### Added
- **`agents.json`:** one list of Claude Code tabs (name, session id, terminal window).
  Agents Launcher opens its tabs from it and Agent Mission Control takes its display
  order and names from it, so a tab is added or renamed in one place.
- **`install.bat`:** one-step setup. Checks Windows Terminal, Claude Code, Python 3, the
  ImportExcel module and the DejaVu Sans Mono font; creates the desktop shortcut; asks
  which scheduled jobs to register.

### Changed
- `Agents Launcher.bat` only calls the new `launch-agents.ps1`, which reads
  `agents.json`. Agent Mission Control re-reads the list on every refresh.

## 2026-10-20

### Changed
- **Agent Mission Control – task panel:** lists every open task in priority order
  instead of only the top five. A scrollbar appears only when the list is taller
  than the panel.
- **Task Manager rules (`Task Manager\CLAUDE.md`):** after a task is added, completed,
  edited or reordered, the Claude session lists *all* open tasks in chat and no longer
  opens the standalone Todo List popup; tasks are shown in Agent Mission Control,
  which re-reads `tasks.md` within 30 seconds. The weekday 09:30 popup stays available
  as an opt-in through `Task Manager\setup-schedule.ps1`.

### Added
- This changelog.

## 2026-10-20 – first commit (`6a6a72f`)

### Added
- **Agents Launcher:** opens Claude Code tabs in Windows Terminal, each resuming a fixed
  session with a pinned name, then starts Agent Mission Control. Includes a desktop
  shortcut creator.
- **Agent Mission Control** (`Session HUD`): task list; live sessions with status,
  60-second activity sparkline, uptime and last update; 5-hour and weekly usage pies
  measured as spend at API list price, including sub-agent transcripts.
- **Task Manager:** `tasks.md` task list with priority ranking, `TaskDatabase.xlsx`
  history with sync script, optional weekday reminder popup.
- **Daily Summary:** scheduled daily review (asks only about open items), daily summary
  and weekly summary jobs, with retry after usage-limit resets.
