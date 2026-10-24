# Changelog

All notable changes to this project are listed here, newest first.

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
