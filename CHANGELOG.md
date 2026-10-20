# Changelog

All notable changes to this project are listed here, newest first.

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
