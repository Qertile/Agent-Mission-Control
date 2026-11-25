# Changelog

All notable changes to this project are listed here, newest first.

## 2026-11-25 – untagged: Relax mode's canvas probes in Send feedback

### Changed
- The `relax canvases:` line in ⚙ → *Send feedback…* now has three more probes, for the
  Windows camp drawn without its map (still blank on v4.19.0):
  - `flat after fill r,g,b,a`: flat's centre right after its ground fill.
  - `small ok|blank`: a new 100x100 canvas filled red and read back.
  - `big ok|blank`: the same for a new 5080x2050 canvas, freed straight after.
  They run once per new picture of the camp. Made by AMC Relax Mode.

## 2026-11-25 – v4.19.0: your own colours

### Added
- ⚙ → *Theme ▸* → *Edit colours…*: a palette for your own theme, *Custom*. *Start from*
  copies one of the themes; each of its colours is then one row with a swatch, a name and
  its hex. There are 15 for the window (Background, Headers and menus, Lines, Accent, Text,
  Second text, Dim text, Activity graph, Current tab, Tab that needs you, Busy, Waiting,
  Idle, Ended, Errors) and 4 for the terminals (background, text, cursor, selection; the 16
  ANSI colours stay the starting theme's). A click on a swatch opens the system's colour
  picker, and the window and the terminals follow as you pick. Custom is listed with the
  other themes and kept in this computer's page storage (`amc-custom-theme`), as the theme's
  name is. Done, Esc or a click outside closes it.
- README: Theme describes it (both languages).
- Versions: `v4.19.0`.
- Tagged `v4.19.0`.

### Known
- Drawn on a stub page in Firefox (from Solarized Dark, Accent changed: the page followed);
  not yet run in the real AMC's WebKitGTK or WebView2 colour pickers.

## 2026-11-25 – v4.18.5: Relax mode's map on Windows

### Fixed
- Relax mode on Windows drew a camp without its map (only flat green, the people and the
  labels). The v4.18.3 report showed why: `flat 5080x2050 0,0,0,0; bg 1800x1350 0,0,0,0`, so
  drawing into the two off-screen canvases did nothing, with no error and no lost context.
  WebView2, with many terminal tabs using the graphics card too, likely gave them no memory.
  Every off-screen canvas's context (flat, bg, the night and lamp layers, the front fences,
  the shadows' outlines, the hiding mask, the weather fade's copy) is now made with
  `willReadFrequently: true`, so it is kept in memory instead of on the card; the
  canvases on screen are unchanged. The flat world canvas (about 41 MB) is freed right
  after it is warped; the report takes its entry just before that.
- Versions: `v4.18.5`.
- Tagged `v4.18.5`.

### Known
- Made by AMC Relax Mode and checked in Firefox on a stub page (a village and a city draw
  fully; a redraw about 10% slower); not yet run in WebView2. The next Send feedback from
  Windows tells whether flat and bg are drawn.

## 2026-11-25 – v4.18.4: developer mode's Update on a Chinese Windows

### Fixed
- Developer mode's ⚙ → *Update* stayed at *reading GitHub…* on a Chinese Windows. git's
  output (UTF-8; the commit `afe5343 v4.7.0: a tidier ⚙ menu` is among the 30 listed) was
  read in Windows' code page, cp950, which cannot decode `⚙`, so `update_commits` failed and
  the page had nothing to catch it. git's output is now read as UTF-8 (`_run_git`), and a
  failed list shows its error instead of *reading GitHub…*.
- Versions: `v4.18.4`.
- Tagged `v4.18.4`.

### Known
- Checked on Linux (the 30 commits read as UTF-8, and cp950 fails on that byte as on
  Windows); not yet run on Windows. A Windows copy in developer mode gets this by turning
  developer mode off, pressing *Update*, then turning it on again.

## 2026-11-25 – v4.18.3: Relax mode's canvases in Send feedback

### Added
- Relax mode: after each new picture of the camp, one line in the page's errors (replaced
  each time, so ⚙ → *Send feedback…* always shows it): `relax canvases: flat WxH r,g,b,a;
  bg …; view …; dpr … res … zoom …`. That is each canvas's size and the colour at its middle
  (`0,0,0,0` is blank), ` LOST` when the browser lost it, and `unreadable: …` when it cannot
  be read. To tell where the Windows camp loses its map: the world canvas (flat), the warp
  (bg) or the copy to the window (view). Feedback no longer says *No errors were recorded*
  once Relax mode has drawn.
- Versions: `v4.18.3`.
- Tagged `v4.18.3`.

## 2026-11-25 – v4.18.2: caught page errors listed in Send feedback

