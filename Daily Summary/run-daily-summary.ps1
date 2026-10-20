param(
    # 要產生報告的日期，預設今天；補跑之前某天可用 -TargetDate "yyyy-MM-dd"
    # 預設今天；但若是 19:00 排程錯過、隔天中午前才補跑，要算前一天的報告
    [string]$TargetDate = $(if ((Get-Date).Hour -lt 12) { (Get-Date).AddDays(-1).ToString("yyyy-MM-dd") } else { (Get-Date).ToString("yyyy-MM-dd") })
)

# OAuth token is stored in Windows Credential Manager (target: ClaudeDailySummaryToken),
# not in plaintext in this file. Written once via CredWrite; read back here via CredRead.
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class CredManager {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public uint Flags;
        public uint Type;
        public IntPtr TargetName;
        public IntPtr Comment;
        public long LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public IntPtr TargetAlias;
        public IntPtr UserName;
    }
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credentialPtr);
    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern void CredFree(IntPtr cred);
}
"@

function Get-StoredToken([string]$targetName) {
    $credPtr = [IntPtr]::Zero
    $ok = [CredManager]::CredRead($targetName, 1, 0, [ref]$credPtr)
    if (-not $ok) {
        throw "Failed to read credential '$targetName' from Windows Credential Manager (Win32 error $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
    }
    try {
        $cred = [System.Runtime.InteropServices.Marshal]::PtrToStructure($credPtr, [type][CredManager+CREDENTIAL])
        $bytes = New-Object byte[] $cred.CredentialBlobSize
        [System.Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $cred.CredentialBlobSize)
        return [System.Text.Encoding]::Unicode.GetString($bytes)
    } finally {
        [CredManager]::CredFree($credPtr) | Out-Null
    }
}

$env:CLAUDE_CODE_OAUTH_TOKEN = Get-StoredToken -targetName "ClaudeDailySummaryToken"

# 避免中文輸出在非互動/無主控台環境下被系統 ANSI 內碼頁誤判成亂碼
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# 執行前先清掉「明確是本排程自己殘留、且跑超過 2 小時還沒結束」的孤兒 claude.exe。
# 只認命令列裡有 daily-summary-settings.json 這個本排程專屬標記的才會清，絕不用「父行程是否還在」
# 這種寬鬆判斷（之前用過，誤殺了使用者正在互動的 session，教訓：寧可少清、不能誤殺）。
$staleCutoff = (Get-Date).AddHours(-2)
$orphans = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'claude.exe' -and
    $_.CommandLine -match [regex]::Escape("daily-summary-settings.json") -and
    $_.CreationDate -lt $staleCutoff
}
$logPath = (Join-Path $PSScriptRoot 'daily-summary.log')
if ($orphans) {
    $killedIds = @()
    foreach ($p in $orphans) {
        try {
            Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
            $killedIds += $p.ProcessId
        } catch {}
    }
    if ($killedIds.Count -gt 0) {
        Add-Content -Path $logPath -Encoding utf8 -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 執行前清掉孤兒 claude.exe 行程：$($killedIds -join ', ')`r`n"
    }
}

