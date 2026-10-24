# Changelog

All notable changes to this project are listed here, newest first.

## 2026-10-24 – Linux version

### Changed
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
- **Terminate (Linux):** a session list right-click item that ends the session: its
  whole tmux session, which closes its tab, or just the Claude process when it is not
  in tmux. The conversation is kept, so the Agents Launcher can resume it later.
- **Chat boxes and Up column (Linux):** the Windows changes below, ported to
  `mission_control.py`: two-line boxes, Shift+Enter for a newline, Enter to send
  (each line ends with a backslash, then Enter), Up/Down history per box, and the Up
  column in decimal hours (`25.1 hrs`). The window is 805 px high, as on Windows.

### Fixed
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
