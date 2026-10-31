# Agent Mission Control

Tools for running several Claude Code sessions side by side on Windows and Linux.

[繁體中文說明在下方](#agent-mission-control繁體中文)

| Folder | What it does |
|---|---|
| `Agents Launcher` | Starts the Agent Mission Control window, which opens your Claude Code sessions as tabs inside it, each resuming a fixed session. |
| `Session HUD` | The Agent Mission Control window (`amc_web.py`): task list, live sessions with 60-second activity, 5-hour / weekly token usage, and a terminal tab per session. |
| `Task Manager` | Task list (`tasks.md`) and task history (`TaskDatabase.xlsx`), plus an optional weekday 09:30 reminder popup. |

Windows and Linux are kept on one branch, `master`: each platform's files sit side by
side in the same folders (see [Linux](#linux)), so there is no separate Linux branch.

## Versions

| Tag | What it is |
|---|---|
| `v3.5.5` (current) | `v3.5.4` plus replacing a session of the same name (after asking) and deleting closed sessions from `+` → *History*. See `CHANGELOG.md`. |
| `v3.5.4` | `v3.5.3` plus *Update* really restarting Agent Mission Control on Windows. See `CHANGELOG.md`. |
| `v3.5.3` | `v3.5.2` plus *Agy · Switch…* in ⚙ → Accounts, the version at the foot of ⚙, and pasting screenshots on Linux that copy only a file link (or that GTK cannot read). See `CHANGELOG.md`. |
| `v3.5.2` | `v3.5.1` plus ⚙ → *Remote Access AMC ▸* (a guided Tailscale setup, then the phone and remote desktop links), *Theme ▸* and *Default AI ▸* as second-layer lists, and *New Agy session…* in `+`. See `CHANGELOG.md`. |
| `v3.5.1` | `v3.5` plus *Update* (asks, then restarts Agent Mission Control after a new version, also in a folder that is not a git clone), installing a tool from `+` working on Windows, and install and login errors shown. See `CHANGELOG.md`. |
| `v3.5` | `v3.4` plus moving Task Reminder and Session Manager to the new Default AI (after asking), the new tab first reading the last 50 messages, and the phone's chat view reading Codex 0.16x's rollouts. See `CHANGELOG.md`. |
| `v3.4` | `v3.3` plus installing a missing AI tool from `+`: *New … session… (install)* runs Claude Code's, Codex's or Antigravity's own installer in a tab. See `CHANGELOG.md`. |
| `v3.3` | `v3.2` plus ⚙ → *Accounts*: each tool's logged-in account, and *Switch…* to log out and in with another (Claude Code, Codex). See `CHANGELOG.md`. |
| `v3.2` | `v3.1` plus ⚙ → *Default AI* (the tool Task Reminder and Session Manager start with) and *Update from GitHub* installing git when there is none. See `CHANGELOG.md`. |
| `v3.1` | `v3.0` plus forking Codex sessions (`codex fork`), Session Manager and Task Reminder on Codex or Antigravity when Claude Code is not installed, *New Claude session…* in `+`, and ⚙ → *Update from GitHub* and *Send feedback…*. See `CHANGELOG.md`. |
| `v3.0` | `v2.7` plus an installer for a new PC: `install.bat` and `install.sh` offer to install what is missing (Claude Code, Python 3 and its modules, ImportExcel, the font), and Claude Code, Codex and Antigravity are each optional as long as one is there. See `CHANGELOG.md`. |
| `v2.7` | `v2.6.1` plus Relax mode: the Tasks and Sessions columns as a camp, a building per session growing with its messages, people by status, Cross-check campfires, a task board and stamina bars (⚙ → *Layout* → *Relax*). See `CHANGELOG.md`. |
| `v2.6.1` | `v2.6` plus forking a Claude session (right-click → *Fork…*, or `+` → *Fork session…*) and clicking in a Claude or Codex tab focusing it again. See `CHANGELOG.md`. |
| `v2.6` | `v2.5` plus pinned messages (desktop, remote desktop and phone), selecting text by dragging in Claude and Codex tabs, files uploaded from the phone, questions with options in the phone's chat view (the one waiting too, with a hook), and Markdown tables drawn as tables on the phone. See `CHANGELOG.md`. |
| `v2.5` | `v2.4.1` plus the remote desktop (the whole window in another computer's browser over Tailscale) and Cross-check's two word limits (reply 200, conclusion 500). See `CHANGELOG.md`. |
| `v2.4.1` | `v2.4` plus each tool's usage on the phone page, the session menu on a tab's right-click, Codex ticked by default in Cross-check when installed, and no console window flashing for `agy models` on Windows. See `CHANGELOG.md`. |
| `v2.4` | `v2.3` plus the phone page over Tailscale (sessions, chat or terminal view, keys, a message box), images pasted from the clipboard, task results with a history and Discard, sessions reordered by dragging in the session list, and the name Agent Mission Control throughout. See `CHANGELOG.md`. |
| `v2.3` | `v2.2` plus Cross-check: Claude, Codex and Antigravity discuss or review one question in a `⚖` tab, with a summary, follow-ups with a conclusion, the total tokens in the session list, and *Send to…* a session's tab. See `CHANGELOG.md`. |
| `v2.2` | `v2.1` plus themes (`⚙`), Antigravity (`agy`) tabs, the usage panel split per tool (Claude, Codex, Antigravity) with each weekly reset, a pulsing dot on busy tabs, the taskbar icon, and `+` `⇔` `⚙` pinned at the right of the tab bar. See `CHANGELOG.md`. |
| `v2.1` | `v2.0` plus a model per session, Codex tabs, panes as in VS Code (split by dragging a tab onto a pane's edge, tab order by dragging), files dropped on a pane typed in as paths, and Ctrl+Tab between tabs. See `CHANGELOG.md`. |
| `v2.0` | One Agent Mission Control window (`amc_web.py`, pywebview + xterm.js) with the task list, the session monitor and a terminal tab per session; the same code on Windows and Linux. The Agents Launcher only starts this window. |
| `v1.0` | The earlier setup: each session in its own terminal tab (Windows Terminal; on Linux GNOME Terminal with tmux) next to a separate HUD window (`show-session-hud.ps1` / `mission_control.py`). Get it back with `git checkout v1.0`. |

Your own lists and settings - `agents.json`, `Session HUD/hud-config.json`,
`Task Manager/tasks.md` and `Task Manager/TaskDatabase.xlsx` - are not in git
(`.gitignore`). The installer makes each one from its `*.template.*` file the first time
and never overwrites it, so a `git pull` leaves your copies alone.

## Requirements

- Windows 10 or 11
- At least one of these AI tools (the installer offers to install Claude Code):
- Claude Code CLI, with `claude` on PATH (also needed for the scheduled summaries)
- Optional, for Codex tabs: Codex CLI with `codex` on PATH (`npm install -g @openai/codex`,
  which needs Node.js), logged in with `codex login`
- Optional, for Antigravity tabs: the Antigravity CLI with `agy` on PATH, signed in
- Python 3 on PATH, with the modules `pywebview`, `pywinpty` and `openpyxl`:
  `python -m pip install -U pywebview pywinpty openpyxl typing_extensions`
  (Python 3.7 needs the newer `typing_extensions`, or pywebview fails with
  `cannot import name 'Unpack'`)
- PowerShell module ImportExcel, for task status and the Excel sync:
  `Install-Module ImportExcel -Scope CurrentUser`
- Font DejaVu Sans Mono (the HUD's typeface)

## Setup

1. Copy the `Agent-Mission-Control` folder into the folder your Claude sessions should work in.
   That parent folder becomes every tab's working directory.
2. Double-click `install.bat`. It checks what the tools need (Claude Code, Python 3
   and its modules, the ImportExcel module, the DejaVu Sans Mono font) and offers to
   install each missing one just for you, no admin needed (Claude Code with Anthropic's
   installer, Python 3.12 from python.org, the font from DejaVu's GitHub). It makes your
   own `agents.json`, `hud-config.json`, `tasks.md` and `TaskDatabase.xlsx` from their
   templates if they are missing, puts the **Agent Mission Control** shortcut on the desktop,
   and asks which scheduled jobs to register. Nothing is copied elsewhere - the tools run
   from this folder. Run it again after moving the folder.
3. List your tabs in `agents.json` (it starts with one, `Session Manager`; with no Claude
   Code installed it starts empty, so add Codex or Antigravity tabs with `+`): one entry per
   Claude Code session, with a name and a fixed session id (make one with
   `powershell -c "[guid]::NewGuid()"`). Agent Mission Control shows them in this order
   under these names. An optional `"model"` (for example `"sonnet"`) is passed as
   `--model`; the session list's right-click *Model* sets it. A Codex session has
   `"tool": "codex"` and, once Codex has made it, `"thread"` (see *Codex tabs*); `+` →
   *New Codex session…* writes both. An Antigravity session has `"tool": "agy"` and, once
   agy has made it, `"conversation"` (see *Antigravity tabs*). (`"window"` was the Windows
   Terminal window of the old launcher and is no longer used.)

## Linux

The same tools run on Linux (tested on Linux Mint 22 / Cinnamon, X11) from Python
files next to the Windows ones; `agents.json`, `hud-config.json`, `tasks.md` and the
reports are shared.

| Windows | Linux |
|---|---|
| `install.bat` / `install.ps1` | `./install.sh` (`--check-only` to only check) |
| `Agents Launcher\Agents Launcher.bat` | `Agents Launcher/launch-agents.py` (desktop shortcut `Agent Mission Control.desktop`) |
| `Session HUD\amc_web.py` | the same file |
| `Task Manager\sync-sheet.ps1`, `show-hud.ps1` | `Task Manager/tasks.py sync`, `tasks.py popup` |
| `Daily Summary\run-*.ps1` + Task Scheduler | `Daily Summary/jobs.py review / daily / weekly` + systemd user timers |

Needs: `sudo apt install python3-webview python3-ptyprocess python3-openpyxl python3-tk fonts-dejavu-core`
and at least one of Claude Code, Codex and Antigravity. `./install.sh` offers to install
what is missing: the packages with one `sudo apt install` (plus `curl` if needed), and
Claude Code with Anthropic's installer.

Differences from Windows:
- Scheduled jobs are systemd user timers (`systemctl --user list-timers 'amc-*'`). A job
  missed while the computer was off runs at the next login.
- The OAuth token for the jobs is read from `Daily Summary/oauth-token.txt` only.

## Settings

- `Session HUD\hud-config.json`:
  - The two pies show the account's own 5-hour and weekly usage - the same percentages
    as the Claude app and `/usage`, covering every machine on the login - read once a
    minute from Anthropic's usage endpoint with the token Claude Code keeps in
    `%USERPROFILE%\.claude\.credentials.json` (sent nowhere else, never displayed).
  - `costCap5h`: fallback when that cannot be fetched - budget for one 5-hour block, in US
    dollars at API list price, measured from this machine's transcripts (left pie).
  - `costCapWeek`: fallback budget for one week, same unit (right pie).
  - `weekResetWeekday` / `weekResetHour`: when the weekly budget resets
    (weekday 0 = Monday ... 4 = Friday; hour 0-23).
  - `modelPrices` (optional): override or add list prices, USD per million tokens as
    `[input, output, cache write, cache read]`, e.g. `"opus-5-5": [4, 20, 5, 0.2]`.
    Built-in prices cover Opus 5.5 / 5, Sonnet 5.5 / 5 and Haiku 5.5; other models
    are charged like Sonnet.

## Phone

Off until you turn it on. Agent Mission Control can serve a page for your phone: the
running sessions, each one's conversation or terminal, and a box to type into it.

- **Guided:** `⚙` → *Remote Access AMC ▸* walks through it: *Install Tailscale* (its own
  installer in a tab), *Log in to Tailscale* (`tailscale up`), *Turn on remote access* (a
  new token and the remote desktop on 8771 in `hud-config.json`, served at once), then shows
  both links, `http://<Tailscale address>:8770/#t=<token>` (phone) and `…:8771/#t=<token>`
  (remote desktop); click one to copy it. On the other device, install Tailscale and log in
  with the same account, then paste the link.
- **Turn it on by hand:** add `"remote": {"token": "<a long random string>"}` to
  `Session HUD/hud-config.json` and restart Agent Mission Control. Remove the block to turn
  it off.
- **Network:** it listens only on this computer's [Tailscale](https://tailscale.com)
  address (`tailscale ip -4`), port 8770, so only devices on your Tailscale account reach
  it, encrypted. Install Tailscale on the computer and the phone with the same login. It
  starts within 30 seconds of Tailscale coming up. `"host"` and `"port"` in the block
  override the address and port.
- **Open it:** `http://<Tailscale address>:8770/#t=<token>` once; the phone keeps the
  token and drops it from the address, so later just `http://<Tailscale address>:8770/`
  (it can be added to the home screen). Every request without the token gets 403.
- **Usage:** a line per tool with its limits in percent used, the same numbers as the
  usage panel: Claude `5H` and `WEEK`, Codex's windows, Antigravity's model groups. A
  tool shows once it has numbers (Antigravity only when `agents.json` has an agy session).
- **Top:** a list of the running sessions with their status; the closed ones are under
  *History*, and picking one opens it, as the desktop's `+` → *History* does.
- **Chat / Term:** *Chat* (the default) shows only the messages typed and the replies,
  without tool calls or thinking (Claude and Codex), and a pulsing *thinking…* line at
  the bottom while the session is busy. Markdown tables show as tables, each one
  scrolling sideways on its own when wider than the screen. *Term* shows the tab's terminal at
  the desktop's size; switch to it to see a permission prompt. Antigravity sessions show
  *Term* only (their conversations are stored in a binary format). A− / A+ change the
  text size.
- **Questions with options** (Claude's AskUserQuestion) show in *Chat* with numbered
  options (`❓`), and the answer as `✅ …`. While one waits for an answer, Claude Code has
  not written it to the transcript yet; to see it in *Chat* then (in a framed box at the
  bottom, answered with the number keys), add these hooks to `~/.claude/settings.json`
  (each computer has its own; on Windows use `python`). Without them, answer in *Term*.
  ```json
  "hooks": {
    "PreToolUse":  [{"matcher": "AskUserQuestion", "hooks": [{"type": "command", "command": "python3 \"<repo>/Session HUD/ask_hook.py\""}]}],
    "PostToolUse": [{"matcher": "AskUserQuestion", "hooks": [{"type": "command", "command": "python3 \"<repo>/Session HUD/ask_hook.py\""}]}]
  }
  ```
  The hook keeps the waiting question in `<temp>/amc-ask/<session id>.json` and removes it
  once answered; it always exits 0, so it never stops a question.
- **Keys:** `1 2 3 ↑ ↓ ⌫ Enter Esc ⇧Tab` are typed straight into the session, enough to
  answer a permission prompt. Permission prompts still show in the desktop tab too.
- **Message box:** *Send* types the text into the session and submits it, as if typed
  at the desktop.
- **📎 Files:** pick photos or files (up to 20 MB each); each one is saved on this
  computer as `<temp>/amc-paste/phone-<time>-<name>` and its path added to the message
  box, so Claude or Codex can read it.
- **📌 Pins:** tap a message in *Chat*, then *📌 Pin*. The session's pins show in a line
  above the chat (`📌 2 · <the latest>`); tap it for the list, `×` unpins. They are the
  same pins as the desktop's.

## Remote desktop

The whole Agent Mission Control window in another computer's browser, over the same
Tailscale network and token as the phone page.

- **Turn it on:** add `"desktopPort": 8771` to the `"remote"` block of
  `Session HUD/hud-config.json` and restart Agent Mission Control.
- **Open it:** `http://<Tailscale address>:8771/#t=<token>` once, then
  `http://<Tailscale address>:8771/`. The other computer needs Tailscale on the same login.
  A browser that keeps nothing (private mode) asks for the token again on reload.
- **What works:** everything the window here does: the tasks, the session list, usage,
  the tabs and typing into them, the menus. Both pages work on the same sessions at once.
- **Terminal size:** the terminals keep this computer's size; resizing the browser does
  not change them (in a smaller browser window their right and bottom edges are cut off).
- **Not available there:** pasting an image from this computer's clipboard (the button
  path; Ctrl+V of an image in that browser saves it here) and dropping files on a terminal.

## Relax mode

The Tasks and Sessions columns can be a camp seen from above instead: ⚙ → *Layout* →
*Relax* (*Office* goes back). The choice is kept per computer; the terminals stay as they are.

- **A building per session**, scattered about the camp, its name under it. It grows with
  the messages typed into the session: a campfire at 0, a tent from 1, a cabin from 10, a
  house from 50, a tower from 200 (Antigravity, whose conversations cannot be read: 6 per
  hour open). An ended session is a wreck with its name in dark grey.
- **Its person**, near it: working while the session is busy, waving while it waits for
  you, sitting or strolling about while idle.
- **A Cross-check discussion** is a campfire with its models on the logs around it; the one
  answering stands, and the fire burns while a step runs.
- **Mouse:** hovering shows the name, status and messages; double-click shows the tab
  (an ended one starts again, a discussion opens); right-click is the session list's menu.
- **Top:** the open tasks on a board (click a status to change it, as in the Tasks
  column) and *⚡ Stamina*, each tool's limits left.
- It draws only what changes, about 7% of one CPU core (Office: 4%), and nothing while the
  window is hidden or in Office mode.
- The pictures come from Kenney's *Survival Kit* and *Fantasy Town Kit* (CC0,
  [kenney.nl](https://www.kenney.nl)); `Session HUD/tools/relax_art.py` makes them, once.

## Task list

`Task Manager\CLAUDE.md` tells a Claude session how to keep the task list:
the `tasks.md` format, how tasks are ranked, and when to sync the Excel file.
Talk to any session started in the working folder ("add a task: …", "… is done")
and it edits `tasks.md`; the Agent Mission Control picks the change up within 30 seconds.

## Working in the window

- **Tabs:** the right column has a tab per running `agents.json` session. The ones ticked
  *Open on start* (the session list's right-click menu) start with the window; `+` →
  *History* starts any other listed one (its `✕` deletes a closed one from `agents.json`, after
  asking; the conversation stays in its tool's history), `×` ends one. A new session or fork
  with a name already there asks first, then replaces that one in its place. Type into a tab as into any terminal. Closing the
  window ends every tab; the conversations are kept and resume next time. A session
  already running in another terminal is left there and gets no tab.
- **Session list:** double-click a session to show its tab (a session with no terminal,
  such as a scheduled `claude -p` job, says it is a background job). Right-click for Copy,
  Copy all rows, Open on start, Terminate, Fork and Model; right-clicking a tab in the tab bar
  opens the same menu for its session. Drag a session up or down to reorder
  it; the order is saved in `agents.json`, so the tab bar follows.
- **Selecting and pinning text:** drag in a tab to select (double-click: a word), also in
  Claude and Codex, which take the mouse: there the left button selects instead of
  reaching them; the wheel still scrolls them. Right-click the selection for *📌 Pin* or
  *Copy*. A pane with pins has a line on top (`📌 2 · <the latest>`); click it for the
  list, `×` unpins. Each session has its own; they are kept in `pins.json` next to
  `agents.json` and shared with the remote desktop and the phone page.
- **Model:** the right-click menu's *Model* picks what the session runs on: *Claude
  default* (no `--model`, so Claude Code picks by plan and version), `fable`, `opus`,
  `sonnet` or `haiku`. The choice is saved as `"model"` in `agents.json` and passed as
  `--model`. An idle tab restarts on it at once and resumes the same conversation; a busy
  or waiting one is not interrupted and takes it at its next start. Sessions not in
  `agents.json` have no Model choice. A Codex session lists *Codex default* and the
  models Codex's own picker shows (from `~/.codex/models_cache.json`), passed as `-m`.
  An Antigravity session lists *Antigravity default* and what `agy models` lists, passed
  as `--model`.
- **Fork:** right-click a Claude session → *Fork…*, or `+` → *Fork session…* and paste
  any Claude session id (one not in `agents.json` or from another folder too), then type
  a name. It adds a session with that name, a new id, the source's model and
  `"fork_of": "<source id>"` to `agents.json` and starts its tab with
  `claude --resume <source id> --fork-session --session-id <new id>`: the conversation so
  far, going on under its own id, while the source stays as it was. Later starts resume
  the fork as any other session. A Codex session forks the same way with
  `codex fork <its thread>` (`"tool": "codex"`, `"fork_of": "<thread>"`); its new thread is
  found as a new Codex tab's is. Antigravity sessions cannot be forked.
- **Installing a tool:** in `+`, a tool that is not installed shows as *New … session…
  (install)*. Clicking it offers *Download and install it*, which opens an `Install …` tab
  running the maker's own installer into your user folder, no admin (Linux:
  `curl -fsSL https://claude.ai/install.sh | bash`, `https://chatgpt.com/codex/install.sh | sh`,
  `https://antigravity.google/cli/install.sh | bash`; Windows: the same with `install.ps1`
  through `irm … | iex`). Answer its questions there; Enter closes it. PATH is read again
  after it, so `+` → *New … session…* works without restarting. Log in at its first start.
  When it cannot start, the menu says why; the tab's output also goes to
  `Session HUD/amc-web.log` (Windows).
- **Codex tabs:** `+` → *New Codex session…* adds a session with `"tool": "codex"` and
  starts `codex` in its tab (with `prompts/<name>.md` as its first message when that file
  exists). Codex chooses the session id itself and writes its transcript
  (`~/.codex/sessions/<year>/<month>/<day>/rollout-…-<id>.jsonl`) only at the first
  message, so the id is saved as `"thread"` in `agents.json` once you have sent one; from
  then on the tab runs `codex resume <thread>`. Until then the session list shows `new`
  in place of the id, and a tab closed before its first message starts a new conversation
  next time. The list shows only the Codex tabs of this window (Codex has no registry of
  running sessions) and only busy or idle: a Codex session waiting for an approval shows
  busy. The usage panel's CODEX line and pie are the account limits Codex wrote after its
  latest turn on this computer, one pie per limit window the plan has (the free plan has
  one, 30 days), so use elsewhere shows after the next turn here.
- **Antigravity tabs:** `+` → *New Agy session…* adds a session with
  `"tool": "agy"` and starts `agy` in its tab (with `prompts/<name>.md` through `-i` when
  that file exists). Like Codex, agy makes the conversation at the first message
  (`~/.gemini/antigravity-cli/conversations/<id>.db`); its id is then saved as
  `"conversation"` and the tab runs `agy --conversation <id>` from then on. The first
  start in the working folder asks whether to trust it; answer it in the tab. Busy or
  idle comes from the conversation's last step; a turn stopped with Esc shows idle about a
  minute later.
- **Cross-check:** `+` → *Cross-check…* asks Claude, Codex and Antigravity (each with
  its model; every installed tool is ticked by default, on Sonnet, Codex's own default
  and agy's medium Flash) one question. *discuss*: all answer,
  then each round sees the others' answers and revises; the lead sums up. *review*: the
  lead answers, the others review, the lead replies; the first reviewer sums up. Rounds 1–3
  (default 2) and two word limits: each reply (default 200) and the summary and each
  conclusion (default 500); 0 = none. It opens as a `⚖` tab:
  the rounds side by side, a follow-up box at the bottom (every participant answers, then
  one writes the conclusion). Each participant runs in print mode (`claude -p`, `codex
  exec`, `agy -p`) on a conversation of its own, resumed every turn; it can read the
  working folder but changes nothing, and every turn uses that tool's quota. *Send to…* on
  a summary or conclusion types it into a session's tab, to be acted on there. In the
  session list a discussion shows with `⚖` and the tokens of all its models; right-click:
  Open on start, Terminate (ends the step under way and closes the tab), Settings… (name,
  models, lead, word limit). Saved in `Session HUD/discussions/` (not in git); the latest
  ones reopen from `+` → *History*. Codex in a discussion is not tried yet.
- **Usage:** one section per tool. CLAUDE: the 5-hour block, today and this week, when
  the week resets (the account's time, otherwise `weekResetWeekday` / `weekResetHour`),
  and the models used. CODEX: each limit window with its reset. ANTIGRAVITY (when
  `agents.json` has an agy session): the weekly limit of each model group, read from a
  hidden `agy` → `/usage` every 10 minutes (about 5 seconds; no model quota is used and
  no conversation is made).
- **Columns:** drag the bars between the three columns to resize them; the widths are kept.
- **Keys:** Ctrl+Tab / Ctrl+Shift+Tab switch to the next / previous tab; the mouse
  wheel over the tab bar scrolls it.
- **Files:** drag files from the file manager onto a pane to type their full paths
  into that tab.
- **Images:** Ctrl+V (or Ctrl+Shift+V) with an image on the clipboard saves it as
  `amc-paste/paste-<time>.png` in the temp folder (`/tmp` on Linux) and types its path
  into the tab; Claude reads the image when the message is sent. Text pastes as before.
  A screenshot tool that copies only a file link pastes that file's path. On Linux, when
  GTK finds no image, `wl-paste` or `xclip` are asked, and a paste that finds none writes
  what the clipboard offered to `Session HUD/amc-web.log`.
  Ctrl+V is a paste now, no longer passed to the program.
- **Tab status:** the dot in each tab is its session's status colour (busy cyan, idle
  green), and pulses while the session is busy. A tab not on screen blinks when its session finishes or waits for you.
- **Panes (as in VS Code):** drag a tab from the tab bar onto the terminal area. Dropped
  on a pane's left, right, top or bottom edge it gets a new pane there; dropped on a
  pane's middle it replaces that pane's tab. Panes nest freely (side by side, one above
  the other, or both), and the bars between them drag to resize. A tab you click goes
  into the focused pane, or focuses the pane already showing it; click a pane to focus
  it. `⊟` at a pane's top right closes the pane (its session keeps running and its tab
  stays in the bar); a pane whose session ends closes by itself. The layout is kept for
  the next start, minus the sessions not running then.
- **Tab order:** drag a tab along the tab bar; a bar shows where it will go. The order is
  saved in `agents.json`, so it stays next time and the session list follows it.
- **Full width:** `⇔` at the right of the tab bar hides the task and session columns so
  the panes get the whole window; `⇔` again brings them back.
- **Theme:** `⚙` at the right of the tab bar → *Theme ▸* lists the themes: Classic (the original
  green on black, the default), Dark, Light, Monokai, Solarized Dark, Solarized Light,
  Dracula, Nord, Gruvbox Dark and One Dark. The theme colours the whole window and the
  terminals, and is kept for the next start.
- **Default AI:** `⚙` → *Default AI ▸* picks Claude, Codex or Antigravity (only the installed
  ones) for `Task Reminder` and `Session Manager`, made on their first send. Kept as
  `"defaultTool"` in `Session HUD/hud-config.json`. When those two are already on another
  tool, it asks: *Move them to …* gives each a new entry in its place (new id, the new
  tool, no model) and restarts it if it was open; its last 50 messages go to
  `Agents Launcher/handoff/<name>.md` (not in git), which the new tab reads first. The old
  conversation stays in the old tool; Antigravity's cannot be read, so it starts fresh.
  *Only for new ones* leaves them as they are. With none picked: Claude Code, otherwise
  Codex, otherwise Antigravity.
- **Accounts:** `⚙` → *Accounts* shows the account each installed tool is logged in with
  (`claude auth status`, `codex login status`). *Switch…* opens a `Claude login` / `Codex
  login` tab that runs the tool's own logout and login (the browser opens for the new
  account), then closes on Enter. Every tab of that tool uses the new account from then on.
  *Agy · Switch…* opens an `Agy login` tab running `agy` with `/logout` typed in; type
  `/login` there, then quit agy (Ctrl+C) to close it (agy cannot say which account it uses).
- **Update:** `⚙` → *Update* asks first, then runs `git pull --ff-only` in this folder and
  shows how it went. With a new version, Agent Mission Control restarts itself through its
  launcher (every tab restarts, conversations go on); already up to date or an error, it
  does not.
  A folder that is not a git clone (a downloaded zip, a copy) is made one first: your own
  files (`agents.json`, `hud-config.json`, `tasks.md` ...) stay as they are, and a file of
  the tools that differs from GitHub's is copied to `.update-backup/<time>/` before it is
  replaced. With no git, it installs it
  first: on Windows the latest MinGit (Git for Windows' zip, no admin) into
  `%LOCALAPPDATA%\Programs\MinGit`, used by Agent Mission Control only; on Linux
  `apt-get install git` behind the system's password box.
- **Send feedback:** `⚙` → *Send feedback…* opens a new email to the author in the default
  mail app, titled "AMC Feedback".

- **Due date:** click a task's date (or `no due`) for a small calendar; the chosen day is
  written to `tasks.md` and synced to the Excel file.
- **Status:** click a task's status (or `-`) for Pending / Ongoing / Checking / Finished /
  Discard. Finished asks for the result (Enter; empty = `finished`; Esc cancels), writes
  `→ 結果 (date)：…` under the task (under each sub-item without a result), ticks it off and
  it leaves the list at once. Discard asks for the reason the same way (empty =
  `discarded`), writes it as `discarded: <reason>`, takes the task out of `tasks.md` and
  marks its rows Discarded in the Excel file.
- **Task history:** the clock at the top right of the task list shows the finished tasks
  (latest first, with their results) and the Discarded ones; click a task's Finished /
  Discarded for *Restore → Pending*. Restoring a finished task drops the result lines its
  finishing added (dated its finish day); restoring a Discarded one drops the reason.
- **Chat box:** the box under the task list types what you enter into the `Task Reminder`
  tab and submits it (Shift+Enter for a new line). With no `Task Reminder` yet, the first
  send adds one to `agents.json` and opens its tab, with the `⚙` → *Default AI* tool (the
  same goes for `Session Manager`, whose
  ListAgents and SendMessage exist only in Claude Code).

## Daily Summary

| Job | When | What it does |
|---|---|---|
| Claude Daily Review | weekdays 09:30 | Opens a terminal and asks you, one at a time, about each open item in the latest report. |
| Claude Daily Summary | weekdays 19:00 | Reads the day's Claude sessions in the work folder and writes `Daily Summary\Reports\<date>.md`. |
| Claude Weekly Summary | Fridays 19:30 | Combines the week's daily reports into one weekly report. |

Register all three:
```
powershell -ExecutionPolicy Bypass -File "Agent-Mission-Control\Daily Summary\setup-schedule.ps1"
```

The jobs run unattended. To give them their own Claude login, put an OAuth token in
`Daily Summary\oauth-token.txt` (one line, nothing else); without that file they use the
device's normal Claude login. Keep that file private: do not copy it to other devices
or commit it (`.gitignore` already excludes it).

Optional notes source: the daily summary also reads `<work folder>\Obsidian Vault\MyNotes\<date>.md`
when that file exists and contains the tag `#work`.

---

# Agent Mission Control（繁體中文）

在 Windows 和 Linux 上同時執行多個 Claude Code session 的工具組。

| 資料夾 | 功能 |
|---|---|
| `Agents Launcher` | 啟動 Agent Mission Control 視窗，由它在視窗內把 Claude Code session 開成分頁，每個分頁各自接回固定的 session。 |
| `Session HUD` | Agent Mission Control 視窗（`amc_web.py`）：任務清單、各 session 的即時狀態與 60 秒活動圖、5 小時／每週的 token 用量，以及每個 session 一個終端機分頁。 |
| `Task Manager` | 任務清單（`tasks.md`）與任務歷史（`TaskDatabase.xlsx`），另有可選的平日 09:30 提醒彈窗。 |

Windows 和 Linux 版放在同一個分支 `master`：兩個平台的檔案並排放在同樣的資料夾裡
（對照表見英文的 [Linux](#linux) 一節），沒有另外的 Linux 分支。

## 版本

| Tag | 內容 |
|---|---|
| `v3.5.5`（目前） | `v3.5.4` 再加上：同名 session 可確認後取代、`+` → *History* 可刪除已關閉的 session。詳見 `CHANGELOG.md`。 |
| `v3.5.4` | `v3.5.3` 再加上：Windows 上 *Update* 後真的會自動重開。詳見 `CHANGELOG.md`。 |
| `v3.5.3` | `v3.5.2` 再加上：⚙ → Accounts 的 *Agy · Switch…*、⚙ 最下面顯示版本，以及 Linux 上只複製檔案連結（或 GTK 讀不到）的截圖也能貼上。詳見 `CHANGELOG.md`。 |
| `v3.5.2` | `v3.5.1` 再加上：⚙ → *Remote Access AMC ▸*（引導設定 Tailscale，最後給手機和遠端桌面的網址）、*Theme ▸* 和 *Default AI ▸* 移到第二層、`+` 選單改成 *New Agy session…*。詳見 `CHANGELOG.md`。 |
| `v3.5.1` | `v3.5` 再加上：*Update*（先確認，有新版就自動重開；不是 git clone 的資料夾也能用）、Windows 上從 `+` 安裝工具能正常執行、安裝和登入失敗時顯示原因。詳見 `CHANGELOG.md`。 |
| `v3.5` | `v3.4` 再加上：換 Default AI 時可把 Task Reminder 和 Session Manager 一起換過去（會先問），新分頁先讀最近 50 則對話；手機 Chat 頁能讀 Codex 0.16x 的對話紀錄。詳見 `CHANGELOG.md`。 |
| `v3.4` | `v3.3` 再加上從 `+` 安裝沒裝的 AI 工具：*New … session… (install)* 會在分頁裡執行 Claude Code、Codex 或 Antigravity 官方的安裝程式。詳見 `CHANGELOG.md`。 |
| `v3.3` | `v3.2` 再加上 ⚙ → *Accounts*：顯示各工具登入的帳號，*Switch…* 登出再登入另一個帳號（Claude Code、Codex）。詳見 `CHANGELOG.md`。 |
| `v3.2` | `v3.1` 再加上：⚙ → *Default AI*（Task Reminder 和 Session Manager 用哪個 AI 建立），以及 *Update from GitHub* 在沒有 git 時先幫你裝。詳見 `CHANGELOG.md`。 |
| `v3.1` | `v3.0` 再加上：Codex session 也能 fork（`codex fork`）；沒裝 Claude Code 時，Session Manager 和 Task Reminder 改用 Codex 或 Antigravity；`+` 選單改成 *New Claude session…*；⚙ → *Update from GitHub* 和 *Send feedback…*。詳見 `CHANGELOG.md`。 |
| `v3.0` | `v2.7` 再加上新電腦的安裝：`install.bat` 和 `install.sh` 會問要不要幫你裝缺的東西（Claude Code、Python 3 與模組、ImportExcel、字型）；Claude Code、Codex、Antigravity 都改成選用，至少裝一個即可。詳見 `CHANGELOG.md`。 |
| `v2.7` | `v2.6.1` 再加上 Relax 模式：Tasks 和 Sessions 兩欄換成營地，每個 session 一棟隨訊息數長大的建築，小人依狀態動作，Cross-check 是營火，上方有任務公告板和 Stamina（⚙ → *Layout* → *Relax*）。詳見 `CHANGELOG.md`。 |
| `v2.6.1` | `v2.6` 再加上 fork Claude session（右鍵 → *Fork…*，或 `+` → *Fork session…*）；在 Claude 或 Codex 分頁點一下又能直接打字。詳見 `CHANGELOG.md`。 |
| `v2.6` | `v2.5` 再加上釘選訊息（桌面版、遠端桌面、手機）；在 Claude 和 Codex 分頁拖曳選取文字；從手機上傳檔案；手機 Chat 顯示有選項的提問（加 hook 後連等待中的也會顯示）；手機上的 Markdown 表格畫成表格。詳見 `CHANGELOG.md`。 |
| `v2.5` | `v2.4.1` 再加上遠端桌面（透過 Tailscale 在另一台電腦的瀏覽器打開整個視窗），以及 Cross-check 的兩個字數上限（回覆 200、結論 500）。詳見 `CHANGELOG.md`。 |
| `v2.4.1` | `v2.4` 再加上手機頁顯示各工具的用量；在分頁上按右鍵也有 session 選單；Cross-check 預設勾選有安裝的 Codex；Windows 上讀 `agy models` 時不再閃出主控台視窗。詳見 `CHANGELOG.md`。 |
| `v2.4` | `v2.3` 再加上透過 Tailscale 的手機頁（session 清單、對話或終端機畫面、按鍵、輸入框）；從剪貼簿貼上圖片；任務的結果、歷史和丟棄；在 session 清單拖曳調整順序；名稱全面改成 Agent Mission Control。詳見 `CHANGELOG.md`。 |
| `v2.3` | `v2.2` 再加上 Cross-check：Claude、Codex、Antigravity 在 `⚖` 分頁裡討論或審查同一個問題，最後整理；追問會附結論；session 清單顯示所有模型的 token 總數；結論可用 *Send to…* 送進 session 分頁。詳見 `CHANGELOG.md`。 |
| `v2.2` | `v2.1` 再加上：主題（`⚙`）、Antigravity（`agy`）分頁、用量面板依工具分段（Claude、Codex、Antigravity）並顯示各自的週重置時間、busy 分頁的圓點會閃、工作列圖示，以及 `+` `⇔` `⚙` 固定在分頁列右邊。詳見 `CHANGELOG.md`。 |
| `v2.1` | `v2.0` 再加上：每個 session 可選模型、Codex 分頁、像 VS Code 的窗格（把分頁拖到窗格邊緣來分割、拖曳分頁排順序）、檔案拖到窗格會打出路徑、Ctrl+Tab 切換分頁。詳見 `CHANGELOG.md`。 |
| `v2.0` | 單一 Agent Mission Control 視窗（`amc_web.py`，pywebview 加 xterm.js），裡面有任務清單、Session Monitor，每個 session 一個終端機分頁；Windows 和 Linux 用同一份程式。Agents Launcher 只負責啟動這個視窗。 |
| `v1.0` | 舊的做法：每個 session 開在各自的終端機分頁（Windows Terminal；Linux 上是 GNOME Terminal 加 tmux），旁邊另有一個 HUD 視窗（`show-session-hud.ps1`／`mission_control.py`）。用 `git checkout v1.0` 可以拿回來。 |

你自己的清單和設定——`agents.json`、`Session HUD/hud-config.json`、
`Task Manager/tasks.md`、`Task Manager/TaskDatabase.xlsx`——不放在 git 裡
（`.gitignore`）。安裝程式第一次執行時，會從各自的 `*.template.*` 範本建立，之後
不會再覆蓋，所以 `git pull` 不會動到你的檔案。

## 需求

- Windows 10 或 11
- 下面三個 AI 工具至少要有一個（安裝程式會問要不要幫你裝 Claude Code）：
- Claude Code CLI，且 `claude` 在 PATH 中（排程的每日／每週摘要也需要它）
- 選用，給 Codex 分頁用：Codex CLI，且 `codex` 在 PATH 中（`npm install -g @openai/codex`，
  需要 Node.js），並用 `codex login` 登入
- 選用，給 Antigravity 分頁用：Antigravity CLI，且 `agy` 在 PATH 中，並已登入
- Python 3 在 PATH 中，並裝好 `pywebview`、`pywinpty`、`openpyxl` 模組：
  `python -m pip install -U pywebview pywinpty openpyxl typing_extensions`
  （Python 3.7 要裝新版 `typing_extensions`，否則 pywebview 會出現
  `cannot import name 'Unpack'`）
- PowerShell 模組 ImportExcel，用於任務狀態與 Excel 同步：
  `Install-Module ImportExcel -Scope CurrentUser`
- 字型 DejaVu Sans Mono（HUD 使用的字型）

## 安裝步驟

1. 把 `Agent-Mission-Control` 資料夾複製到你希望 Claude session 工作的資料夾裡。
   它的上一層資料夾就是每個分頁的工作目錄。
2. 雙擊 `install.bat`。它會檢查工具需要的程式（Claude Code、Python 3 與它的模組、
   ImportExcel 模組、DejaVu Sans Mono 字型），缺的會一項一項問要不要幫你裝，只裝給
   目前的使用者、不需要系統管理員（Claude Code 用 Anthropic 官方安裝程式、Python 3.12
   從 python.org、字型從 DejaVu 的 GitHub）。若還沒有 `agents.json`、
   `hud-config.json`、`tasks.md`、`TaskDatabase.xlsx`，就從範本建立，接著在桌面建立
   **Agent Mission Control** 捷徑，並詢問要註冊哪些排程。不會把檔案複製到別處，工具直接
   從這個資料夾執行；資料夾搬家後再執行一次即可。
3. 在 `agents.json` 列出你的分頁（一開始已有一筆 `Session Manager`；沒裝 Claude Code
   時一開始是空的，用 `+` 新增 Codex 或 Antigravity 分頁）：每個
   Claude Code session 一筆，包含名稱和固定的 session id（用
   `powershell -c "[guid]::NewGuid()"` 產生）。Agent Mission Control 依這個順序、用這些
   名稱顯示。可選的 `"model"`（例如 `"sonnet"`）會以 `--model` 傳入，可用 session
   清單右鍵的 *Model* 設定。Codex session 會有 `"tool": "codex"`，Codex 建立好之後
   還會有 `"thread"`（見 *Codex 分頁*）；`+` → *New Codex session…* 會自動寫入這兩個欄位。Antigravity session 會有 `"tool": "agy"`，agy 建立好對話後還會有 `"conversation"`（見 *Antigravity 分頁*）。（`"window"` 是舊 launcher 的 Windows Terminal 視窗編號，
   已不再使用。）

## 設定

- `Session HUD\hud-config.json`：
  - 兩個圓餅圖顯示的是帳號本身的 5 小時／每週用量——跟 Claude app 和 `/usage`
    同一個百分比，涵蓋所有用這個帳號登入的機器——每分鐘用 Claude Code 存在
    `%USERPROFILE%\.claude\.credentials.json` 的 token 向 Anthropic 的用量 endpoint
    讀一次（token 不會送去別處、不會顯示）。
  - `costCap5h`：抓不到時的備援——每個 5 小時區段的額度，單位是以 API 牌價換算的
    美元，由本機的 transcript 估算（左邊的圓餅圖）。
  - `costCapWeek`：每週的備援額度，單位相同（右邊的圓餅圖）。
  - `weekResetWeekday` / `weekResetHour`：每週額度重置的時間
    （weekday 0 = 星期一 … 4 = 星期五；hour 0–23）。
  - `modelPrices`（可選）：覆寫或新增模型牌價，單位為每百萬 token 美元，格式
    `[輸入, 輸出, cache write, cache read]`，例如 `"opus-5-5": [4, 20, 5, 0.2]`。
    內建已有 Opus 5.5／5、Sonnet 5.5／5、Haiku 5.5 的價格；其他模型以 Sonnet 價格計算。

## 手機

預設關閉。開啟後，Agent Mission Control 會提供一個手機頁：列出執行中的 session，
可以看每個 session 的對話或終端機畫面，也能輸入文字給它。

- **引導設定：** `⚙` → *Remote Access AMC ▸* 會一步步帶你做：*Install Tailscale*（在分頁裡跑
  官方安裝程式）、*Log in to Tailscale*（`tailscale up`）、*Turn on remote access*（在
  `hud-config.json` 產生新 token 並開啟 8771 遠端桌面，立刻開始提供），最後顯示兩個網址：
  `http://<Tailscale 位址>:8770/#t=<token>`（手機）和 `…:8771/#t=<token>`（遠端桌面），點一下
  就複製。在另一台裝置上裝好 Tailscale、登入同一個帳號，再貼上網址即可。
- **手動開啟：** 在 `Session HUD/hud-config.json` 加上 `"remote": {"token": "<一串夠長的亂碼>"}`，
  重開 Agent Mission Control。刪掉這段就關閉。
- **網路：** 只在這台電腦的 [Tailscale](https://tailscale.com) 位址（`tailscale ip -4`）
  的 8770 port 上提供，所以只有登入同一個 Tailscale 帳號的裝置連得到，連線有加密。
  電腦和手機都要裝 Tailscale 並登入同一個帳號。Tailscale 連上後 30 秒內就會開始提供。
  這段設定裡的 `"host"` 和 `"port"` 可以改位址和 port。
- **打開：** 第一次用 `http://<Tailscale 位址>:8770/#t=<token>`。手機會記住 token，
  並從網址拿掉，之後只要開 `http://<Tailscale 位址>:8770/`（可以加到主畫面）。
  沒有帶 token 的要求一律回 403。
- **用量：** 每個工具一行，顯示各限制的已用百分比，和用量面板的數字相同：Claude 的
  `5H` 和 `WEEK`、Codex 的各個週期、Antigravity 的各模型群組。工具有數字後才顯示
  （Antigravity 要 `agents.json` 裡有 agy session 才會顯示）。
- **上方清單：** 列出執行中的 session 和狀態；已關閉的放在 *History*，選了就會打開它，
  和桌面版的 `+` → *History* 一樣。
- **Chat / Term：** *Chat*（預設）只顯示你打的訊息和回答，不顯示工具呼叫和思考過程
  （Claude 和 Codex）；session 忙的時候，最下面有一行閃爍的 *thinking…*；Markdown 表格畫成表格，比螢幕寬時只有那張表格能左右滑。*Term* 顯示那個分頁的終端機畫面，大小和桌面版相同；要看權限詢問
  時切到這裡。Antigravity 的對話以二進位格式儲存，所以只有 *Term*。A− / A+ 調整字的大小。
- **有選項的提問**（Claude 的 AskUserQuestion）會在 *Chat* 顯示成 `❓` 加編號選項，
  回答顯示成 `✅ …`。等待回答時 Claude Code 還沒把提問寫進對話紀錄；要在這時就從
  *Chat* 看到（最下面加框顯示，用數字鍵回答），在 `~/.claude/settings.json` 加上這兩條
  hook（每台電腦各自設定；Windows 用 `python`）。沒加的話，到 *Term* 回答。
  ```json
  "hooks": {
    "PreToolUse":  [{"matcher": "AskUserQuestion", "hooks": [{"type": "command", "command": "python3 \"<repo>/Session HUD/ask_hook.py\""}]}],
    "PostToolUse": [{"matcher": "AskUserQuestion", "hooks": [{"type": "command", "command": "python3 \"<repo>/Session HUD/ask_hook.py\""}]}]
  }
  ```
  hook 把等待中的提問存在 `<temp>/amc-ask/<session id>.json`，回答後刪掉；它一律以 0
  結束，不會擋住提問。
- **按鍵：** `1 2 3 ↑ ↓ ⌫ Enter Esc ⇧Tab` 直接打進 session，足夠回答權限詢問。
  權限詢問在桌面版的分頁上也照常顯示。
- **輸入框：** *Send* 把文字打進 session 並送出，和在桌面版打字一樣。
- **📎 檔案：** 選照片或檔案（每個最多 20 MB），存到這台電腦的
  `<temp>/amc-paste/phone-<時間>-<檔名>`，路徑會加進輸入框，讓 Claude 或 Codex 讀取。
- **📌 釘選：** 在 *Chat* 點一則訊息，再按 *📌 Pin*。這個 session 的釘選顯示在對話上方
  一行（`📌 2 · <最新一則>`），點它展開清單，`×` 取消釘選。和桌面版是同一份。

## 遠端桌面

在另一台電腦的瀏覽器裡打開整個 Agent Mission Control 視窗，和手機頁用同一個 Tailscale
網路和 token。

- **開啟：** 在 `Session HUD/hud-config.json` 的 `"remote"` 裡加上 `"desktopPort": 8771`，
  重開 Agent Mission Control。
- **打開：** 第一次用 `http://<Tailscale 位址>:8771/#t=<token>`，之後開
  `http://<Tailscale 位址>:8771/`。另一台電腦要裝 Tailscale，登入同一個帳號。
  不保存資料的瀏覽器（無痕模式）重新整理後會再問一次 token。
- **能做什麼：** 這裡的視窗能做的都可以：任務、session 清單、用量、分頁和在裡面打字、
  各個選單。兩邊可以同時操作同一批 session。
- **終端機大小：** 以這台電腦為準，調整瀏覽器大小不會改變終端機（瀏覽器視窗比較小時，
  終端機右邊和下面會被切掉）。
- **不能用的：** 從這台電腦的剪貼簿貼圖片（在那台瀏覽器裡 Ctrl+V 貼圖，圖會存到這台電腦），
  以及把檔案拖進終端機。

## Relax 模式

Tasks 和 Sessions 兩欄可以換成一個從上方看的營地：⚙ → *Layout* → *Relax*（選 *Office*
換回來）。每台電腦各自記住選擇；終端機分頁不受影響。

- **每個 session 一棟建築**，散布在營地裡，名字寫在下面。打進 session 的訊息越多，建築
  越大：0 則是營火、1 則起是帳篷、10 則起是小木屋、50 則起是房子、200 則起是高塔
  （Antigravity 的對話讀不到，改用開著的時間，每小時算 6 則）。結束的 session 變成廢墟，
  名字是深灰色。
- **旁邊的小人**：session 忙的時候在工作，等你回應時揮手，閒著時坐著或四處走走。
- **Cross-check 討論**是一堆營火，參與的模型坐在周圍的木頭上；正在回答的站著，步驟進行
  中時有火焰。
- **滑鼠**：移到上面顯示名稱、狀態和訊息數；雙擊切到它的分頁（結束的會重新啟動，討論會
  打開）；右鍵是 session 清單的選單。
- **上方**：公告板列出未完成的任務（點狀態可以改，和 Tasks 欄一樣），*⚡ Stamina* 顯示各
  工具剩下的用量。
- 只重畫有變的部分，大約占一個 CPU 核心的 7%（Office 是 4%）；視窗隱藏或在 Office 模式時
  完全不跑。
- 圖片來自 Kenney 的 *Survival Kit* 和 *Fantasy Town Kit*（CC0，
  [kenney.nl](https://www.kenney.nl)），由 `Session HUD/tools/relax_art.py` 產生一次。

## 任務清單

`Task Manager\CLAUDE.md` 告訴 Claude session 如何維護任務清單：`tasks.md` 的格式、
任務如何排序，以及何時同步 Excel。在工作資料夾裡開的任何 session 直接說
（「加個任務：…」、「…做完了」），它就會編輯 `tasks.md`；Agent Mission Control
會在 30 秒內反映變更。

## 在視窗裡操作

- **分頁**：右欄每個執行中的 `agents.json` session 一個分頁。勾了 *Open on start*
  （session 清單的右鍵選單）的會隨視窗啟動；`+` → *History* 可啟動清單裡其他的 session（旁邊的
  `✕` 會先確認，再把已關閉的 session 從 `agents.json` 刪掉，對話仍留在原工具的紀錄裡），`×` 結束
  一個。新增 session 或 fork 時名稱已存在，會先確認，再在原位置取代舊的。在分頁裡打字就跟一般終端機一樣。關掉視窗會結束所有分頁；對話會保留，下次接著
  繼續。已經在別的終端機執行的 session 會留在原處，不會有分頁。
- **Session 清單**：雙擊 session 會切到它的分頁（沒有終端機的 session，例如排程跑的
  `claude -p`，會顯示它是背景工作）。右鍵有 Copy、Copy all rows、
  Open on start、Terminate、Fork、Model；在分頁列的分頁上按右鍵，也會跳出同一個選單。上下拖曳 session 可以調整順序，順序存進 `agents.json`，
  分頁列也會跟著變。
- **選取和釘選文字**：在分頁裡拖曳選取（雙擊選一個字）。Claude 和 Codex 會接管滑鼠，
  在它們的分頁裡左鍵改成選取，不會傳給它們；滾輪照常讓它們捲動。在選取的文字上按右鍵
  有 *📌 Pin* 和 *Copy*。有釘選的窗格上方多一行（`📌 2 · <最新一則>`），點它展開清單，
  `×` 取消釘選。每個 session 各自一份，存在 `agents.json` 旁邊的 `pins.json`，和遠端桌面、
  手機頁共用。
- **Model**：右鍵選單的 *Model* 選 session 要用的模型：*Claude default*（不加
  `--model`，由 Claude Code 依方案和版本決定）、`fable`、`opus`、`sonnet`、`haiku`。
  選擇會存成 `agents.json` 裡的 `"model"`，啟動時以 `--model` 傳入。idle 的分頁會立刻
  重開並接續同一段對話；busy 或 waiting 的不會被中斷，下次啟動才套用。不在
  `agents.json` 裡的 session 沒有 Model 可選。Codex session 列出的是 *Codex default*
  和 Codex 自己選單裡的模型（來自 `~/.codex/models_cache.json`），以 `-m` 傳入。
  Antigravity session 列出的是 *Antigravity default* 和 `agy models` 列出的模型，以
  `--model` 傳入。
- **Fork**：在 Claude session 上按右鍵 → *Fork…*，或 `+` → *Fork session…* 貼上任一個
  Claude session id（不在 `agents.json` 裡、或在別的資料夾開的也可以），再輸入名稱。會在
  `agents.json` 新增一筆：這個名稱、新的 id、來源的 model、`"fork_of": "<來源 id>"`，並在分頁
  啟動 `claude --resume <來源 id> --fork-session --session-id <新 id>`：帶著到目前為止的對話，
  用自己的 id 繼續，來源 session 保持不變。之後再啟動就和其他 session 一樣接續 fork 這段對話。
  Codex session 也能用同樣的方式 fork，用的是 `codex fork <它的 thread>`（`"tool": "codex"`、
  `"fork_of": "<thread>"`），新的 thread 會像新開的 Codex 分頁一樣自動找到。Antigravity session 不能 fork。
- **安裝工具**：`+` 選單裡沒裝的工具會顯示成 *New … session… (install)*。點它會出現
  *Download and install it*，會開一個 `Install …` 分頁，執行該工具官方的安裝程式，裝在使用者
  資料夾、不需系統管理員（Linux：`curl -fsSL https://claude.ai/install.sh | bash`、
  `https://chatgpt.com/codex/install.sh | sh`、`https://antigravity.google/cli/install.sh | bash`；
  Windows 用對應的 `install.ps1` 以 `irm … | iex` 執行）。安裝程式問問題就在分頁裡回答，按 Enter
  關閉。之後會重新讀 PATH，不用重開就能 `+` → *New … session…*。第一次啟動時要登入。
  啟動失敗時選單會顯示原因；分頁的輸出也會寫進 `Session HUD/amc-web.log`（Windows）。
- **Codex 分頁**：`+` → *New Codex session…* 會新增一筆 `"tool": "codex"` 的 session，
  並在分頁裡啟動 `codex`（有 `prompts/<name>.md` 時會當成第一則訊息送出）。Codex 的
  session id 由它自己決定，而且要送出第一則訊息才會寫出對話紀錄
  （`~/.codex/sessions/<年>/<月>/<日>/rollout-…-<id>.jsonl`），所以送出第一則訊息後，
  id 才會存進 `agents.json` 的 `"thread"`；之後這個分頁就以 `codex resume <thread>`
  啟動。在那之前 session 清單的 id 欄顯示 `new`；還沒送出訊息就關掉的分頁，下次會開
  新的對話。清單只會列出這個視窗裡的 Codex 分頁（Codex 沒有執行中 session 的登錄檔），
  狀態也只有 busy 和 idle：等你核准指令的 Codex session 會顯示 busy。用量面板的 CODEX
  那一行和圓餅圖，是 Codex 在這台電腦上最近一輪對話後記下的帳號額度，方案有幾個額度
  視窗就有幾個圓餅（免費方案只有一個，30 天），所以在別處的用量要等這裡下一輪對話後
  才會顯示。
- **Antigravity 分頁**：`+` → *New Agy session…* 會新增一筆 `"tool": "agy"` 的
  session，並在分頁裡啟動 `agy`（有 `prompts/<name>.md` 時用 `-i` 當成第一則訊息）。跟
  Codex 一樣，agy 要送出第一則訊息才會建立對話
  （`~/.gemini/antigravity-cli/conversations/<id>.db`），之後 id 存進 `"conversation"`，
  分頁就以 `agy --conversation <id>` 啟動。第一次在工作資料夾啟動時 agy 會問要不要信任
  這個資料夾，在分頁裡回答即可。busy／idle 看對話的最後一步；按 Esc 中斷的那一輪，大約
  一分鐘後才會變回 idle。
- **Cross-check**：`+` → *Cross-check…* 讓 Claude、Codex、Antigravity 一起回答同一個問題
  （各自選模型；有安裝的工具都預設勾選，模型預設 Sonnet、Codex 自己的預設、agy 的 medium Flash）。*discuss*：大家先各自回答，之後每一輪
  看到別人的答案再修正，最後由 lead 整理。*review*：lead 回答，其他人審查，lead 回覆修正，
  最後由第一位審查者整理。輪數 1–3（預設 2），字數上限有兩個：每則回覆（預設 200），以及整理和每次的結論（預設 500）；0 = 不限。
  會開成一個 `⚖` 分頁：每一輪並排顯示，最下面可以追問（每個參加者回答後，再由一位寫結論）。
  參加者以 print 模式執行（`claude -p`、`codex exec`、`agy -p`），各有自己的對話，每一輪接續；
  能讀工作資料夾裡的檔案但不會修改，每一輪都會用到該工具的額度。整理或結論卡片上的
  *Send to…* 會把它打進某個 session 分頁，讓那個 session 去執行。session 清單裡討論以 `⚖`
  顯示，tokens 是所有模型的總和；右鍵有 Open on start、Terminate（停掉正在跑的步驟並關閉
  分頁）、Settings…（名稱、模型、lead、字數上限）。存在 `Session HUD/discussions/`（不進
  git），可以從 `+` → *History* 再打開。Codex 參加討論還沒實測過。
- **用量**：每個工具一段。CLAUDE：5 小時區段、今天和本週用量、本週何時重置（用帳號的
  時間，讀不到時用 `weekResetWeekday`／`weekResetHour`）、用了哪些模型。CODEX：每個額度
  視窗和重置時間。ANTIGRAVITY（`agents.json` 有 agy session 時）：每組模型的週額度，每
  10 分鐘在背景開一個看不到的 `agy` 打 `/usage` 讀出來（約 5 秒，不會用到模型額度，也不
  會新增對話）。
- **欄寬**：拖動三欄之間的分隔線可以調整寬度，寬度會記住。
- **按鍵**：Ctrl+Tab／Ctrl+Shift+Tab 切到下一個／上一個分頁；滑鼠滾輪在分頁列上可以左右捲動。
- **檔案**：從檔案管理員把檔案拖到某一格，會把完整路徑打進那個分頁。
- **圖片**：剪貼簿裡是圖片時按 Ctrl+V（或 Ctrl+Shift+V），會存成暫存資料夾裡的
  `amc-paste/paste-<時間>.png`（Linux 是 `/tmp`），並把路徑打進分頁；送出後 Claude 會讀那張圖。
  文字照常貼上。Ctrl+V 現在是貼上，不再原樣送給程式。截圖工具只複製檔案連結時，會貼上那個
  檔案的路徑。Linux 上 GTK 讀不到圖片時會改問 `wl-paste` 或 `xclip`，還是沒有圖片就把剪貼簿
  提供的格式寫進 `Session HUD/amc-web.log`。
- **分頁狀態**：每個分頁前的圓點是 session 狀態的顏色（busy 藍、idle 綠），busy 時圓點會閃。不在畫面上的
  分頁，session 跑完或在等你時會閃爍。
- **窗格（跟 VS Code 一樣）**：把分頁從分頁列拖到終端機區域。放在某個窗格的左、右、
  上、下邊緣，會在那一側切出新窗格；放在窗格中間，則取代那格原本的分頁。窗格可以自由
  巢狀（左右、上下或混合），窗格之間的分隔線可以拖動調整大小。點分頁會放進目前選中的
  窗格，如果它已經顯示在某格，就改選那一格；點一下窗格即可選中。窗格右上角的 `⊟` 會
  關閉窗格（session 繼續執行，分頁也還在分頁列上）；session 結束的窗格會自動關閉。
  版面會保留到下次啟動，屆時沒在執行的 session 會被拿掉。
- **分頁順序**：在分頁列上左右拖曳分頁，會有一條亮綠線標出放下的位置。順序會存進
  `agents.json`，下次啟動仍然保留，session 清單也會照這個順序排。
- **全寬**：分頁列右邊的 `⇔` 會收起任務欄和 Session Monitor，讓窗格佔滿整個視窗；
  再按一次 `⇔` 回到三欄。
- **主題**：分頁列右邊的 `⚙` → *Theme ▸* 列出主題：Classic（原本的黑底綠字，預設）、Dark、Light、
  Monokai、Solarized Dark、Solarized Light、Dracula、Nord、Gruvbox Dark、One Dark。
  主題會套用到整個視窗和終端機，下次啟動仍然保留。
- **預設 AI**：`⚙` → *Default AI ▸* 選 Claude、Codex 或 Antigravity（只能選有裝的），
  `Task Reminder` 和 `Session Manager` 第一次送出訊息建立時就用它。存在
  `Session HUD/hud-config.json` 的 `"defaultTool"`。這兩個分頁已經用別的工具時會先問：
  *Move them to …* 會在原位置換成新的一筆（新 id、新工具、不帶 model），原本開著就重開；最近
  50 則對話寫進 `Agents Launcher/handoff/<名稱>.md`（不進 git），新分頁會先讀它。舊對話留在
  原工具裡；Antigravity 的讀不到，所以從頭開始。*Only for new ones* 則不動它們。沒選時依序用
  Claude Code、Codex、Antigravity。
- **帳號**：`⚙` → *Accounts* 顯示每個已安裝工具登入的帳號（`claude auth status`、
  `codex login status`）。*Switch…* 會開一個 `Claude login`／`Codex login` 分頁，執行工具自己的
  登出和登入（瀏覽器會開登入頁），按 Enter 後關閉。之後這個工具的所有分頁都改用新帳號。
  *Agy · Switch…* 會開一個 `Agy login` 分頁執行 `agy` 並自動打 `/logout`；接著在裡面打
  `/login` 登入，再退出 agy（Ctrl+C）關閉分頁（agy 無法顯示目前登入的帳號）。
- **更新**：`⚙` → *Update* 會先確認，再在這個資料夾執行 `git pull --ff-only` 並顯示結果。
  有新版本時，Agent Mission Control 會透過啟動程式自己重開（所有分頁跟著重開，對話會接續）；
  已是最新版或出錯時不會重開。不是 git clone 的資料夾
  （下載的 zip、複製來的）會先變成 clone：你自己的檔案（`agents.json`、`hud-config.json`、
  `tasks.md`…）不動，跟 GitHub 不同的程式檔會先備份到 `.update-backup/<時間>/` 再換掉。沒有 git 時會先幫你裝：Windows 下載最新的 MinGit（Git for Windows
  官方的 zip，不需系統管理員）到 `%LOCALAPPDATA%\Programs\MinGit`，只給 Agent Mission Control
  用；Linux 會跳出系統密碼視窗執行 `apt-get install git`。
- **意見回饋**：`⚙` → *Send feedback…* 會用預設郵件程式開一封寄給作者的新信，標題是「AMC Feedback」。

- **到期日**：點任務的日期（或 `no due`）會跳出小月曆，選好的日子寫進 `tasks.md`
  並同步到 Excel。
- **狀態**：點任務的狀態（或 `-`）選 Pending／Ongoing／Checking／Finished／Discard。
  選 Finished 會先問結果（按 Enter；空白 = `finished`；Esc 取消），在任務底下寫
  `→ 結果 (日期)：…`（有子項目時，寫在每個還沒有結果的子項目底下），再把任務打勾，立刻從
  清單消失。Discard 也會用同樣的方式問原因（空白 = `discarded`），寫成 `discarded: <原因>`，
  再把任務從 `tasks.md` 拿掉，Excel 裡那幾列改成 Discarded。
- **任務歷史**：任務清單右上角的時鐘會列出已完成的任務（最新的在上面，附結果）和
  Discarded 的任務；點任務的 Finished／Discarded 選 *Restore → Pending* 可以還原。還原已完成
  的任務時，會刪掉完成當天加上的結果行；還原 Discarded 的任務時，會拿掉丟棄的原因。
- **聊天框**：任務清單下方的輸入框會把你打的內容送進 `Task Reminder` 分頁並送出
  （Shift+Enter 換行）。還沒有 `Task Reminder` 時，第一次送出會把它加進 `agents.json`
  並開出分頁，用的是 `⚙` → *Default AI* 選的工具（`Session Manager`
  也一樣，但它用的 ListAgents 和 SendMessage 只有 Claude Code 有）。

## 每日總結

| 排程 | 時間 | 功能 |
|---|---|---|
| Claude Daily Review | 平日 09:30 | 開一個終端機視窗，針對最新報告中仍未結案的項目，一次一項詢問你。 |
| Claude Daily Summary | 平日 19:00 | 讀取當天工作資料夾內的 Claude session，寫成 `Daily Summary\Reports\<日期>.md`。 |
| Claude Weekly Summary | 每週五 19:30 | 把當週的每日報告彙整成一份週報。 |

一次註冊三個排程：
```
powershell -ExecutionPolicy Bypass -File "Agent-Mission-Control\Daily Summary\setup-schedule.ps1"
```

這些排程都在無人值守下執行。若要讓它們用自己的 Claude 登入，把 OAuth token 放在
`Daily Summary\oauth-token.txt`（只有一行，不含其他內容）；沒有這個檔案時，會使用
該裝置原本的 Claude 登入。這個檔案請自行保管：不要複製到其他裝置，也不要 commit
（`.gitignore` 已經排除它）。

可選的筆記來源：每日總結也會讀取 `<工作資料夾>\Obsidian Vault\MyNotes\<日期>.md`，
前提是該檔案存在且含有 `#work` 標籤。
