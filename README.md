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
| `v2.3` (current) | `v2.2` plus Cross-check: Claude, Codex and Antigravity discuss or review one question in a `⚖` tab, with a summary, follow-ups with a conclusion, the total tokens in the session list, and *Send to…* a session's tab. See `CHANGELOG.md`. |
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
- Claude Code CLI, with `claude` on PATH
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
   and its modules, the ImportExcel module, the DejaVu Sans Mono font), makes your
   own `agents.json`, `hud-config.json`, `tasks.md` and `TaskDatabase.xlsx` from their
   templates if they are missing, puts the **Agent Mission Control** shortcut on the desktop,
   and asks which scheduled jobs to register. Nothing is copied elsewhere - the tools run
   from this folder. Run it again after moving the folder.
3. List your tabs in `agents.json` (it starts with one, `Session Manager`): one entry per
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
and Claude Code.

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

## Task list

`Task Manager\CLAUDE.md` tells a Claude session how to keep the task list:
the `tasks.md` format, how tasks are ranked, and when to sync the Excel file.
Talk to any session started in the working folder ("add a task: …", "… is done")
and it edits `tasks.md`; the Agent Mission Control picks the change up within 30 seconds.

## Working in the window

- **Tabs:** the right column has a tab per running `agents.json` session. The ones ticked
  *Open on start* (the session list's right-click menu) start with the window; `+` →
  *History* starts any other listed one, `×` ends one. Type into a tab as into any terminal. Closing the
  window ends every tab; the conversations are kept and resume next time. A session
  already running in another terminal is left there and gets no tab.
- **Session list:** double-click a session to show its tab (a session with no terminal,
  such as a scheduled `claude -p` job, says it is a background job). Right-click for Copy,
  Copy all rows, Open on start, Terminate and Model. Drag a session up or down to reorder
  it; the order is saved in `agents.json`, so the tab bar follows.
- **Model:** the right-click menu's *Model* picks what the session runs on: *Claude
  default* (no `--model`, so Claude Code picks by plan and version), `fable`, `opus`,
  `sonnet` or `haiku`. The choice is saved as `"model"` in `agents.json` and passed as
  `--model`. An idle tab restarts on it at once and resumes the same conversation; a busy
  or waiting one is not interrupted and takes it at its next start. Sessions not in
  `agents.json` have no Model choice. A Codex session lists *Codex default* and the
  models Codex's own picker shows (from `~/.codex/models_cache.json`), passed as `-m`.
  An Antigravity session lists *Antigravity default* and what `agy models` lists, passed
  as `--model`.
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
- **Antigravity tabs:** `+` → *New Antigravity session…* adds a session with
  `"tool": "agy"` and starts `agy` in its tab (with `prompts/<name>.md` through `-i` when
  that file exists). Like Codex, agy makes the conversation at the first message
  (`~/.gemini/antigravity-cli/conversations/<id>.db`); its id is then saved as
  `"conversation"` and the tab runs `agy --conversation <id>` from then on. The first
  start in the working folder asks whether to trust it; answer it in the tab. Busy or
  idle comes from the conversation's last step; a turn stopped with Esc shows idle about a
  minute later.
- **Cross-check:** `+` → *Cross-check…* asks Claude, Codex and Antigravity (each with
  its model; Sonnet and agy's medium Flash by default) one question. *discuss*: all answer,
  then each round sees the others' answers and revises; the lead sums up. *review*: the
  lead answers, the others review, the lead replies; the first reviewer sums up. Rounds 1–3
  (default 2) and a word limit per reply (default 100, 0 = none). It opens as a `⚖` tab:
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
- **Theme:** `⚙` at the right of the tab bar lists the themes: Classic (the original
  green on black, the default), Dark, Light, Monokai, Solarized Dark, Solarized Light,
  Dracula, Nord, Gruvbox Dark and One Dark. The theme colours the whole window and the
  terminals, and is kept for the next start.

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
  send adds one to `agents.json` and opens its tab.

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
| `v2.3`（目前） | `v2.2` 再加上 Cross-check：Claude、Codex、Antigravity 在 `⚖` 分頁裡討論或審查同一個問題，最後整理；追問會附結論；session 清單顯示所有模型的 token 總數；結論可用 *Send to…* 送進 session 分頁。詳見 `CHANGELOG.md`。 |
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
- Claude Code CLI，且 `claude` 在 PATH 中
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
   ImportExcel 模組、DejaVu Sans Mono 字型），若還沒有 `agents.json`、
   `hud-config.json`、`tasks.md`、`TaskDatabase.xlsx`，就從範本建立，接著在桌面建立
   **Agent Mission Control** 捷徑，並詢問要註冊哪些排程。不會把檔案複製到別處，工具直接
   從這個資料夾執行；資料夾搬家後再執行一次即可。
3. 在 `agents.json` 列出你的分頁（一開始已有一筆 `Session Manager`）：每個
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

## 任務清單

`Task Manager\CLAUDE.md` 告訴 Claude session 如何維護任務清單：`tasks.md` 的格式、
任務如何排序，以及何時同步 Excel。在工作資料夾裡開的任何 session 直接說
（「加個任務：…」、「…做完了」），它就會編輯 `tasks.md`；Agent Mission Control
會在 30 秒內反映變更。

## 在視窗裡操作

- **分頁**：右欄每個執行中的 `agents.json` session 一個分頁。勾了 *Open on start*
  （session 清單的右鍵選單）的會隨視窗啟動；`+` → *History* 可啟動清單裡其他的 session，`×` 結束
  一個。在分頁裡打字就跟一般終端機一樣。關掉視窗會結束所有分頁；對話會保留，下次接著
  繼續。已經在別的終端機執行的 session 會留在原處，不會有分頁。
- **Session 清單**：雙擊 session 會切到它的分頁（沒有終端機的 session，例如排程跑的
  `claude -p`，會顯示它是背景工作）。右鍵有 Copy、Copy all rows、
  Open on start、Terminate、Model。上下拖曳 session 可以調整順序，順序存進 `agents.json`，
  分頁列也會跟著變。
- **Model**：右鍵選單的 *Model* 選 session 要用的模型：*Claude default*（不加
  `--model`，由 Claude Code 依方案和版本決定）、`fable`、`opus`、`sonnet`、`haiku`。
  選擇會存成 `agents.json` 裡的 `"model"`，啟動時以 `--model` 傳入。idle 的分頁會立刻
  重開並接續同一段對話；busy 或 waiting 的不會被中斷，下次啟動才套用。不在
  `agents.json` 裡的 session 沒有 Model 可選。Codex session 列出的是 *Codex default*
  和 Codex 自己選單裡的模型（來自 `~/.codex/models_cache.json`），以 `-m` 傳入。
  Antigravity session 列出的是 *Antigravity default* 和 `agy models` 列出的模型，以
  `--model` 傳入。
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
- **Antigravity 分頁**：`+` → *New Antigravity session…* 會新增一筆 `"tool": "agy"` 的
  session，並在分頁裡啟動 `agy`（有 `prompts/<name>.md` 時用 `-i` 當成第一則訊息）。跟
  Codex 一樣，agy 要送出第一則訊息才會建立對話
  （`~/.gemini/antigravity-cli/conversations/<id>.db`），之後 id 存進 `"conversation"`，
  分頁就以 `agy --conversation <id>` 啟動。第一次在工作資料夾啟動時 agy 會問要不要信任
  這個資料夾，在分頁裡回答即可。busy／idle 看對話的最後一步；按 Esc 中斷的那一輪，大約
  一分鐘後才會變回 idle。
- **Cross-check**：`+` → *Cross-check…* 讓 Claude、Codex、Antigravity 一起回答同一個問題
  （各自選模型，預設 Sonnet 和 agy 的 medium Flash）。*discuss*：大家先各自回答，之後每一輪
  看到別人的答案再修正，最後由 lead 整理。*review*：lead 回答，其他人審查，lead 回覆修正，
  最後由第一位審查者整理。輪數 1–3（預設 2），每則回覆有字數上限（預設 100，0 = 不限）。
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
  文字照常貼上。Ctrl+V 現在是貼上，不再原樣送給程式。
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
- **主題**：分頁列右邊的 `⚙` 列出主題：Classic（原本的黑底綠字，預設）、Dark、Light、
  Monokai、Solarized Dark、Solarized Light、Dracula、Nord、Gruvbox Dark、One Dark。
  主題會套用到整個視窗和終端機，下次啟動仍然保留。

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
  並開出分頁。

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
