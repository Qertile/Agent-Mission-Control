# Task HUD

> 本檔指令中的路徑都是相對路徑，起點是 Claude session 的工作資料夾，也就是放 AI-Infra 的那一層。

任務清單存放在 `Task Manager\tasks.md`，顯示在 Agent Mission Control（`Session HUD\show-session-hud.ps1`）的左側任務欄，它每 30 秒自動重讀 `tasks.md`。獨立的「Todo List」彈窗（`Task Manager\show-hud.ps1`）預設不使用，只有執行 `Task Manager\setup-schedule.ps1` 註冊排程後，才會在平日 09:30 跳出；`show-hud.ps1` 本身不要刪，Agent Mission Control 會載入它的解析與排序函式。

## 任務格式

```
- [ ] 任務內容 (added:YYYY-MM-DD)
- [ ] 任務內容 (added:YYYY-MM-DD) [due:YYYY-MM-DD]
      選填的任務描述，縮排一行
- [ ] 任務內容 (added:YYYY-MM-DD) [priority:high]
- [ ] [分類標籤] 任務內容 (added:YYYY-MM-DD)
```

任務可以在最前面加上 `[分類標籤]`（例如 `[ProjectA]`、`[ProjectB]`）標明屬於哪個專案／類別，這只是任務內容文字的一部分（不像 `[due:...]`／`[priority:...]` 會被解析後拿掉），彈窗跟文字清單都會照原樣一起顯示。新增任務時如果看得出屬於已有的分類，主動加上；不確定就先不加，或跟使用者確認。

彈窗顯示順序是依優先度分數動態排序（分數越小越急），不是單純照檔案順序：
- 分數公式跟 `TaskDatabase.xlsx` 的 P 欄公式概念一致：`(Due<今天?-1:1) × |Due-今天| × 狀態權重`，狀態權重 Checking=1、Ongoing=2、Pending（含還沒同步進 Excel 的任務）=3。
- Due 沒填的話用 `added 日期 + 7 天`當計算用的預設到期日（跟 sync-sheet.ps1 對 Excel 的預設值邏輯一致，但不會回寫到 tasks.md）。
- `tasks.md` 檔案本身的順序、`[due:...]`／`[priority:high]` 標記，只影響新增時插入的位置，不再直接決定彈窗顯示順序；Agent Mission Control 任務欄依排序顯示**全部**未完成項目，不限 5 項。

彈窗與文字版清單都會附上該任務在 `TaskDatabase.xlsx` 裡的 Status（依任務標題比對），格式是標題後面加 `[Ongoing]`／`[Checking]`／`[Pending]` 等；如果這個任務還沒同步進 Excel（例如剛新增、還沒跑過 sync-sheet.ps1），就不顯示狀態標籤，不會硬填預設值。

## 聊天互動規則

使用者在對話中提出以下要求時，直接編輯 `Task Manager\tasks.md`：

- **新增任務**（例如「加個任務：寄報告」）：插入新的一行 `- [ ] <內容> (added:<今天日期>)`；訊息提到期限就加 `[due:YYYY-MM-DD]`，提到緊急/優先就加 `[priority:high]`，提到額外說明就加一行縮排描述。插入位置依序：已過期 > 今天到期 > priority:high > 3天內到期 > 其餘（依 added 日期由舊到新），插入到符合的分組中。
- **完成任務**（例如「寄報告做完了」）：找到對應行，把 `- [ ]` 改成 `- [x]`。
- **刪除任務**：移除對應行（含縮排描述行）。
- **修改任務**（例如「把寄報告改成寄季報」「幫寄報告加個說明：附上Q2數據」）：更新對應行的文字、`due`、`priority` 或描述。
- **重新排序**（例如「把寄報告排到最前面」「寄報告移到準備簡報後面」）：直接搬動該行（含描述行）到指定位置；這個順序之後不會被自動規則覆蓋。
- **查詢**（例如「我今天該做什麼」）：讀取 `tasks.md`，依檔案順序列出未完成任務。

找不到明確對應的任務時，先跟使用者確認是哪一項，不要用猜的。

每次新增/完成/刪除/修改/重新排序之後，只要編輯 `tasks.md` 並跑 `sync-sheet.ps1` 同步，**不用在聊天室列出任務清單**，也**不要跳出獨立的 `show-hud.ps1` 彈窗**——Agent Mission Control 裡的任務欄會在 30 秒內自動重讀 `tasks.md`，使用者直接看那邊就好。以下保留舊的跳窗說明，只在使用者明確要求開獨立彈窗時才用：`show-hud.ps1` 每次直接執行時，會自動關閉上一個還開著的「今日待辦」舊視窗再開新的（比對視窗標題），不會讓視窗越開越多；這個行為內建在腳本裡，不需要額外下指令。跳窗必須用分離啟動，讓視窗獨立於工具的行程存在，不會被逾時機制關掉：

