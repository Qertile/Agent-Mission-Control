# Changelog

All notable changes to this project are listed here, newest first.

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
