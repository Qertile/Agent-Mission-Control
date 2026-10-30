param(
    # 要彙整哪一週，用該週「週五」的日期指定；預設今天（排程本身就設在每週五 19:30 觸發）
    # 補跑之前某週可用 -TargetFriday "yyyy-MM-dd"（隨便給該週週一到週五間任一天亦可，內部一律換算回週一起算）
    # 預設：以「最近一個已到的週五」為準（週五 19:30 排程若錯過，之後補跑仍會算到那一週；中午前補跑視為前一天）
    [string]$TargetFriday = $(
        $b = if ((Get-Date).Hour -lt 12) { (Get-Date).AddDays(-1).Date } else { (Get-Date).Date }
        $b.AddDays(-((([int]$b.DayOfWeek) - 5 + 7) % 7)).ToString("yyyy-MM-dd")
    )
)

# OAuth token is stored in Windows Credential Manager (target: ClaudeDailySummaryToken),
# not in plaintext in this file. Written once via CredWrite; read back here via CredRead.
# 沿用跟 run-daily-summary.ps1 相同的 token，同一組排程自動化帳號。
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
# 用 run-weekly-summary.ps1 這個腳本檔名當專屬標記（跟 daily 排程用的 daily-summary-settings.json 標記分開比對，
# 避免誤判/誤殺彼此，即使兩邊共用同一份 settings.json 也不受影響）。
$staleCutoff = (Get-Date).AddHours(-2)
$orphans = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'claude.exe' -and
    $_.CommandLine -match [regex]::Escape("run-weekly-summary.ps1") -and
    $_.CreationDate -lt $staleCutoff
}
$logPath = (Join-Path $PSScriptRoot 'weekly-summary.log')
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

# 週數起算基準：week_01 = 2026-08-10（週一）那一週。傳入日期換算回當週週一，再算週間距。
$anchorMonday = [datetime]"2026-08-10"
$inputDate = [datetime]$TargetFriday
$daysSinceMonday = ([int]$inputDate.DayOfWeek + 6) % 7   # Monday=0 ... Sunday=6
$weekMonday = $inputDate.AddDays(-$daysSinceMonday)
$weekFriday = $weekMonday.AddDays(4)
$weekNumber = [int][math]::Floor(($weekMonday - $anchorMonday).Days / 7) + 1
$weekNumberPadded = "{0:D2}" -f $weekNumber

$dayList = 0..4 | ForEach-Object { $weekMonday.AddDays($_).ToString("yyyy-MM-dd") }
$dayListText = $dayList -join "、"

$base = $PSScriptRoot
# Everything is worked out from where this folder sits, so the package keeps
# working after it is copied. The work folder is the one that holds Agent-Mission-Control.
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
$reportsDir = "$base\Reports"
$outFile = "week_${weekNumberPadded}_report.md"

$prompt = @"
【重要，優先於其他任何全域規則】這是無人值守的排程自動化，不是即時對話——沒有使用者在畫面另一端等你發問或確認。
你的最終輸出一律不能只用聊天訊息呈現內容、不能用問句或「需要你確認/裁定」結尾、也不能因為要不要落筆有疑慮就中止。
就算你覺得某些內容不確定、需要使用者裁定，也只能用一句話簡短註記「不確定」直接寫進週報內文——然後照樣完成最後寫入檔案這一步。
「先在畫面上討論假設、不要把假設寫進文件」這類規則是給你跟使用者即時對話時用的，這裡不適用；這個流程本來就是每週固定會跑、使用者事後才會看報告，你必須每次都確實完成寫入檔案這一步，不能省略。

這是要把一整週（第 $weekNumberPadded 週，$($weekMonday.ToString("yyyy-MM-dd")) 週一 ~ $($weekFriday.ToString("yyyy-MM-dd")) 週五）的每日工作總結，彙整成一份週報。請完成以下工作：
1. 讀取 $reportsDir 底下這 5 個日期的既有每日報告（檔名格式 yyyy-mm-dd.md）：$dayListText
   - 如果某一天的報告檔案不存在（例如當天沒工作、或該次排程失敗未產出），直接略過、在週報裡如實註明「當天無報告」，不要因此中斷、也不要詢問使用者。
   - 不要重新去讀 $reportsDir 以外的原始 session 逐字稿，只彙整既有的每日報告內容即可。