### Changed
- An error caught in the page (Relax mode's part of a refresh, the first refresh, the first
  task read; v4.18.1 only logged them to the console, which pywebview's window does not show)
  is now kept with the page's other errors (`amc.logError`), with the file and line it was
  thrown at, so ⚙ → *Send feedback…* lists it. For the Windows camp drawn without its map.
- Versions: `v4.18.2`.
- Tagged `v4.18.2`.

## 2026-11-25 – v4.18.1: Relax mode draws a village and a town again; the page keeps updating

### Fixed
- Relax mode (v4.18.0): a camp in the Village or Town era was not drawn (it stayed at its
  first picture). The walkers' new `route(a, b)` had the same name as the roads' `route({a,
  c1, c2, b}, placed)`, replacing it, so drawing a village's or a town's paths threw. Renamed
  `wayRoute`. City and later eras do not draw those paths, so they were not affected.
- The page stopped updating for good when Relax mode's drawing threw on its first refresh:
  `init()` awaited that refresh before starting the timers, so the Session Monitor stayed at
  *No active sessions*, the tasks never loaded and the camp kept its first picture. The
  timers now start first, the first refresh and task read have a catch, and Relax mode's
  part of each refresh is in a try/catch (logged as `relax:`).
- Versions: `v4.18.1`.
- Tagged `v4.18.1`.

### Known
- The rename was verified by AMC Relax Mode on a stub page (camp 0, 300, 816, 1939); the
  page fix is not yet run in the real AMC. A Windows camp in the City era drawn without its
  map (from before v4.18.0) is not explained by this and is still open.

## 2026-11-25 – v4.18.0: Relax mode: people walk the streets, hibernating sessions asleep

### Added
- Relax mode: an idle or hibernating session's person, after sitting by its door 20 to 40
  seconds, walks along the streets (the shortest way, over bridges and through gates) to
  anywhere on them, looks round 2 to 7 seconds and walks home the same way. Not at night
  (20:00 to 5:30) or in the rain. A new status (busy, waiting) calls it home along the
  streets first. A camp without streets keeps the stroll in front of the building.
- Relax mode: what stands nearer the camera (a building and its yard, a tree, a lamp, the
  wall and its towers, the wharf's ships and goods) hides a person or an animal behind it.

### Changed
- Relax mode: a hibernating session's building has no light round it at night and, in a
  city or a metropolis, dark windows; its sign shows *hibernating* in pale purple (#b48cff,
  the HUD's colour for it).
- README: Relax mode, the people's walks and hibernating sessions (both languages).
- Versions: `v4.18.0`.
- Tagged `v4.18.0`.

### Known
- Redrawing takes a little longer (the streets are made into a net each time): in the test
  page a city 322–367 ms → 368–398 ms.

## 2026-11-25 – v4.17.1: the due-date calendar starts on Sunday

### Changed
- Task Manager's due-date calendar: weeks start on Sunday (`Su Mo Tu We Th Fr Sa`), not Monday.
- README: Due date says so (both languages).
- Versions: `v4.17.1`.
- Tagged `v4.17.1`.

## 2026-11-25 – v4.17.0: messages to a hibernating tab (amc_send.py)

### Added
- `Session HUD/amc_send.py "<tab name>" "<message>"`: sends a message to an AMC tab, waking
  it first when it is hibernating. SendMessage cannot reach a hibernating session (its process
  and messaging socket are gone, so ListAgents does not list it). The message is left in
  `Session HUD/inbox/`; the running AMC checks it every second (`_inbox_loop`), and `send()`
  wakes the tab in the same conversation, waits for its prompt and types the message in,
  headed `[message from <sender tab> via amc_send]` (the sender found by walking up from the
  command's process to a tab's). Prints `sent` or what went wrong (`no '<name>' in
  agents.json`, `that is this session`, `AMC is not running`); exit code 0 only when sent.
  Waits up to 150 s; a message no AMC picked up is removed, so a later AMC does not send it late.
- `.gitignore`: `Session HUD/inbox/`.
- README: Hibernating explains amc_send.py and the `~/.claude/rules/` rule that lets Claude
  sessions use it on their own (both languages).
- Versions: `v4.17.0`.
- Tagged `v4.17.0`.

### Known
- Tested with stand-in tabs (sent, unknown tab, to itself, no AMC); not yet run in the real
  AMC, and not on Windows. Codex and Antigravity sessions do not read the Claude rule.

## 2026-11-23 – v4.16.1: no hibernating with a background command, and Keep awake

### Changed
- Hibernating: a session with a command still running in the background no longer
  hibernates, so the command is not ended with it. Before, a build or download Claude left
  running in the background (its turn over, so idle) was ended after 30 minutes. Told by any
  process under the session's that started a minute or more after its tab (`started_since`),
  so a launcher's node or an MCP server there from the start does not count; read from
  `/proc` on Linux and with Toolhelp32 / GetProcessTimes on Windows.
- Right-click menu → *Keep awake* (☑/☐): the session never hibernates, for one running a
  `/loop` or a reminder, which AMC cannot see. Saved as `"keepAwake": true` in `agents.json`.
- README: Hibernating lists what does not hibernate, and that the Task Scheduler jobs and
  `/schedule` are not affected (both languages).
- Versions: `v4.16.1`.
- Tagged `v4.16.1`.

### Known
- Tested on Linux with real processes (a command started later counts, the launcher's own
  child does not) and with stand-ins for the rest; the Windows process read is not yet run on
  Windows, and the menu item was not drawn on a test page.

## 2026-11-23 – v4.16.0: hibernating tabs, and no conhost.exe left behind on Windows

### Added
- Hibernating tabs: a tab's session idle for 30 minutes (status idle, so not busy or waiting
  on a question, and nothing typed into it) has its process ended to free its memory, about
  150 MB per Claude session. The tab stays, dimmed and in italics with a small `z`, with a
  line in its terminal saying so; the Session Monitor lists it as *hibernating* (purple).
  - A click on the tab or its pane wakes it: the same conversation starts again
    (`claude --resume`, `codex resume`, `agy --conversation`). The remote desktop does the
    same; the Session Monitor wakes it on a double-click.
  - Phone page: hibernating sessions are listed under *Hibernating*; picking one wakes it.
  - Text sent to it from a chat box (for example *to Task Reminder*) wakes it first.
  - Terminate on a hibernating session closes its tab.
  - Not hibernated: a new Codex or Antigravity tab whose conversation is not found yet (it
    would start afresh), and tabs that are not `agents.json` sessions.
- Checked every 30 s (`_hibernate_loop`, `HIBERNATE_AFTER` in `amc_web.py`).

### Fixed
- Windows: the `conhost.exe` leak of the Antigravity usage read was still there: 432 left
  (7.2 GB) after about 3 days, one every 10 minutes, all children of `amc_web.py`. pywinpty's
  own reader thread holds the pty, and its read waits for output that never comes once the
  hidden `agy` is gone, so the pty and its console host stayed. `close()` cancels that read
  once and can miss it. `free_pty()` now cancels it every 0.1 s until the thread ends (5 s at
  most), so the pty is freed. Linux is unchanged.
- Windows: closing a tab (×, Terminate, hibernating) left its `conhost.exe` the same way; it is
  now closed and freed too.
- Relax mode's camp counted a hibernating session's messages twice; once now.
- README: Hibernating, under Working in the window (both languages).
- Versions: `v4.16.0`.
- Tagged `v4.16.0`.

### Known
- Tested with stand-ins only (hibernate, wake, terminate, the tab and Session Monitor drawn
  on a test page); not yet run in a real window or on Windows.
- While hibernating a session gets no messages from other sessions, and a question it was
  waiting on or a `/loop` it ran is gone.
- A window still pops up on Windows every 10 minutes, likely started by `agy` itself (the
  usage read or `agy models`); not yet found.

## 2026-11-23 – v4.15.1: Relax mode: a smaller wall, a closer view, a larger bay

### Changed
- Relax mode: a town's palisade, a city's wall and a metropolis's old wall go round the 5
  sessions' buildings nearest the plaza only; the rest stand outside it (before: round them
  all, e.g. all 12 in a test city).
- Relax mode: zoomed all the way out, the camp fills the window's height from its highest roof
  down instead of from the mountains' tops, leaving up to a quarter of its width out at the
  sides (a tenth before). In a 1644×1146 window the sky goes from about 30% of the height to
  about 10%.
- Relax mode: the bay is about 10% larger (840×420 instead of 760×380), its wharf with it. A
  building whose place is now on the water or too near it is placed again; one moved there
  with Rearrange goes back to its own place.
- README: Relax mode, the wall and the view (both languages).
- Versions: `v4.15.1`.
- Tagged `v4.15.1`.

## 2026-11-22 – v4.15.0: Relax mode: a bay, a wharf and modern ships

### Added
- Relax mode: the camp's bottom-left corner is a bay of the sea, with a beach round it; the
  river runs into it. Buildings, trees, streets and the wall keep off it as they do the river,
  and a building moved onto it goes back to its own place.
- Relax mode: a wharf along the bay from a village on. It stands above the water: its side
  facing the camera drops down to it, a wooden one on posts, a stone one in courses, wet at the
  foot.
  - Village: a wooden wharf, 2 piers, fishing boats and rowboats, a pile of goods.
  - Town: a stone quay, 3 piers, a moored sailing ship, goods, a warehouse on a stone platform
    out over the water.
  - Medieval City: as a town's, with 4 piers, two ships and the medieval warehouse.
  - Metropolis: a concrete quay and piers, an ocean liner and a container ship, tugs and
    speedboats, stacks of shipping containers.
- Relax mode: a metropolis's river landing has a speedboat and a tug instead of a rowboat and
  a sailing ship.
- Pictures: ship-liner, ship-cargo, boat-tug, boat-speed and dock-cargo (Watercraft Kit),
  dock-goods and dock-goods-b (Survival Kit).
- README: Relax mode, the bay and the wharf (both languages).
- Versions: `v4.15.0`.
- Tagged `v4.15.0`.

### Known
- Redrawing takes about as long as before: in the test page a city 320–360 ms (v4.14.2:
  350–403 ms).

## 2026-11-20 – v4.14.2: Relax mode: a lower camera, a stronger perspective

### Changed
- Relax mode: the camp is seen from lower down and its far side closes in more: the ground at
  about 26 degrees instead of 38 (squashed up and down by 0.72 more), the far side drawn at
  36% of the near side's width instead of 55% and 55% of its height instead of 75%.
- Relax mode: zoomed all the way out, the view starts just above the mountains' tops and may
  leave a tenth of the camp's width out at the sides (empty ground), so less sky shows; in a
  window taller than the map, the map's bottom stays at the window's and the sky's colour
  fills the top.
- Relax mode: a double-click on a name sign is for that sign's building, even where a
  building in front covers the one behind.
- README: Relax mode, the perspective (both languages).
- Versions: `v4.14.2`.
- Tagged `v4.14.2`.

### Known
- Redrawing (when a session's status changes) takes a little longer: in the test page a city
  349 ms → 427 ms, a metropolis with 20 sessions 299 ms → 342 ms.

## 2026-11-20 – v4.14.1: Relax mode: a Rearrange button

### Changed
- Relax mode: buildings move only after ✥ *Rearrange* (top right of the camp) is clicked; it
  turns into a green ✓ *Done*, which ends it. Otherwise dragging a building moves the map, as
  dragging anywhere else does.
- Relax mode: while rearranging, ↺ *Reset all* beside it (once any building was moved) puts
  them all back. Right-click → *Reset place* still puts back one.
- README: Relax mode, the Rearrange button (both languages).
- Versions: `v4.14.1`.
- Tagged `v4.14.1`.

## 2026-11-20 – v4.14.0: Relax mode: move the buildings, a harbour and boats

### Added
- Relax mode: drag a session's building to move it (after 6 pixels, so a click and a
  double-click are as before; dragging elsewhere still moves the map). While dragging, a ring
  under the pointer shows where it goes, green where it can stand, red on the water, off the
  map or on another session's building; dropped there it goes back, with a message. The
  other buildings keep their places (the moved one's old spot is left empty); the paths, a
  town's palisade, a city's wall and the houses and stalls round it are laid out anew round
  it. Kept per computer (`amc-relax-places` in the window's storage), by session.
- Relax mode: right-click on a building you moved → *Reset place* puts it back where it was
  laid out.
- Relax mode: a landing from a village on, on the river bank nearest the plaza with room on
  land (in a city, on the road along the river): a wooden pier, a rowboat tied to it, and
  from a town on a moored sailing ship sized to the river.
- Relax mode: boats on the river, rowing slowly up and down and turning with it: a rowboat in
  a village, two in a town and a city; in a metropolis and a megacity three, fishing boats
  and small sailing boats. Pictures from Kenney's *Watercraft Kit* (CC0): `boats.png`,
  `rowboat.png`, `ship-moored.png`, `fishing-boat.png`.
- Relax mode: the era called City is shown as *Medieval City*.
- README: Relax mode, moving buildings, the landing and the boats (both languages).
- Versions: `v4.14.0`.
- Tagged `v4.14.0`.

### Fixed
- Relax mode: a city's wall no longer stands on the river where it crosses it at a slant; it
  stops at each bank with a round tower there (a town's palisade: a tall post).
- Relax mode: a picture drawn at start before the pictures had loaded (fields and roads, no
  buildings) is drawn again once they are in; since `v4.11.3` it could stay until the next
  change, and a weather fade then started from it, the buildings showing only faintly.

## 2026-11-16 – v4.13.0: Relax mode: a town's palisade, a metropolis's old wall

### Added
- Relax mode: a town has a palisade on the same outline as a city's wall, found between its
  buildings: pointed stakes, lower than the stone wall (24 against 40), no towers; where a
  road or the river crosses it, a gate of two tall posts and a beam.
- Relax mode: a metropolis and a megacity keep the old city wall's gates whole (the arches,
  and the gatehouse towers by the avenues, roofed), with about six stretches in ten of the
  rest still standing, broken down to uneven heights, and one corner tower in two, unroofed.
- README: Relax mode, the walls by era (both languages).
- Versions: `v4.13.0`.
- Tagged `v4.13.0`.

### Known
- The low broken stretches in a metropolis are pale against its grey ground; the towers and
  gates stand out.

## 2026-11-16 – v4.12.0: Relax mode's city: a stone wall, cobbles and the square

### Added
- Relax mode: a city's wall. Stone walls with a walk and merlons, a gate arch over every road
  and over the river, a gatehouse tower each side of an avenue and a round tower with a tiled
  roof at each corner, standing up after the perspective warp, depth-sorted with the buildings
  and with shadows. Its outline is found between what stands, never on a building: in 72
  directions from the plaza, just out beyond the buildings there, the cheapest closed ring,
  then straightened into runs and corners. The flat strip along the map's edges is gone.
- Relax mode: a city's streets are cobbled and its plaza paved with flagstones (the medieval
  kit's textures, `tex-street.png`, `tex-brick.png`, `tex-roof.png`, about 17 KB); a
  village's dirt paths get a darker edge.
- Relax mode: the sessions' buildings round the fountain. Only the avenues run within 330 of
  the plaza, and the places round it, as near as a building's ground is off the paving and
  the streets, are offered first; the rest go nearest first. Small town houses, market stalls,
  trees and lanterns fill the rest of the square's edge in a city.
- Relax mode: a city's street lights are medieval lanterns (`lantern-post.png`, made by
  `relax_art.py`): a timber post on a stone foot with an iron bracket and a lantern. At
  night a lamp lights a pool on the ground under it and glows warm, behind what stands in front.

### Changed
- Relax mode: every session's building moves once, to the new places round the square.

### Fixed
- Relax mode: the animals and paddocks could move between the first draw and the next (their
  random numbers depended on which pictures had loaded), so the view jumped once.
- README: Relax mode's city (both languages).
- Versions: `v4.12.0`.
- Tagged `v4.12.0`.

### Known
- A full redraw of a city in real WebKit takes about 195–207 ms (about 145 ms before), the wall's
  share; a town's is unchanged.

## 2026-11-13 – v4.11.3: Relax mode switches in at once

### Fixed
- Switching to Relax mode drew the whole camp anew every time (ground, roads, buildings,
  perspective and shadows), about 0.4 s on a test page and longer on Windows, even when
  nothing had changed. The last picture now shows at once; it is drawn anew a moment later
  only if what it shows changed meanwhile (a session's status, the count, the weather). The
  first switch after a start still loads and draws it all, about 0.9 s on a test page.
- README: Versions (both languages).
- Versions: `v4.11.3`.
- Tagged `v4.11.3`.

### Known
- Measured on a test page with a City of 16 sessions; not yet on Windows.

## 2026-11-13 – v4.11.2: no fireworks at every start

### Fixed
- Relax mode: the fireworks for a new era went off at every start of AMC, seen on Windows.
  For a moment after a start the camp's count can be low while the sessions are still read,
  and that lower era was kept, so the real count right after looked like a new era. Only the
  highest era reached is kept now; the fireworks still go off once when a new one comes.
- README: Versions (both languages).
- Versions: `v4.11.2`.
- Tagged `v4.11.2`.

### Known
- Tried on a test page (a count dropping to 0 and back after a start, then a real new era);
  not yet restarted on Windows.

## 2026-11-13 – v4.11.1: no usage shown at 0%

### Changed
- Usage: a limit at 0% (as shown, so under 0.5% too) has no pie, no bar and no line of
  text, and a tool whose limits are all at 0% (such as Codex at 0% of its 30 days) is not
  shown at all, until it is used. Claude's block and week totals stay, as they are not
  limits; Antigravity still says it is reading its `/usage` until it has.
- README: Usage, Versions (both languages).
- Versions: `v4.11.1`.
- Tagged `v4.11.1`.

## 2026-11-13 – v4.11.0: font size and panel heights

### Added
- ⚙ → *Font size* with − and + (9 to 24, the menu stays open), and Ctrl+Shift+= /
  Ctrl+Shift+- / Ctrl+Shift+0 (14) in a terminal: the text size of all the terminals, kept
  for next time in this window. Plain Ctrl+- is left to the program (Claude Code's undo).
- A bar under the usage: dragging it gives the usage more or less room than the session
  list, in a column of its own and under the tasks.
- With the Session Monitor under the tasks, a bar above it sets its height.
- A double-click on either bar gives back the height it had; both are kept for next time.
- README: Font size, Heights, Versions (both languages).
- Versions: `v4.11.0`.
- Tagged `v4.11.0`.

### Known
- Tried on a test page; not yet in the real AMC window, and Ctrl+Shift+= not with every
  keyboard layout.

## 2026-11-13 – v4.10.1: the MIT license

### Added
- `LICENSE`: Agent Mission Control is under the MIT license, from this version on. xterm.js
  (MIT) and the Relax mode pictures (CC0) keep their own licenses.
- README: License, Versions (both languages).
- Versions: `v4.10.1`.
- Tagged `v4.10.1`.

## 2026-11-13 – v4.10.0: Send feedback fills in the issue

### Added
- ⚙ → *Send feedback…* opens the new GitHub issue already filled in, for someone who meets a
  problem we never saw and would not know how to describe it: a title from the last error,
  three simple questions (what were you doing, what did you expect, what happened), then
  what AMC saw: this run's errors in `amc-web.log` (whole tracebacks; a tab that could not
  start; a tab that quit within 15 s, with its tool's last lines), the error boxes and
  script errors shown on screen, an earlier run's errors, and the version, system, Python
  packages, tool versions, session count per tool, layout and settings.
- Left out: the remote token, session names (each becomes its tool), what was typed or
  shown in a tab, the command line a tab was started with, and the home folder's name. The
  remote servers' dropped connections are not counted as errors. Nothing is sent from AMC:
  the person reads it and submits it on GitHub. On the remote desktop, the other computer
  fills it in and this one's browser opens it.
- README: Send feedback, Versions (both languages).
- Versions: `v4.10.0`.
- Tagged `v4.10.0`.

### Known
- Tried with this computer's real settings and log, and on a test page; not yet opened from
  the real AMC window, on Windows, or from the remote desktop.

## 2026-11-12 – v4.9.0: the brief Session Monitor under the task list

### Added
- With both ⓘ on, the Session Monitor moves under the task list, above the box to Task
  Reminder, and its own column and bar go, so the panes get that room. There a tool's name
  has its own line with its limits under it, and a session's name sits beside a short
  activity line and its status. A Tasks column narrower than 300 px is widened to that
  meanwhile (not saved). Turning either ⓘ off puts it back in its column.

### Fixed
- Brief usage: the bars of all the tools line up in columns, and a percent no longer wraps
  under its bar; a long tool or limit name ends in `…`.
- The session list's ⓘ is at the right end of its head, under the Session Monitor's.
- Brief session list: one line per session, the name (18 characters), the activity line and
  the status side by side, with no gap between them.
- README: Session Monitor, Versions (both languages).
- Versions: `v4.9.0`.
- Tagged `v4.9.0`.

### Known
- Seen on test pages, not yet in the real AMC window.

## 2026-11-12 – v4.8.0: fewer details in the Session Monitor

### Added
- ⓘ at the right of *Session Monitor*: the usage as one line per tool, each limit a short bar
  with its percent (yellow from 70%, red from 90%, as the pies), in place of the text and
  the pies.
- ⓘ beside *Session* in the session list: only the name, its activity line and the status;
  the id and pid, 5h Tok, Up and Updated are hidden.
- Each lights up while on, as Tasks' clock does, and is kept for next time in this window.
- README: Session Monitor, Versions (both languages).
- Versions: `v4.8.0`.
- Tagged `v4.8.0`.

### Changed
- Session list: the activity line under a name is at most 160 px long instead of the whole
  column.

### Known
- Seen on test pages, not yet in the real AMC window.

## 2026-11-12 – v4.7.1: session names no longer cut short

### Changed
- Session list: a session's name and its id use the whole Session column; the activity line
  that took about 110 px beside them is a 12 px strip under them, stretched to the column's
  width. Names like *Session Manager* and the `(pid …)` part show in full; each row is about
  6 px taller.
- README: Versions (both languages).
- Versions: `v4.7.1`.
- Tagged `v4.7.1`.

### Known
- Seen on a test page, not yet in the real AMC window.

## 2026-11-12 – v4.7.0: a tidier ⚙ menu

### Changed
- ⚙: *Session Monitor* is no longer under Layout, where it looked like a third layout next to
  Office and Relax; it is in a *Show* group of its own, greyed in Relax mode, which has no
  such column.
- ⚙: on/off switches are marked ☑/☐ (*Session Monitor*, *Developer mode*), as *Open on
  start* already was; Layout's one-of-two keeps ✓.
- ⚙: developer mode's Update reads *Update to a commit ▸*, without the extra `…`.
- README: Columns, Versions (both languages).
- Versions: `v4.7.0`.
- Tagged `v4.7.0`.

## 2026-11-12 – v4.6.0: Relax mode's names on wooden signs

### Changed
- Relax mode: a session's name is on a small wooden sign in the task board's wood (#a87b4f,
  a dark edge, a light inner line, a soft shadow) with dark brown text, instead of white on
  a dark see-through box. An ended session's sign is weathered grey. The status under the
  name, shown when zoomed in, is dark brown; the ⚒ and ! badges keep their colours.
- README: Relax mode, Versions (both languages).
- Versions: `v4.6.0`.
- Tagged `v4.6.0`.

### Fixed
- Relax mode: a busy or waiting session's name was drawn in its badge's larger font, so it ran
  into the tool's dot in front of it.

### Known
- Seen on test pages by day, at night and zoomed out; the status line when zoomed in and the
  real AMC window are not seen yet.

## 2026-11-12 – v4.5.0: v4.4.2 released as 4.5.0

### Changed
- No change to the tools: v4.5.0 is v4.4.2 under a new version number. Together with
  v4.4.0 to v4.4.2 it brings developer mode, the Session Monitor column that can be hidden,
  picking several sessions in the session list, and no conhost leak on Windows.
- Versions: `v4.5.0`.
- Tagged `v4.5.0`.

## 2026-11-12 – v4.4.2: several sessions at once in the session list

### Added
- Session list: Ctrl+click adds or removes a session, Shift+click picks the range from the
  last one clicked. A right-click on one of those picked acts on all of them: *Copy N rows*
  and *Terminate N sessions* (one after another, without asking, as Terminate always did);
  Open on start, Fork and Model are for one session only. A plain click still picks one.
- README: Session list, Versions (both languages).
- Versions: `v4.4.2`.
- Tagged `v4.4.2`.

### Known
- Tried on a test page, not yet in the real AMC window.

## 2026-11-11 – v4.4.1: Session Monitor can be hidden, no conhost leak on Windows

### Changed
- The two sections below, as a version.
- README: Versions (both languages).
- Versions: `v4.4.1`.
- Tagged `v4.4.1`.

## 2026-11-11 – the Session Monitor column can be hidden

### Added
- ⚙ → *Session Monitor*, under Layout, hides or shows the Session Monitor column; the panes
  take its room. The choice is kept in this window, like the column widths, so the remote
  desktop keeps its own. Relax mode and full width (⇔) are not affected.
- README: Columns (both languages).

## 2026-11-11 – Windows: the Antigravity usage read leaves no console behind

### Fixed
- Windows: reading Antigravity's limits every 10 minutes left one `conhost.exe` behind
  each time, about 360 (1.9 GB) after 3.7 days. The hidden `agy` was only terminated, which
  leaves pywinpty's socket pair open, so its reader thread kept the pty and its console host.
  It is now closed (`close(force=True)`). Linux still terminates it, as ptyprocess's
  `close()` waits forever for the read in progress there.
- This is 486e60f again, on top of v4.4.0. Picking it in developer mode keeps developer
  mode; picking 486e60f itself goes back to before it.

### Known
- Run on Windows in developer mode (05a959b): no `conhost.exe` was left behind. That the
  Antigravity limits still refresh every 10 minutes there is not confirmed.

## 2026-11-11 – v4.4.0: developer mode, Update to any commit

### Added
- ⚙ → *Developer mode*, turned on only after a warning is agreed to and kept in this
  computer's `hud-config.json`. *Update* then lists the last 30 commits of GitHub's
  `master`, with tags marked and the current one dotted, and moves to the one picked,
  newer or older, after asking. It refuses when this copy has commits not on GitHub, is not
  on `master`, or would overwrite changes not committed (`git reset --keep`). Clicking it
  again turns it off.
- README: Developer mode, Versions (both languages).
- Versions: `v4.4.0`.
- Tagged `v4.4.0`.

### Changed
- The Windows fix for the Antigravity usage read (486e60f, closing the hidden `agy`) is
  reverted before this version, as it has not run on Windows yet. In developer mode a
  Windows computer can pick 486e60f to try it.

### Known
- Developer mode has not run in the real AMC window: it was tested in temporary git
  repositories and drawn on a test page.

## 2026-11-07 – v4.3.0: Relax mode's seasons and fireworks

### Added
- Relax mode: seasons, by this computer's calendar (spring from March, summer from June,
  autumn from September, winter from December). Spring: about half the round trees blossom
  pink, twice the wild flowers, fresher grass. Autumn: most trees orange, red or yellow
  (about a third of the pines stay green), golden grass, fewer flowers. Winter: snow on the
  trees, the round ones bare, duller grass, no flowers. Each tree keeps its colour (from
  where it stands); the recoloured pictures are made once and kept. The top left label shows
  the season.
- Relax mode: fireworks when the camp reaches a new era: rockets from below bursting over the
  camp for about 10 seconds, at 30 frames a second on a canvas of their own, and "🎆 Town →
  City 🎆" at the top. The era reached is kept per computer (`amc-relax-era`), so a restart
  does not set them off again, and the first time Relax mode is shown only notes it.
- README: Relax mode, seasons and fireworks (both languages).
- Versions: `v4.3.0`.
- Tagged `v4.3.0`.

### Known
- On a page opened from `file://` the trees keep their summer colours (the browser does not
  let the page read the pictures); Agent Mission Control loads them from its own server.

## 2026-11-07 – v4.2.1: Relax mode: many sessions no longer overlap

### Fixed
- Relax mode: with many sessions, a building could stand under the room kept for another
  one's skyscraper, so its name and click area were under the other's: on the 20-session
  test pages Session 18 and 19 were under Session 2, and one of 20 could not be
  double-clicked. Each session still keeps room for a skyscraper (2 building widths high);
  when that leaves any two on each other, the whole camp is laid out again keeping 1.4, then
  0.7. With few sessions nothing moves.
- Versions: `v4.2.1`.
- Tagged `v4.2.1`.

### Known
- With many sessions, a session that later grows into a tall tower may hide the one behind it.

## 2026-11-07 – v4.2: Relax mode's weather

### Added
- Relax mode: weather. Each half hour is cut in two at a random point 10 to 20 minutes in,
  and each part has its weather, unlike the one before: clear, cloudy, rain or fog, and from
  November to February snow (a winter's odds: clear 30%, cloudy 25%, snow 20%, fog 15%, rain
  10%; otherwise clear 40%, cloudy 27%, rain 20%, fog 13%). It comes from the clock, so every
  window shows the same. No network.
- Cloudy: a grey sky with 34 more clouds; rain: a dark sky full of grey cloud, the ground
  darker and wet, animals standing still; fog: white, thicker far off; snow: snow lying on
  the ground in drifts, the hills beyond the map white.
- Rain (650 drops) and snow (550 flakes) fall in the world, each to a point on the ground,
  so far ones are smaller and slower and zooming in brings them close; on a canvas of their
  own, 20 times a second, only while it rains or snows and the camp shows.
- A change of weather fades in over 3 minutes: the old picture under the new one, composed
  every 3 seconds, and the rain or snow thinning or thickening with it.
- The top left label shows the weather now.
- README: Relax mode, weather (both languages).
- Versions: `v4.2`.
- Tagged `v4.2`.

### Known
- A full 3-minute change has not been watched end to end; the fade was checked at 25% and
  60% on test pages.

## 2026-11-07 – v4.1.2: Relax mode: a city's windows at night, fences in front of animals

### Fixed
- Relax mode: a city's windows did not light at night; only a metropolis's and a megacity's
  did. New `tools/relax_lit.py` makes `med-*-lit.png` (20 pictures, 80 KB) from the
  medieval pictures: their dark glass, away from the roofs, seven panes in ten on. A city
  loads them with its pictures and lights them as a metropolis does.
- Relax mode: an animal in a paddock was drawn over its front fence, so it looked outside it.
  The front fences are now on a layer of their own, drawn again over each penned animal
  (only there, so a tree in front of a fence keeps its place).
- README: a city's lit windows, `relax_lit.py` (both languages).
- Versions: `v4.1.2`.
- Tagged `v4.1.2`.

### Known
- A few door edges in a city light up with the windows.

## 2026-11-07 – v4.1.1: Relax mode's animals and paddocks

### Added
- Relax mode: animals, from `animals.png` (Quaternius' *Ultimate Animated Animal Pack*,
  rendered by `relax_art.py`), with the people's 5 Hz step and redraw. A tribe has deer,
  stags, foxes and a wolf; a village and a town two cows and a bull in one paddock, two
  horses, a donkey and an alpaca in another, and deer, a stag, a fox and a wolf loose; a city
  three horses and a donkey in a paddock outside its wall, dogs, a deer, a stag and a fox; a
  metropolis and a megacity dogs, a deer and a fox. Tame ones loose live near the buildings,
  wild ones anywhere on the grass. They graze, wander round their home (dogs, foxes and
  wolves faster and further) and stand; at night (20:00 to 5:30) they keep still.
- Relax mode: paddocks, a rectangle of fence square to the map (360 by 168, a city's 270 by
  126), drawn as posts and rails after the perspective warp so they narrow away from the
  camera; never on a road, the river, a building or another paddock, and nothing grows in
  them. The view, zoomed all the way out, takes them in too.
- Relax mode: the people and the animals cast the shadow of their own outline, as the
  buildings do.

### Changed
- Relax mode: a village's and a town's loose fences are gone; fences are only round paddocks.
- README: Relax mode, animals (both languages).
- Versions: `v4.1.1`.
- Tagged `v4.1.1`.

### Known
- An animal is drawn over the front fence of its paddock, as the people are over buildings.
- CPU on the WebKit test pages, with the animals: a town about 5.7% of one core (as before),
  a megacity about 5.9%; WebKit memory about 16 MB more (the animals' shadow outline).

## 2026-11-06 – v4.1: Relax mode in perspective, sessions as trades with yards

### Changed
- Relax mode: the camp is seen in perspective. The world is drawn flat with a margin round
  the map, then the ground is warped row by row: its far side (the top) is drawn at 55% of
  the width of the near side and 75% of the height. Buildings, lamps and trees are stood up
  after the warp, straight, sized for where they stand. Names, people, fires, the night's
  lights, a metropolis's lit windows and clicks follow the same warp.
- Relax mode: roads, the river and bridges are stroked with a pen squashed like the ground,
  so a road across the screen is thinner than one up it.
- Relax mode: the far ground is hazier and the near ground a little darker; every building,
  yard, lamp, tree and rock casts the shadow of its own outline to the right (a tower's long,
  a wreck's short).
- Relax mode: zoomed all the way out, the view frames the buildings (and the mountains above
  them) instead of the whole map, so the empty corners the tilt leaves stay out of it.
- Relax mode: hills, scattered woods and rocks beyond the map's sides, and a fringe of trees
  along them inside it. The mountains are twice as high, to stand above the far side.
- Relax mode: from a village on, a session's house (50 messages) or tower (200) may be a
  trade instead, fixed per session: shop, smithy, tavern, sawmill or warehouse; church, town
  hall or windmill; in a metropolis a café, a mall or other towers. Each session's building
  has a yard of one or two smaller ones behind it (a farm, stall, shed, fountain…).
- README: Relax mode (both languages).
- Versions: `v4.1`.
- Tagged `v4.1`.

### Known
- Redrawing (only when a building, status or the time of day changes) takes about 150–450 ms
  on the test pages, up from 70–270 ms; dragging and zooming do not redraw. The flat canvas
  with its margin is about 4980×2415 pixels at 1.5× screens. Not yet measured in the real
  window.

## 2026-11-06 – v4.0.2: Relax mode's landscape: mountain ranges, sky, woods and ponds

### Changed
- Relax mode: the mountains are two continuous ranges instead of a row of separate peaks: a
  pale far range and a green near one, their ridge line smooth noise so no two stretches
  look alike, lit from the left with a shaded face down from every top, and snow on the
  tops. Both ranges fill down to the ground, so no sky shows under them.
- Relax mode: a sky with clouds behind the mountains, hazier over a metropolis; wooded
  foothills with pines in front of them; the river comes out from under the foothills.
- Relax mode: the grass has patches, tufts and drifts of wild flowers; ponds, woods, single
  trees and rocks where there is room. All of these are many in a tribe and fewer as the
  camp grows into a city.
- Versions: `v4.0.2`.
- Tagged `v4.0.2`.

## 2026-11-06 – v4.0.1: Relax mode's buildings face the road, street lights by era

### Fixed
- Relax mode: the bar beside the camp did not resize it. Relax mode hides the two columns the
  bar measured, so the camp shrank to its least width at the first drag and stayed there.
- Relax mode: every building faced the same way. Each now has its door towards the road
  beside it, drawn mirrored where the road is on its right; a session's person and a
  village's or town's road to the door follow it. A mirrored picture is lit from the right.
- Relax mode: street lights start in a city. A tribe, a village and a town have none, so a
  town is darker at night than before. A city has its lanterns, a metropolis and a megacity
  modern lamps (`lamp.png`, `lamp-double.png`, made by `relax_art.py`) with their arms over
  the road, two arms on an avenue.
- README: Relax mode, CPU in the full window (both languages).
- Versions: `v4.0.1`.
- Tagged `v4.0.1`.

### Known
- CPU in the full window, measured at a town (547 messages, dusk, 2026-11-05): Relax mode
  about 9.1% of one core, Office mode 9.05%. The biggest era is still measured only on a test
  page.

## 2026-11-05 – v4.0: Relax mode's new camp, from a tribe to a megacity

### Changed
- Relax mode's sections below, together: terrain, a fixed map with wheel zoom, six eras,
  buildings under construction, and the camp showing after dark.
- README: the CPU figure of Relax mode, which was unverified, is replaced by what was
  measured.
- Versions: `v4.0`.
- Tagged `v4.0`.

### Known
- Published before the full test. CPU is measured only on a test page without terminals:
  about 5% of one core at 12000 messages, day and night. The limit of 10% is not confirmed in
  the full window.
- Animals and traffic are not in this version; they move to 4.x. `web/relax/animals.png` is
  in the repo but not used yet.
- With 20 sessions, one can be hard to double-click at fit zoom, as a tower stands in front
  of it; zooming in works. Double-clicking a discussion in the camp is not verified. A city's
  windows do not light at night; a metropolis' and a megacity's do.

## 2026-11-05 – Relax mode: the camp shows after dark

### Fixed
- Relax mode: from dusk to dawn the camp was hidden under one solid colour. WebKitGTK showed
  the night canvas's `mix-blend-mode: multiply` as an ordinary opaque canvas. The dark is now
  a see-through colour with the lights cut out of it, so it needs no blending. It also covers
  the strip around a map that does not fill the window.

## 2026-11-05 – Relax mode: six eras, a camp that fills up, old and new side by side

### Added
- Relax mode: a sixth era, the megacity, at 10000 messages. The eras now start at 0, 100, 500,
  1000, 5000 and 10000.
- Relax mode: a city's buildings are from Quaternius' Medieval Village MegaKit, with windows,
  doors and a room behind them added, and roofs recoloured so that only sessions' are red or
  teal. The earlier Kenney buildings are a village's and a town's.

### Changed
- Relax mode: buildings that are nobody's come one by one: one per 100 messages up to 1000,
  then one per 500. At each new era a random half of those standing go up one style.
  A session's building always takes on the new era's.
- Relax mode: a session's building is drawn at 1.2 times its size, the others at 0.8.
- Relax mode: everyone keeps their place from era to era. Existing sessions move once, with
  this change.
- Relax mode: pictures only a city and a metropolis use load when the camp reaches them.
- README: Relax mode (both languages).

## 2026-11-05 – Relax mode: a fixed map, a real city, and a metropolis

### Added
- Relax mode: a fifth era, the metropolis, from 5000 messages: asphalt, towers, a mall, parks
  and car parks, no wall. A session's building follows it: a stall, a shop, flats, an office,
  a skyscraper, with teal or red roofs, and a cleared site when it has ended.
- Relax mode: the wheel zooms around the pointer and dragging moves the map. Names are drawn
  at one size on a canvas of their own.
- Relax mode: a city has a plaza, avenues, a road along each bank and side streets that branch
  off them, with bridges only on the avenues. It has shops, a tavern, a smithy, a sawmill,
  warehouses, a church, a town hall, farms, windmills, a watermill and 14 kinds of house, each
  where it belongs.
- A busy session's building is under construction.
- Relax mode: a metropolis's windows light up at night, on a canvas of their own over the
  dark, and a discussion there is a fire pit with benches and parasols.
- `relax_art.py`: make only the pictures named on its command line. The pictures now also use
  Kenney's City Kit (Commercial) and Car Kit, and `animals.png` from Quaternius' Ultimate
  Animated Animal Pack (all CC0), made but not yet shown.

### Changed
- Relax mode: the map is one size, 1800 x 1350, in every window, rather than growing with
  the sessions. Buildings no longer move when the window does.
- Relax mode: more street lights in a town, a city and a metropolis, and more buildings in a
  metropolis's outskirts.
- README: Relax mode (both languages).
## 2026-11-05 – v3.5.18: a popup after Update lists what it brought

### Added
- After *Update*'s restart, a popup lists the titles of the `CHANGELOG.md` sections this
  update brought, once: they are kept in `Session HUD/update-note.json` (not in git), which
  goes as it is read. OK or Esc closes it. A copy on older code writes no list, so its update
  to this version shows no popup; the next one does.
- README: Update, Versions (both languages).
- Versions: `v3.5.18`.
- Tagged `v3.5.18`.

## 2026-11-05 – v3.5.17: Update goes to tagged versions only

### Changed
- ⚙ → *Update* moves forward to the newest version tag on GitHub's `master` instead of
  `git pull`, so commits after that tag, which may still have bugs, are not taken. A copy
  already past the tag stays where it is. A folder that is not a clone becomes one at that
  tag. A tag moved after a fix is followed. A copy still on older code pulls `master` one
  last time when it updates to this version.
- README: Update, Versions (both languages).
- Versions: `v3.5.17`.
- Tagged `v3.5.17`.

## 2026-11-05 – web links in terminals open

### Fixed
- An `http://` or `https://` address in a terminal was plain text, so a click did nothing. It
  is now a link, also when it goes on in the next row, and opens in the default browser of the
  computer you are at: `Api.open_url` in the AMC window (http and https only), the browser's
  own on the remote desktop, which cannot call `open_url`.
- A link a program marks itself (OSC 8) did nothing in the AMC window. It opens the same way.
- On the phone, an address in a *Chat* message is a link to the phone's browser. The *Term*
  view has no links.
- README: Phone page, Remote desktop (both languages).

## 2026-11-05 – paths with spaces in links

### Fixed
- A full path with spaces and no backticks was cut at the first space, in terminals and in
  the phone's *Chat*. The next words (at most 6) are now tried too, longest first, and the
  link reaches the last word that looks like more of a path. A path the AI broke onto the
  next line at a space is tried with the space as well.
- README: Remote desktop (both languages).

## 2026-11-05 – paths in terminals open their files

### Added
- A full path in a terminal of the AMC window is a link: a click opens the file with its
  default app (`Api.open_path`). A program or a script opens its folder instead. The remote
  desktop's click still downloads; it cannot call `open_path`.
- README: Remote desktop (both languages).

## 2026-11-05 – Cross-check: follow-ups show what was asked

### Fixed
- A Cross-check follow-up went to the participants but was not kept, so its tab showed only
  the answers. It is now saved (`followUps` in the discussion's file) and shown under its
  `Follow-up N` heading. Follow-ups asked before this have no text to show.
- README: Cross-check (both languages).

## 2026-11-05 – Relax mode: the board does what the Tasks column does, day and night

### Added
- Relax mode's board: a click on a task's date opens the calendar, *History* shows the
  finished and discarded tasks with a restore on their status, and a box writes to Task
  Reminder, so nothing of the Tasks column needs Office mode.
- Relax mode: day and night by this computer's clock. A colour multiplied over the camp (a
  canvas of its own, drawn again only as the hour moves on, none at all by day), pale around
  the lit buildings and the lanterns; names, badges and the era's label stay bright.

### Fixed
- Relax mode: the board's height moved with its list, and the camp's layout with it, so a
  task added or History shown moved the buildings. The board has a fixed height now.
- README: Relax mode (both languages).

## 2026-11-05 – Relax mode: from a tribe to a city

### Added
- Relax mode: the whole camp grows with the messages of all the `agents.json` sessions,
  ended ones included: a tribe from 0, a village from 100 (dirt paths, a signpost, fences),
  a town from 500 (stone roads, lanterns, a fountain, stalls), a city from 1500 (wide brick
  roads, street trees, a wall). The top left of the camp shows what it is now and when the
  next one comes.
- Roads wind, end in front of a building's door, and go round buildings and props; trees
  keep off them.
- New pictures from Kenney's kits: fence, signpost, lantern, stalls, fountain, street tree.

### Changed
- Relax mode: names and status badges are drawn over everything, so a building no longer
  hides the name of the one behind it.

### Fixed
- An edited `relax.js` did not load: the browser cache kept the old one, since only the
  page's URL had a version. It now has one too, from the newer of the two files.
- `relax_art.py` uses its own port, so it no longer loads a running AMC's page.
- README: Relax mode (both languages).

## 2026-11-03 – v3.5.16: the remote desktop's 📎 in the tab bar's colors

### Changed
- Remote desktop: *📎* is drawn as a line icon in the tab bar's color (it follows the theme
  and lights up under the mouse like `+ ⇔ ⚙`); the emoji kept its own grey colors.
- Versions: `v3.5.16`.
- Tagged `v3.5.16`.

## 2026-11-03 – remote desktop: 📎 upload, paths broken across lines

### Added
- Remote desktop: *📎* left of `+` uploads files picked from that computer to the active
  tab, the same way as a drop. A Vivaldi app window did nothing on a drop.
- Remote desktop: files can be dropped anywhere on the page (over a pane: that tab,
  elsewhere: the active tab).

### Fixed
- Remote desktop: a path the AI broke onto the next line itself (Claude Code does at about
  the width) was cut at the break, so its download said "no such file". A row that ends at
  the right edge now goes on in the next one, after its indent; the file is tried whole,
  then up to each break, in case the next line was words.
- README: Remote desktop (both languages).

## 2026-11-03 – getting files back on the phone and the remote desktop

### Added
- `/api/download?path=<full path>` (phone page and remote desktop, with the token): any
  file of the computer, up to 500 MB, sent 1 MB at a time.
- Phone page: full paths in *Chat* messages are links that download the file; *⬇* next
  to 📎 takes a path typed in. Progress under the screen, what went wrong in a box.
- Remote desktop: full paths in a terminal are links (wrapped rows and wide characters
  before them included) that download the file; progress at the bottom right.
- README: Phone, Remote desktop (both languages).

## 2026-11-03 – v3.5.15: files dropped on the remote desktop, uploads up to 500 MB

### Added
- Remote desktop: files dropped on a terminal are uploaded to the computer running AMC
  (`/api/upload`, as the phone's 📎) and their paths there typed into that pane, quoted for
  that computer's shell. Before, the browser's own paths were typed, which that computer
  cannot read. Progress shows at the bottom right.

### Changed
- Uploads (phone 📎 and remote desktop) go up to 500 MB, from 20 MB, and are written to
  disk 1 MB at a time instead of held in memory; one cut short is removed.
- README: Phone, Remote desktop (both languages); Versions: `v3.5.15`.
- Tagged `v3.5.15`.

## 2026-11-03 – v3.5.14: the remote desktop's terminals take its size when used

### Changed
- Remote desktop: the smaller font for a terminal larger than its pane (just below) made
  the text too small. Instead the terminals' size is set by the window used last: a click or
  a key in the browser gives the shown terminals the browser's pane size (and resizing the
  browser follows while it is in use), a click or a key in the window on the computer takes
  them back. The font stays 14. `Api.resize` passes on only a change of size.
- README: Remote desktop (both languages); Versions: `v3.5.14`.
- Tagged `v3.5.14`.

## 2026-11-03 – the remote desktop's terminals fit its window

### Fixed
- Remote desktop: a terminal larger than its pane in the browser lost its bottom rows, with
  the message box of Claude Code and Codex, and its right edge. It now gets a smaller font
  (down to 6) until all of it shows, and 14 again when it fits. The terminals keep their size.
- README: Remote desktop (both languages).

## 2026-11-02 – v3.5.13: Accounts as a second-layer list

### Changed
- ⚙ → *Accounts ▸* is its own list with a way back, like *Theme ▸* and *Default AI ▸*. The
  accounts are read when it opens, so ⚙ no longer asks each tool for its account.
- README: Settings (both languages); Versions: `v3.5.13`.
- Tagged `v3.5.13`.

## 2026-11-02 – v3.5.12: tasks and new sessions on the phone, ⚙ → Restart

### Added
- Phone page, *Tasks*: the desktop's task list. A task's due date and status change where
  they show (*Finished* and *Discard* ask for the result or reason), *History* has the
  finished and discarded tasks with *Restore*, and a box writes to Task Reminder. The
  desktop's list updates at once (`/api/tasks`, `/api/task-history`, `/api/task-status`,
  `/api/task-due`, `/api/task-restore`, `/api/task-send`).
- Phone page, *+*: a new session with an AI tool installed on the computer, the Default AI
  first; a name already there asks before replacing (`/api/tools`, `/api/new`).
- ⚙ → *Restart*, above *Update*: asks, then restarts AMC the way *Update* does.
- README: Phone, Settings (both languages); Versions: `v3.5.12`.
- Tagged `v3.5.12`.

## 2026-11-02 – v3.5.11: the remote links as QR codes

### Added
- ⚙ → *Remote Access AMC ▸*: *▦ Show as QR code* under the phone link and the remote desktop
  link shows that link as a QR code below them, black on white in any theme, to scan with
  the phone's camera; the same row again hides it. Drawn by `web/vendor/qrcode.js`
  (qrcode-generator 1.4.4, Kazuhiko Arase, MIT), so it works offline.
- README: Remote access (both languages); Versions: `v3.5.11`.
- Tagged `v3.5.11`.

## 2026-11-01 – Send feedback goes to GitHub Issues

### Changed
- ⚙ → *Send feedback…* opens a new GitHub issue in the default browser instead of an email,
  so the author's email address is no longer in the code.
- README: Settings (both languages).

## 2026-11-01 – v3.5.10: no Claude usage without Claude Code

### Changed
- Without Claude Code installed, the usage panel has no CLAUDE section (5H BLOCK, TODAY/WEEK,
  MODELS, the pies) and does not wait on "USAGE scanning..." for it; the phone's usage
  leaves Claude out too. With no section at all it says so.
- README: Settings (both languages); Versions: `v3.5.10`.
- Tagged `v3.5.10`.

## 2026-11-01 – v3.5.9: pinning to the taskbar on Windows

### Fixed
- A taskbar pin of Agent Mission Control showed python's icon and ran pythonw.exe: Windows
  pins the process unless the window says otherwise. The window's property store now gets
  System.AppUserModel.RelaunchCommand (the launcher, `launch-agents.ps1`, hidden),
  RelaunchIconResource (`mission-control.ico`), RelaunchDisplayNameResource and the same
  AppUserModel ID as the process. A failure is logged (`amc-web.log`). An old pin has to be
  unpinned and pinned again.
- README: Setup step 4 (both languages); Versions: `v3.5.9`.
- Tagged `v3.5.9`.

## 2026-11-01 – v3.5.8: the phone's Chat button on Antigravity

### Fixed
- On the phone page an Antigravity session's *Chat* button was disabled with no sign of
  why, so pressing it did nothing. It is now greyed but pressable, and says "Antigravity
  has no Chat view (its conversations cannot be read): Term only".
- Versions: `v3.5.8`.
- Tagged `v3.5.8`.

## 2026-11-01 – v3.5.7: New token, and a warning

### Added
- ⚙ → *Remote Access AMC ▸* warns under the links: anyone with one who can reach your
  Tailscale network can control this computer through its AI sessions.
- *New token…* there (after asking): a new token in `hud-config.json`, in force at once.
  The servers now read the token from the "remote" settings on every request, so the old
  links get 403 without a restart.
- README: Phone (both languages); Versions: `v3.5.7`.
- Tagged `v3.5.7`.

## 2026-11-01 – v3.5.6: deleting Cross-checks

### Added
- `+` → *History*: a `✕` by each Cross-check deletes its file in `Session HUD/discussions/`
  for good, after asking (its question, answers and conclusion live only there); its `⚖`
  tab closes too. A running one cannot be deleted.
- README: Cross-check (both languages); Versions: `v3.5.6`.
- Tagged `v3.5.6`.

## 2026-11-01 – v3.5.5: same-name sessions, deleting closed ones

### Added
- `+` → *History*: a `✕` by each closed session deletes it from `agents.json` (and its pins)
  after asking; its conversation stays in its tool's history.

### Changed
- A new session or fork with a name already in `agents.json` no longer just fails: it says
  the old one will be replaced and offers *Replace it*, which puts the new entry in the old
  one's place (its tab closed, its pins dropped). A fork cannot take its source's name.
- README: Tabs (both languages); Versions: `v3.5.5`.
- Tagged `v3.5.5`.

## 2026-11-01 – v3.5.4: Update restarts on Windows

### Fixed
- ⚙ → *Update* on Windows said "restarting…" but did not restart: the launcher was started
  as PowerShell with `DETACHED_PROCESS` (no console), which likely ended at once. Now a
  helper with a hidden console of its own (out of the window's job when allowed) waits for
  this process to end, then runs the launcher; the window closes itself as its close button
  does. Linux the same, with `sh`. Both steps are logged (`amc-web.log`).
- Versions: `v3.5.4`.
- Tagged `v3.5.4`.

## 2026-11-01 – v3.5.3: Agy in Accounts, pasting screenshots on Linux, the version in ⚙

### Added
- ⚙ → Accounts lists *Agy · Switch…*: an `Agy login` tab running `agy` that types
  `/logout` once it is up (agy logs in and out only inside itself); `/login` is typed
  there, and quitting agy closes the tab. No account is shown: agy has no command for it.
- The foot of ⚙ shows the version, `git describe --tags --long` (`v3.5.3-0-g<commit>`), or
  without git the newest version in CHANGELOG.md.

### Fixed
- A screenshot tool that puts only a file link on the clipboard (`file://…`, no image)
  pasted nothing: it is read as an image, otherwise that file's path is typed.
- On Linux, when GTK finds no image on the clipboard, `wl-paste` (Wayland) or `xclip` (X11)
  are asked; a paste that still finds none logs the session type, what the clipboard
  offered and which tools are there to stderr (`amc-web.log`).
- README: Accounts, Images (both languages); Versions: `v3.5.3`.
- Tagged `v3.5.3`.

## 2026-11-01 – v3.5.2: Remote Access AMC, a shorter ⚙ menu

### Added
- ⚙ → *Remote Access AMC ▸*: the steps in order, each ticked when done or a button for it:
  *Install Tailscale* (a tab: `tailscale.com/install.sh` then `sudo tailscale up` on Linux,
  `tailscale-setup-latest.exe` on Windows), *Log in to Tailscale* (a `tailscale up` tab),
  *Turn on remote access* (a new token and `"desktopPort": 8771` in `hud-config.json` when
  there is none, served without a restart); then the phone (8770) and remote desktop (8771)
  links with the token, copied on click. *Check again* reads it all again.

### Changed
- ⚙ → *Theme ▸* and *Default AI ▸* are second-layer lists (with *◂ Back*); the first layer
  shows the current one ("Theme: Classic ▸"). The menu went from 22 lines to 10.
- `+` → *New Antigravity session…* is now *New Agy session…*.
- README: Phone, Theme, Default AI, Antigravity tabs (both languages); Versions: `v3.5.2`.
- Tagged `v3.5.2`.

## 2026-11-01 – v3.5.1: Update restarts, non-clone folders, installing on Windows

### Changed
- ⚙ → *Update from GitHub* is now *Update*. It asks first, and after pulling a new version
  restarts Agent Mission Control through its launcher (`launch-agents.ps1` /
  `launch-agents.py`, which close the old window as its close button does); already up to
  date or an error, it stays.
- `+` → *Download and install it* keeps the menu open while it starts and shows why it
  could not start there (in red); a tab that ended at once says so. *Switch…* (Accounts)
  shows its error too. Both failed silently before.
- An install or login tab's last output, how long it ran and, when it could not start, its
  command go to stderr (`Session HUD/amc-web.log` on Windows).

### Fixed
- *Update* said "this folder is not a git clone" for a downloaded zip or a copied folder.
  It now makes it one: `git init`, `origin` =
  `https://github.com/Qertile/Agent-Mission-Control.git`, fetch `master`, a tools file that
  differs from GitHub's copied to `.update-backup/<time>/` (`.gitignore`d) and then replaced;
  your own `.gitignore`d files are left alone. Git is installed first when missing.
- `+` → *Download and install it* on Windows only printed `irm … | iex` (cmd.exe turned the
  inner quotes of `-Command "…"` into `\"`), and with `-EncodedCommand` said "access denied".
  The tab now runs `powershell.exe -File <temp>\amc-install-<tool>.ps1` itself (no cmd.exe),
  whose first line runs `irm <url>.ps1 | iex` in a PowerShell of its own, so the installers'
  `exit` does not close the tab before *Press Enter to close*.
- README: Update, Installing a tool (both languages); Versions: `v3.5.1`.
- Tagged `v3.5.1` (an earlier `v3.5.1` and `v3.5.2` were withdrawn).

## 2026-10-31 – v3.5: move Task Reminder and Session Manager to the Default AI

### Added
- ⚙ → *Default AI* asks when `Task Reminder` / `Session Manager` are on another tool
  (and says which one is working and would be stopped): *Move them to …* replaces each
  entry in place (new id, the new tool, no model) and restarts an open one; *Only for new
  ones* changes the setting only.
- The move writes the old conversation's last 50 messages (Claude or Codex; not
  Antigravity) to `Agents Launcher/handoff/<name>.md` (`.gitignore`d), and the new tab's
  first prompt asks it to read that first. Tested with a real Codex tab: it read the file,
  then `CLAUDE.md`, and answered "Task Reminder 就緒".

### Fixed
- The phone's chat view (and the handoff) read Codex 0.16x rollouts, which have
  `item_completed` UserMessage / AgentMessage events instead of `user_message` /
  `agent_message`; Codex chats were empty before.
- README: Default AI (both languages); Versions: `v3.5`.
- Tagged `v3.5`.

## 2026-10-31 – v3.4: install a missing AI tool from +

### Added
- `+` marks a tool that is not installed as *New … session… (install)*; clicking it offers
  *Download and install it*, which opens an `Install …` tab (not in `agents.json`) running
  the maker's own installer: `claude.ai/install`, `chatgpt.com/codex/install`,
  `antigravity.google/cli/install` (`.sh` with curl, or wget, on Linux; `.ps1` through
  `irm | iex` on Windows). Enter closes it.
- After such a tab, and the Accounts login tabs, Agent Mission Control adds to its own PATH
  what the installer added (Windows' saved PATH, and `~/.local/bin`), so the new tool works
  without a restart.
- README: Installing a tool (both languages); Versions: `v3.4`.
- Tagged `v3.4`.

## 2026-10-31 – v3.3: switch AI accounts

### Added
- ⚙ → *Accounts*: the account each installed tool is logged in with (Claude's email from
  `claude auth status --json`, Codex's `codex login status`), filled in after the menu
  opens. *Switch…* opens a temporary `Claude login` / `Codex login` tab (not in
  `agents.json`) running `claude auth logout` + `claude auth login` or `codex logout` +
  `codex login`, which closes on Enter. Antigravity has no login command, so it is not listed.

### Changed
- A tab gone from the tab list (a finished login tab, a session removed from
  `agents.json`) is now taken off the tab bar.
- README: Accounts (both languages); Versions: `v3.3`.
- Tagged `v3.3`.

## 2026-10-31 – v3.2: Default AI, Update installs git

### Added
- ⚙ → *Default AI*: Claude, Codex or Antigravity (installed ones only) for `Task Reminder`
  and `Session Manager`, made on their first send; kept as `"defaultTool"` in
  `hud-config.json`. Existing tabs keep their tool. With none picked, or the picked one
  not installed: Claude Code, otherwise Codex, otherwise Antigravity.

### Changed
- ⚙ → *Update from GitHub* installs git when there is none: on Windows the latest MinGit
  from Git for Windows' GitHub releases (64-bit or ARM64) into
  `%LOCALAPPDATA%\Programs\MinGit`, no admin, used by Agent Mission Control only (not
  added to PATH); on Linux `pkexec apt-get install -y git`.
- README: Default AI, Chat box, Update from GitHub (both languages); Versions: `v3.2`.
- Tagged `v3.2`.

## 2026-10-31 – v3.1: Codex fork, no-Claude PCs, Update and Feedback

### Added
- Forking a Codex session: right-click → *Fork…* or `+` → *Fork session…* adds a
  `"tool": "codex"` session with `"fork_of": "<thread>"` and starts it with
  `codex fork <thread>` (its model too); the new thread is found as a new Codex tab's.
  Antigravity has no fork, so *Fork…* stays grey on its sessions.
- ⚙ → *Update from GitHub*: `git pull --ff-only` in this folder, the result under it
  ("Already up to date", "Updated: restart …", or git's error); needs git and a clone.
- ⚙ → *Send feedback…*: a new email to the author, titled "AMC Feedback", in the default
  mail app (on the remote desktop page, that computer's).

### Changed
- `Task Reminder` and `Session Manager`, made on their first send, are Claude tabs when
  Claude Code is installed, otherwise Codex, otherwise Antigravity.
- `+` → *New session…* is now *New Claude session…*; every new session's name box says
  "Session Name".
- README: Fork, Update from GitHub, Send feedback, Chat box (both languages); Versions: `v3.1`.
- Tagged `v3.1`.

## 2026-10-31 – v3.0: installing on a new PC

### Changed
- `install.ps1` (Windows) offers to install each missing item instead of only listing
  it, just for this user, no admin needed: Claude Code (Anthropic's installer, its
  `.local\bin` added to PATH), Python 3.12.10 from python.org (x64 or ARM64, before the
  Store stub on PATH, then the pip modules in the same run), the NuGet provider before
  ImportExcel, and DejaVu Sans Mono 2.37 from GitHub into the user's fonts.
- `install.sh` (Linux) offers one `sudo apt install` for the missing packages (with
  `curl` when Claude Code is missing), then Claude Code with Anthropic's installer.
- Claude Code, Codex and Antigravity are each optional in both installers (`OPTIONAL`);
  only having none of the three counts as missing. Without Claude Code, a new
  `agents.json` starts with no tabs instead of a Claude tab that cannot start.
- `+` → *New session…* says "claude is not on PATH" when it is missing, like Codex and
  agy, instead of adding a tab that cannot start.
- README: Requirements, Setup and Linux (both languages); Versions: `v3.0`.
- Tagged `v3.0`.

## 2026-10-31 – v2.7: Relax mode

### Added
- **Relax mode** (⚙ → *Layout* → *Relax*, kept per computer): the Tasks and Sessions
  columns become a camp seen from above (`web/relax.js`), merged from the `relax-mode`
  branch.
  - A building per session, scattered, growing with the messages typed into it
    (transcripts read as they grow; Antigravity: 6 per hour open): campfire 0, tent 1,
    cabin 10, house 50, tower 200. An ended session is a wreck, its name dark grey.
  - Its person by status: busy works, waiting waves, idle sits and strolls every 20–40 s.
  - Cross-check discussions as a campfire with the models on logs, the answering one
    standing, flames while a step runs.
  - A sticky top bar: the open tasks on a board (status click opens the status menu) and
    stamina bars (each tool's limits left).
  - Hover for name, status and messages; double-click shows the tab, starts an ended
    session or opens a discussion; right-click is the session menu.
  - Drawn only when it changes, people on a 5 Hz timer redrawing only their squares:
    about 7% of one core against Office's 4%, +17 MB; nothing while hidden or in Office.
  - Pictures: Kenney's Survival Kit and Fantasy Town Kit (CC0), made once by
    `tools/relax_art.py` + `relax_art.html` (not used at run time).
- The session rows carry `turns` (messages typed) and the tab list each tab's `tool`.
- README: *Relax mode* (both languages); Versions: `v2.7`.
- Tagged `v2.7`.

## 2026-10-31 – v2.6.1: fork a session

### Added
- **Fork** a Claude session: right-click it → *Fork…*, or `+` → *Fork session…* with any
  Claude session id, then a name. The new `agents.json` entry has `"fork_of"` and its
  first start runs `claude --resume <source> --fork-session --session-id <new id>`, so it
  goes on from the source's conversation under its own id; the source is untouched.

### Fixed
- **Clicking in a Claude or Codex tab puts the typing there again.** v2.6's drag-select
  took the left button from xterm.js, which then did not focus the terminal: typing only
  went in after clicking right at the cursor.
- README: *Working in the window*, *Fork* (both languages); Versions: `v2.6.1`.
- Tagged `v2.6.1`.

## 2026-10-30 – v2.6: pinned messages

### Added
- **Pins, each session its own, the same on the desktop, the remote desktop and the
  phone** (`pins.json` next to `agents.json`, not committed). Desktop: right-click
  selected text → *📌 Pin* or *Copy*; a pane with pins has a `📌 n · <latest>` line on
  top, opening into the list with `×` to unpin. Phone: tap a message in *Chat* →
  *📌 Pin*; the same line above the chat.

### Changed
- **Dragging selects text in Claude and Codex tabs** too. Both take the mouse, so a drag
  went to them and right-click made Codex paste; now the left button is handed to the
  terminal as Shift+button (which xterm.js keeps for selecting), and while text is
  selected neither a right-click nor the pointer moving reaches them. The wheel still does.

### Fixed
- **Remote desktop in a browser that keeps nothing** (private mode) asked for the token
  even when the link carried it.
- README: *Working in the window*, *Phone*, *Remote desktop* (both languages); Versions: `v2.6`.
- Tagged `v2.6`.

## 2026-10-30 – files and questions on the phone

### Added
- **📎 on the phone page:** photos and files (up to 20 MB each) are saved on this computer
  as `<temp>/amc-paste/phone-<time>-<name>` and their paths added to the message box.
- **Questions with options in the chat view:** Claude's AskUserQuestion shows as `❓` with
  numbered options and Other, the answer as `✅ …` (several answers joined by ` / `).
- **The question waiting for an answer** shows in a framed box at the bottom of the chat
  view, answered with the number keys. Claude Code writes a question to the transcript only
  once answered, so `ask_hook.py` (PreToolUse / PostToolUse hooks on AskUserQuestion in
  `~/.claude/settings.json`, set up by hand) keeps it in `<temp>/amc-ask/` meanwhile. A
  question whose answer or refusal is already in the transcript is not shown.
- README: *Phone* (both languages).

## 2026-10-30 – tables on the phone

### Fixed
- **Phone chat view: Markdown tables** were shown as their `|` lines, which wrapped into
  a mess on a narrow screen. They are tables now; a cell's text wraps inside it, and a
  table wider than the screen scrolls sideways on its own, not the page.
- README: *Phone* (both languages).

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
