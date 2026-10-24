# AI-Infra

Tools for running several Claude Code sessions side by side on Windows and Linux.

[繁體中文說明在下方](#ai-infra繁體中文)

| Folder | What it does |
|---|---|
| `Agents Launcher` | Starts the Agent Mission Control window, which opens your Claude Code sessions as tabs inside it, each resuming a fixed session. |
| `Session HUD` | The Agent Mission Control window (`amc_web.py`): task list, live sessions with 60-second activity, 5-hour / weekly token usage, and a terminal tab per session. |
| `Task Manager` | Task list (`tasks.md`) and task history (`TaskDatabase.xlsx`), plus an optional weekday 09:30 reminder popup. |

Windows and Linux are kept on one branch, `master`: each platform's files sit side by
side in the same folders (see [Linux](#linux)), so there is no separate Linux branch.

Your own lists and settings - `agents.json`, `Session HUD/hud-config.json`,
`Task Manager/tasks.md` and `Task Manager/TaskDatabase.xlsx` - are not in git
(`.gitignore`). The installer makes each one from its `*.template.*` file the first time
and never overwrites it, so a `git pull` leaves your copies alone.

## Requirements

- Windows 10 or 11
- Claude Code CLI, with `claude` on PATH
- Python 3 on PATH, with the modules `pywebview`, `pywinpty` and `openpyxl`:
  `python -m pip install -U pywebview pywinpty openpyxl typing_extensions`
  (Python 3.7 needs the newer `typing_extensions`, or pywebview fails with
  `cannot import name 'Unpack'`)
- PowerShell module ImportExcel, for task status and the Excel sync:
  `Install-Module ImportExcel -Scope CurrentUser`
- Font DejaVu Sans Mono (the HUD's typeface)

## Setup

1. Copy the `AI-Infra` folder into the folder your Claude sessions should work in.
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
   under these names. (`"window"` was the Windows Terminal window of the old launcher
   and is no longer used.)

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
  *Open on start* (the session list's right-click menu) start with the window; `+` starts
  any other listed one, `×` ends one. Type into a tab as into any terminal. Closing the
  window ends every tab; the conversations are kept and resume next time. A session
  already running in another terminal is left there and gets no tab.
- **Session list:** double-click a session to show its tab. Right-click for Copy,
  Copy all rows, Open on start and Terminate.
- **Columns:** drag the bars between the three columns to resize them; the widths are kept.
- **Tab status:** the dot in each tab is its session's status colour (busy cyan, idle
  green). A tab not on screen blinks when its session finishes or waits for you.
- **Side by side:** `⇔` at the right of the tab bar hides the task and session columns and
  shows two tabs next to each other. A tab you click goes into the focused pane (click a
  pane to focus it); `⇔` again goes back.

- **Due date:** click a task's date (or `no due`) for a small calendar; the chosen day is
  written to `tasks.md` and synced to the Excel file.
- **Status:** click a task's status (or `-`) for Pending / Ongoing / Checking / Finished.
  Finished ticks the task off and it leaves the list at once.
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
powershell -ExecutionPolicy Bypass -File "AI-Infra\Daily Summary\setup-schedule.ps1"
```

The jobs run unattended. To give them their own Claude login, put an OAuth token in
`Daily Summary\oauth-token.txt` (one line, nothing else); without that file they use the
device's normal Claude login. Keep that file private: do not copy it to other devices
or commit it (`.gitignore` already excludes it).

Optional notes source: the daily summary also reads `<work folder>\Obsidian Vault\MyNotes\<date>.md`
when that file exists and contains the tag `#work`.

---

# AI-Infra（繁體中文）

在 Windows 和 Linux 上同時執行多個 Claude Code session 的工具組。

| 資料夾 | 功能 |
|---|---|
| `Agents Launcher` | 啟動 Agent Mission Control 視窗，由它在視窗內把 Claude Code session 開成分頁，每個分頁各自接回固定的 session。 |
| `Session HUD` | Agent Mission Control 視窗（`amc_web.py`）：任務清單、各 session 的即時狀態與 60 秒活動圖、5 小時／每週的 token 用量，以及每個 session 一個終端機分頁。 |
| `Task Manager` | 任務清單（`tasks.md`）與任務歷史（`TaskDatabase.xlsx`），另有可選的平日 09:30 提醒彈窗。 |

Windows 和 Linux 版放在同一個分支 `master`：兩個平台的檔案並排放在同樣的資料夾裡
（對照表見英文的 [Linux](#linux) 一節），沒有另外的 Linux 分支。

你自己的清單和設定——`agents.json`、`Session HUD/hud-config.json`、
`Task Manager/tasks.md`、`Task Manager/TaskDatabase.xlsx`——不放在 git 裡
（`.gitignore`）。安裝程式第一次執行時，會從各自的 `*.template.*` 範本建立，之後
不會再覆蓋，所以 `git pull` 不會動到你的檔案。

## 需求

- Windows 10 或 11
- Claude Code CLI，且 `claude` 在 PATH 中
- Python 3 在 PATH 中，並裝好 `pywebview`、`pywinpty`、`openpyxl` 模組：
  `python -m pip install -U pywebview pywinpty openpyxl typing_extensions`
  （Python 3.7 要裝新版 `typing_extensions`，否則 pywebview 會出現
  `cannot import name 'Unpack'`）
- PowerShell 模組 ImportExcel，用於任務狀態與 Excel 同步：
  `Install-Module ImportExcel -Scope CurrentUser`
- 字型 DejaVu Sans Mono（HUD 使用的字型）

## 安裝步驟

1. 把 `AI-Infra` 資料夾複製到你希望 Claude session 工作的資料夾裡。
   它的上一層資料夾就是每個分頁的工作目錄。
2. 雙擊 `install.bat`。它會檢查工具需要的程式（Claude Code、Python 3 與它的模組、
   ImportExcel 模組、DejaVu Sans Mono 字型），若還沒有 `agents.json`、
   `hud-config.json`、`tasks.md`、`TaskDatabase.xlsx`，就從範本建立，接著在桌面建立
   **Agent Mission Control** 捷徑，並詢問要註冊哪些排程。不會把檔案複製到別處，工具直接
   從這個資料夾執行；資料夾搬家後再執行一次即可。
3. 在 `agents.json` 列出你的分頁（一開始已有一筆 `Session Manager`）：每個
   Claude Code session 一筆，包含名稱和固定的 session id（用
   `powershell -c "[guid]::NewGuid()"` 產生）。Agent Mission Control 依這個順序、用這些
   名稱顯示。（`"window"` 是舊 launcher 的 Windows Terminal 視窗編號，已不再使用。）

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
  （session 清單的右鍵選單）的會隨視窗啟動；`+` 可啟動清單裡其他的 session，`×` 結束
  一個。在分頁裡打字就跟一般終端機一樣。關掉視窗會結束所有分頁；對話會保留，下次接著
  繼續。已經在別的終端機執行的 session 會留在原處，不會有分頁。
- **Session 清單**：雙擊 session 會切到它的分頁。右鍵有 Copy、Copy all rows、
  Open on start、Terminate。
- **欄寬**：拖動三欄之間的分隔線可以調整寬度，寬度會記住。
- **分頁狀態**：每個分頁前的圓點是 session 狀態的顏色（busy 藍、idle 綠）。不在畫面上的
  分頁，session 跑完或在等你時會閃爍。
- **並排**：分頁列最右邊的 `⇔` 會收起任務欄和 Session Monitor，兩個分頁左右並排。點分頁
  會放進目前選中的那格（點一下格子即可選中）；再按 `⇔` 回到三欄。

- **到期日**：點任務的日期（或 `no due`）會跳出小月曆，選好的日子寫進 `tasks.md`
  並同步到 Excel。
- **狀態**：點任務的狀態（或 `-`）選 Pending／Ongoing／Checking／Finished。
  選 Finished 會把任務打勾，立刻從清單消失。
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
powershell -ExecutionPolicy Bypass -File "AI-Infra\Daily Summary\setup-schedule.ps1"
```

這些排程都在無人值守下執行。若要讓它們用自己的 Claude 登入，把 OAuth token 放在
`Daily Summary\oauth-token.txt`（只有一行，不含其他內容）；沒有這個檔案時，會使用
該裝置原本的 Claude 登入。這個檔案請自行保管：不要複製到其他裝置，也不要 commit
（`.gitignore` 已經排除它）。

可選的筆記來源：每日總結也會讀取 `<工作資料夾>\Obsidian Vault\MyNotes\<日期>.md`，
前提是該檔案存在且含有 `#work` 標籤。
