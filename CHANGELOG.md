# Changelog

All notable changes to this project are listed here, newest first.

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