用 PowerShell 工具直接執行這行（不要再包一層 `powershell -Command "..."`，那層外殼本身會先彈出一個看得到的主控台視窗，使用者會看到多一個 PowerShell 視窗）：

```
Start-Process conhost.exe -ArgumentList 'powershell','-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File','"AI-Infra\Task Manager\show-hud.ps1"'
```

**為什麼一定要經過 `conhost.exe`**：Windows 11 的「預設終端機應用程式」若是 Windows Terminal， `Start-Process powershell` 配到的新主控台會由 WT 承載，畫面上會多一個標題叫 `powershell` 的空白終端機視窗。那個視窗屬於 `WindowsTerminal.exe`，`-WindowStyle Hidden` 跟腳本裡的 `Hide-ConsoleWindow` 都蓋不掉它。`conhost.exe` 會強制走舊版主控台，主控台留在本機行程裡並且是隱藏的，畫面上就只剩 HUD 本身。

`Session HUD\show-session-hud.ps1`（Sessions Monitor，同樣是 PowerShell+WinForms 彈窗）走同一套，`Agents Launcher\launch-agents.ps1` 裡也是透過 `conhost.exe` 啟動。**一定要用這個版本**，不要為了除錯方便改用沒有 `-WindowStyle Hidden`（例如加 `-RedirectStandardError` 抓錯誤訊息）的版本來跳窗給使用者看。需要除錯時，先用無頭版本自己確認沒問題，再用上面這個正式版本跳給使用者看。

## TaskDatabase.xlsx 同步

`Task Manager\TaskDatabase.xlsx` 是完整任務資料庫（含已完成任務的歷史紀錄），跟 `tasks.md` 分工：Agent Mission Control 任務欄顯示全部未完成任務，這份 Excel 給你搜尋/追蹤所有任務。

欄位：P（優先度公式）、Begin、Due（tasks.md 沒填 due 的話，Excel 這裡預設用 Begin + 7 天，不會回寫到 tasks.md）、Status（Pending/Ongoing/Checking/Finished，未完成任務預設 Pending，完成後強制改 Finished，其餘由使用者自己在 Excel 手動調整並會在同步時保留）、Items（任務標題）、Subitem（該任務的每一行縮排描述，一個描述一列；沒有描述就一列空白）、Result（該描述行後面若有 `→ 已回覆 (日期)：...` 或 `→ 結果 (日期)：...` 這種格式的行，會被抓進來當作這行的 Result，不會被當成新的 Subitem；如果這個任務本來就沒有子項目描述，直接在任務標題下加一行 `→ 結果：...`，會變成那唯一一列的 Result）。

P 欄公式（依到期日與狀態算優先度，數字越小越急；已完成一律給極大值 999999，不管到期日是多少，避免「今天到期又剛好完成」變成 0 誤判成最急）：
```
=IF(D{row}="Finished",999999,IF(C{row}<TODAY(),-1,1)*ABS(C{row}-TODAY())*IFS(D{row}="Checking",1,D{row}="Ongoing",2,D{row}="Pending",3))
```
（Excel 檔案內部實際存的是 `_xlfn.IFS(...)`，這是 Excel 對較新函數的內部命名規則，不是打錯字。）

每次新增/完成/刪除/修改/重新排序 `tasks.md` 之後，都要執行同步腳本更新這份 Excel：

```
powershell -ExecutionPolicy Bypass -File "AI-Infra\Task Manager\sync-sheet.ps1"
```

**Linux** 上改跑這行（`<套件資料夾>` 是工作資料夾裡放這套工具的那一層，例如 `Agent-Mission-Control`）：

```
python3 "<套件資料夾>/Task Manager/tasks.py" sync
```

Linux 上沒有 `show-hud.ps1`：使用者明確要求開獨立彈窗時，改用 `setsid -f python3 "<套件資料夾>/Task Manager/tasks.py" popup`，上面 `conhost.exe` 那段只適用 Windows。

如果同步失敗，最常見原因是使用者正在 Excel 裡開著這個檔案，請提醒使用者關閉檔案後再重試，不要自己嘗試其他繞過方式。