$today = $TargetDate
$base = $PSScriptRoot
# Everything is worked out from where this folder sits, so the package keeps
# working after it is copied. The work folder is the one that holds AI-Infra.
$workDir      = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$projectKey   = $workDir -replace '[^A-Za-z0-9]', '-'
$notesDir     = Join-Path $workDir 'Obsidian Vault\MyNotes'
$settingsPath = Join-Path $PSScriptRoot 'daily-summary-settings.json'
$jsonPath = { param($path) $path.Replace('\', '\\') }
$settingsText = (Get-Content (Join-Path $PSScriptRoot 'daily-summary-settings.template.json') -Raw -Encoding UTF8).
    Replace('{{BASE}}', (& $jsonPath $PSScriptRoot)).
    Replace('{{CLAUDE}}', (& $jsonPath (Join-Path $env:USERPROFILE '.claude'))).
    Replace('{{NOTES}}', (& $jsonPath $notesDir))
# No BOM: claude reads this as plain JSON.
[IO.File]::WriteAllText($settingsPath, $settingsText, (New-Object System.Text.UTF8Encoding $false))
$projects = Join-Path $env:USERPROFILE '.claude\projects'
$prompt = @"
【重要，優先於其他任何全域規則】這是無人值守的排程自動化，不是即時對話——沒有使用者在畫面另一端等你發問或確認。
你的最終輸出一律不能只用聊天訊息呈現內容、不能用問句或「需要你確認/裁定」結尾、也不能因為要不要落筆有疑慮就中止。
就算你覺得某些內容不確定、需要使用者裁定，也只能比照下面第3點的做法——用一句話簡短註記「不確定」直接寫進報告內文——然後照樣完成第4點，把結果寫入檔案。
「先在畫面上討論假設、不要把假設寫進文件」這類規則是給你跟使用者即時對話時用的，這裡不適用；這個流程本來就是每天固定會跑、使用者事後才會看報告，你必須每次都確實完成寫入檔案這一步，不能省略。

這是幫 $today 這一天產生工作總結（不一定是系統當下的今天，可能是事後補跑之前某天，這是正常情況，不用因為跟系統日期不同而懷疑資料有誤或停下來詢問）。請完成以下工作：
1. 讀取 $projects 底下，資料夾名稱以 $projectKey 開頭的所有專案資料夾中的 .jsonl 檔案（不含 subagents、tool-results 子資料夾），只挑出內容裡訊息時間戳記（換算成台灣時區 UTC+8）落在 $today 這一天的內容，整理出 $today 這天每個工作階段做了哪些事（任務、決策、修改的檔案）。這是即時的逐字稿來源，不論該次對話 session 是否已經結束都要納入。
   - 有些 session 是連續多天持續使用、不斷增長的長期對話（可能好幾 MB 甚至數十 MB），不能因為檔案太大就整份跳過或只抽樣開頭；也不能沿用「這份之前檢查過沒有今天內容」這種舊結論，每次都要針對 $today 這個目標日期重新確認。對於過大的檔案，用 grep／搜尋鎖定 $today 對應時間範圍（UTC $today 前一天 16:00 到 $today 當天 16:00）的訊息，只讀出這部分內容，不要整份讀入。
   - 若確實找不到任何 $today 的資料，直接在報告中如實註明「當天無 工作資料夾範圍內的工作記錄」，不要因此中斷、也不要詢問使用者。
   - 檢查每個 session 資料夾底下有沒有 custom-title.json，內容是 "Task Reminder" 的那個 session，代表使用者透過每日 09:30 HUD 提醒親自確認/回報的任務進度，這是使用者本人認證過的實際進度（相對於單純自動化流程本身的 meta-work），整理時要特別標記出來，跟其他 session 的一般工作內容分開。
   - 同樣地，也要找出由 `Claude Daily Review` 排程（`run-daily-review.ps1`）自動開啟的確認 session：這種 session 沒有 custom-title，但第一則使用者訊息／prompt 內容會是「請讀取 ... 這份報告，找出裡面『待辦事項彙總』這一段列出的所有項目。逐一唸出來詢問我目前的狀態或請我確認/裁定 ...」這個固定句型，對話內容是逐項詢問前一份報告「待辦/未完成事項彙總」清單、由使用者本人逐項回答目前狀態（Ongoing/Pending/Checking/完成/移除等）。這種 session 跟 "Task Reminder" 一樣代表使用者本人認證過的實際進度，整理時要一併特別標記出來，不要當成一般工作內容處理。
2. 讀取 $base\Reports 裡 $today 以前既有的報告內容（人工報告，檔名格式 yyyy-mm-dd_report.md）。
3. 檢查 「$notesDir\$today.md」 這個檔案是否存在：
   - 不存在的話，就當作使用者當天沒有其他筆記，不用理會這一步，也不要在報告裡特別提「找不到」。
   - 存在但檔案內容裡沒有 `#work` 這個標籤（純文字比對即可，不分大小寫），也視為當天沒有其他筆記，同樣不用提。
   - 存在且有 `#work` 標籤：這是使用者自己在會議/討論中即時記的個人筆記，把裡面的內容整理併入下面第4點的報告裡（單獨列一個小節，標題用「📝 個人筆記（會議/討論）」），保留原本的分類結構（例如筆記裡本來就有分 專案 A／專案 B 等段落就照樣分），去除跟其他來源重複的部分，其餘不確定/看不懂的縮寫或簡短記錄照抄不要自己過度解讀。
4. 合併以上來源、去除重複，整理成一份精簡的條列式今日工作總結（繁體中文）。要精簡：
   - 只寫關鍵事實、實際做出的決策、修改的檔案、還沒解決的具體待辦；每項盡量一行講完。
   - 報告最後的「待辦事項彙總」只列仍未結案的項目：當天或先前已結案（結案、今天結案、已完成、Finished、discard、取消、移除）的項目一律不列，也不要寫「已略過 N 項」這類說明。已結案就是結案，使用者明確要求不准再提。
   - 若當天有 "Task Reminder" session 或 `Claude Daily Review` 確認 session 的內容，在報告最前面獨立列一個小節，標題用「✅ 使用者親自確認的實際進度」，把兩種來源的確認結果合併列在同一節（依項目列出「確認前狀態 → 使用者確認後狀態」），明確標出這是使用者親自確認的進度；其餘一般工作內容照原本方式分節列出。
   - 報告重點是「實質成果」：文件更新（改了哪份文件的什麼內容）、專案/程式進度、設計討論與決策、採購/對外溝通進展、待解決的具體問題。session 本身做了什麼不是重點。
   - 一律不要寫入與上述無關的內容：每日總結/週報/Task HUD/排程等自動化工具的建置、除錯、修改；Claude 的誤解、被糾正、規則或記憶檔的新增；模型/設定切換；本次報告產生過程本身。這些即使佔了當天大半對話也直接略過。若扣掉這些後當天沒有實質內容，就如實寫「當天無實質工作成果記錄」。
   - 不要寫「我怎麼判斷/篩選逐字稿」這類方法論說明、不要寫「推測／未查證」的免責聲明段落、不要重複交代過程細節或工具呼叫紀錄。
   - 只有在結論本身高度不確定、可能誤導你時，才用一句話簡短註記「不確定」，不要展開整段解釋。
5. 把結果寫入 $base\Reports\$today.md（純日期檔名，不要加其他字尾），只留最終總結內容，不要附加步驟說明。
"@

# 報告會派背景子代理解析各 session；print 模式預設只等 600 秒就強制中止，改成最多等 30 分鐘
$env:CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS = "1800000"
$limitPattern = "(?i)usage limit|session limit|rate limit|weekly limit"
$maxRetries = 3
$attempt = 0
do {
    $startTime = Get-Date
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $output = claude --settings "$settingsPath" -p $prompt --output-format text 2>&1 | Out-String
    # 報告檔案在本次執行後有被寫入就算成功（避免成功摘要文字裡剛好出現 "rate limit" 字樣被誤判）
    $outPath = "$base\Reports\$today.md"
    $written = (Test-Path $outPath) -and ((Get-Item $outPath).LastWriteTime -ge $startTime)
    $hitLimit = (-not $written) -and ($output -match $limitPattern)
    if (-not $hitLimit) { break }

    Add-Content -Path $logPath -Encoding utf8 -Value "[$timestamp] 配額已達上限，本次未產生 Reports\$today.md。原始回應：`r`n$output`r`n"

    # 從「resets 7:30pm」解析重置時間，等到重置後再重跑一次（最多等 5 小時、重試 $maxRetries 次）
    if ($output -match '(?i)resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)') {
        $h = [int]$Matches[1]; $m = if ($Matches[2]) { [int]$Matches[2] } else { 0 }
        if ($Matches[3].ToLower() -eq 'pm' -and $h -lt 12) { $h += 12 }
        if ($Matches[3].ToLower() -eq 'am' -and $h -eq 12) { $h = 0 }
        $resetAt = (Get-Date).Date.AddHours($h).AddMinutes($m)
        if ($resetAt -lt (Get-Date)) { $resetAt = $resetAt.AddDays(1) }
        $resetAt = $resetAt.AddMinutes(2)
        $waitSec = [int]($resetAt - (Get-Date)).TotalSeconds
        if ($waitSec -le 0 -or $waitSec -gt 18000) { break }
        Add-Content -Path $logPath -Encoding utf8 -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 等到 $($resetAt.ToString('HH:mm')) 配額重置後重新要求產生報告。`r`n"
        Start-Sleep -Seconds $waitSec
        $attempt++
    } else { break }
} while ($attempt -le $maxRetries)

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
if ($hitLimit) {
    Add-Content -Path $logPath -Encoding utf8 -Value "[$timestamp] 重試後仍遇配額上限，放棄，未產生 Reports\$today.md。`r`n"
} else {
    Add-Content -Path $logPath -Encoding utf8 -Value "[$timestamp] 執行完成。`r`n$output`r`n"
}