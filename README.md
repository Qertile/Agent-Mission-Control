# AI-Infra

Tools for running several Claude Code sessions side by side on Windows.

[繁體中文說明在下方](#ai-infra繁體中文)

| Folder | What it does |
|---|---|
| `Agents Launcher` | Opens your Claude Code tabs in Windows Terminal, each resuming a fixed session, then starts the Agent Mission Control. |
| `Session HUD` | The Agent Mission Control window: task list, live sessions with 60-second activity, and 5-hour / weekly token usage. |
| `Task Manager` | Task list (`tasks.md`) and task history (`TaskDatabase.xlsx`), plus an optional weekday 09:30 reminder popup. |

## Requirements

- Windows 10 or 11 with Windows Terminal (`wt`)
- Claude Code CLI, with `claude` on PATH
- Python 3 on PATH (the Agent Mission Control reads token usage with `scan-usage.py`)
- PowerShell module ImportExcel, for task status and the Excel sync:
  `Install-Module ImportExcel -Scope CurrentUser`
- Font DejaVu Sans Mono (the HUD's typeface)

## Setup

1. Copy the `AI-Infra` folder into the folder your Claude sessions should work in.
   That parent folder becomes every tab's working directory.
2. Set up your tabs. `Agents Launcher\Agents Launcher.bat` ships with one example
   tab; the comments at its top explain how to add more. List the same session
   ids, in the same order, in `$script:SessionOrder` near the top of
   `Session HUD\show-session-hud.ps1`.
3. Create the desktop shortcut:
   ```
   powershell -ExecutionPolicy Bypass -File "AI-Infra\Agents Launcher\create-shortcut.ps1"
   ```
4. Optional — the weekday 09:30 reminder popup:
   ```
   powershell -ExecutionPolicy Bypass -File "AI-Infra\Task Manager\setup-schedule.ps1"
   ```

## Settings

- `Session HUD\hud-config.json`:
  - `costCap5h`: budget for one 5-hour block, in US dollars at API list price (left pie).
  - `costCapWeek`: budget for one week, same unit (right pie).
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

在 Windows 上同時執行多個 Claude Code session 的工具組。

| 資料夾 | 功能 |
|---|---|
| `Agents Launcher` | 在 Windows Terminal 開出所有 Claude Code 分頁，每個分頁各自接回固定的 session，接著啟動 Agent Mission Control。 |
| `Session HUD` | Agent Mission Control 視窗：任務清單、各 session 的即時狀態與 60 秒活動圖，以及 5 小時／每週的 token 用量。 |
| `Task Manager` | 任務清單（`tasks.md`）與任務歷史（`TaskDatabase.xlsx`），另有可選的平日 09:30 提醒彈窗。 |

## 需求

- Windows 10 或 11，並安裝 Windows Terminal（`wt`）
- Claude Code CLI，且 `claude` 在 PATH 中
- Python 3 在 PATH 中（Agent Mission Control 用 `scan-usage.py` 讀取 token 用量）
- PowerShell 模組 ImportExcel，用於任務狀態與 Excel 同步：
  `Install-Module ImportExcel -Scope CurrentUser`
- 字型 DejaVu Sans Mono（HUD 使用的字型）

## 安裝步驟

1. 把 `AI-Infra` 資料夾複製到你希望 Claude session 工作的資料夾裡。
   它的上一層資料夾就是每個分頁的工作目錄。
2. 設定分頁。`Agents Launcher\Agents Launcher.bat` 內附一個範例分頁，檔案開頭的註解
   說明如何新增。再把相同的 session id 依相同順序，填入
   `Session HUD\show-session-hud.ps1` 開頭附近的 `$script:SessionOrder`。
3. 建立桌面捷徑：
   ```
   powershell -ExecutionPolicy Bypass -File "AI-Infra\Agents Launcher\create-shortcut.ps1"
   ```
4. 可選：平日 09:30 提醒彈窗：
   ```
   powershell -ExecutionPolicy Bypass -File "AI-Infra\Task Manager\setup-schedule.ps1"
   ```

## 設定

- `Session HUD\hud-config.json`：
  - `costCap5h`：每個 5 小時區段的額度，單位是以 API 牌價換算的美元（左邊的圓餅圖）。
  - `costCapWeek`：每週的額度，單位相同（右邊的圓餅圖）。
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