2. 合併整週內容、去除跨日重複，依專案主題（例如：專案 A 的韌體開發、專案 A 的文件、專案 B、專案 C 等實際專案）分節整理成一份精簡的條列式週報（繁體中文）：
   - 只寫關鍵事實、實際做出的決策、修改的檔案、整週下來還沒解決的具體待辦；每項盡量一行講完。
   - 跨好幾天持續進行的同一件事，合併成一條講清楚進展（例如「專案 A 狀態機開發：週一起步 → 週三 compile 成功 → 週五系統測試 PASS」這種脈絡，不要每天各寫一條流水帳）。
   - 週報重點是「實質成果」：文件更新、專案/程式進度、設計討論與決策、採購/對外溝通進展、待解決的具體問題。session 本身做了什麼不是重點。
   - 一律不要寫入與上述無關的內容（含「主管摘要」在內，全文都適用）：每日總結/週報/Task HUD/排程等自動化工具的建置、除錯、修改；Claude 的誤解、被糾正、規則或記憶檔的新增；模型/設定切換；某天缺報告或額度用完的原因；報告產生過程本身。即使日報裡有這些內容也直接略過，不要轉載。
   - 不要寫「我怎麼彙整/篩選」這類方法論說明、不要寫「推測／未查證」的免責聲明段落。
   - 只有在結論本身高度不確定、可能誤導你時，才用一句話簡短註記「不確定」，不要展開整段解釋。
   - 若當週某幾天的報告有標記「✅ Task Reminder 確認的實際進度」小節，週報裡也比照獨立列出、標明是使用者本人確認過的進度。
   - 結尾列出「延續到下週」的待辦事項彙總。
3. 在標題正下方（所有其他小節之前）另外加一個「## 主管摘要」小節，是給主管看的精簡版本：
   - 完全拿掉技術細節（程式檔名、訊號/變數名稱、演算法/程式邏輯說明、session id 等），也不要出現任何工具/自動化/Claude 行為相關的內容，只留：這週的重大事件/風險、關鍵決策、對外採購或協作的進度與待回覆事項、需要使用者/主管決定或關注的事項。
   - 若這週有本節「延續到下週待辦」以外的重大突發事件（例如硬體損壞、規格變更、重大延誤），要在「主管摘要」最前面優先點出。
   - 用簡短條列，不要逐項流水帳，總長度大約是整份技術版週報的四分之一到三分之一。
   - 這個小節之後，其餘小節照原本方式保留完整技術細節（供你自己留存查閱），不要因為新增了主管摘要就把後面技術段落也簡化掉。
4. 把結果寫入 $reportsDir\$outFile（檔名固定用這個格式，不要加其他字尾），只留最終週報內容，不要附加步驟說明。
"@

# 若報告流程派背景子代理，print 模式預設只等 600 秒就強制中止，改成最多等 30 分鐘
$env:CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS = "1800000"
$limitPattern = "(?i)usage limit|session limit|rate limit|weekly limit"
$maxRetries = 3
$attempt = 0
do {
    $startTime = Get-Date
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $output = claude --settings "$settingsPath" -p $prompt --output-format text 2>&1 | Out-String
    # 週報檔案在本次執行後有被寫入就算成功（避免成功摘要文字裡剛好出現 "rate limit" 字樣被誤判）
    $outPath = "$reportsDir\$outFile"
    $written = (Test-Path $outPath) -and ((Get-Item $outPath).LastWriteTime -ge $startTime)
    $hitLimit = (-not $written) -and ($output -match $limitPattern)
    if (-not $hitLimit) { break }

    Add-Content -Path $logPath -Encoding utf8 -Value "[$timestamp] 第 $weekNumberPadded 週配額已達上限，本次未產生 Reports\$outFile。原始回應：`r`n$output`r`n"

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
        Add-Content -Path $logPath -Encoding utf8 -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 等到 $($resetAt.ToString('HH:mm')) 配額重置後重新要求產生週報。`r`n"
        Start-Sleep -Seconds $waitSec
        $attempt++
    } else { break }
} while ($attempt -le $maxRetries)

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
if ($hitLimit) {
    Add-Content -Path $logPath -Encoding utf8 -Value "[$timestamp] 第 $weekNumberPadded 週重試後仍遇配額上限，放棄，未產生 Reports\$outFile。`r`n"
} else {
    Add-Content -Path $logPath -Encoding utf8 -Value "[$timestamp] 執行完成（第 $weekNumberPadded 週，$($weekMonday.ToString('yyyy-MM-dd')) ~ $($weekFriday.ToString('yyyy-MM-dd'))）。`r`n$output`r`n"
}
