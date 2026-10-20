# Optional OAuth token for these unattended jobs. It lives in its own file,
# never in a script, so the scripts can move between devices without it.
$tokenFile = Join-Path $PSScriptRoot 'oauth-token.txt'
if (Test-Path $tokenFile) { $env:CLAUDE_CODE_OAUTH_TOKEN = (Get-Content $tokenFile -Raw).Trim() }

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$reportsDir = (Join-Path $PSScriptRoot 'Reports')
$markerPath = (Join-Path $PSScriptRoot 'last-reviewed-report.txt')
$logPath = (Join-Path $PSScriptRoot 'daily-review.log')
$today = Get-Date -Format "yyyy-MM-dd"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# 只認純日期檔名（yyyy-mm-dd.md，自動化輸出格式），找今天以前最新的一份
# （週一會自動抓到上週五那份，不用額外處理週末邏輯）
$candidate = Get-ChildItem $reportsDir -File -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match '^\d{4}-\d{2}-\d{2}\.md$' -and $_.BaseName -lt $today
} | Sort-Object BaseName -Descending | Select-Object -First 1

if (-not $candidate) {
    Add-Content -Path $logPath -Encoding utf8 -Value "[$timestamp] 找不到今天以前的報告，跳過。`r`n"
    exit
}

# 避免同一份報告被重複詢問（例如報告延後補產生、或這個排程被手動多次觸發）
$lastReviewed = if (Test-Path $markerPath) { (Get-Content $markerPath -Raw).Trim() } else { "" }
if ($lastReviewed -eq $candidate.BaseName) {
    Add-Content -Path $logPath -Encoding utf8 -Value "[$timestamp] 最新報告 $($candidate.Name) 已經問過了，跳過。`r`n"
    exit
}
Set-Content -Path $markerPath -Value $candidate.BaseName -Encoding utf8 -NoNewline

$reviewPrompt = "請讀取 $($candidate.FullName) 這份報告，找出裡面「待辦事項彙總」這一段列出的所有項目。逐一唸出來詢問我目前的狀態或請我確認/裁定，一次只問一項，等我回答完才問下一項，不要一次全部列出來，也不要自己先假設答案。已結案的項目（標示結案、今天結案、已完成、Finished、discard、取消、移除，或報告寫明已解決者）一律跳過：不要問、不要列出、不要提到，也不要說「略過了幾項」。已結案就是結案。剩下的未結案項目重新從 1 開始編號，總項數也只算未結案的。全程不要問我要不要把確認結果寫回 tasks.md 或 TaskDatabase.xlsx，這兩個檔案不由你在這個流程裡編輯，我確認的狀態記在這次對話裡即可，之後會由每日總結或我自己處理，不要為此再問。"

# 用暫存啟動腳本開一個新的、可互動的視窗，避免命令列引號巢狀問題
$launcherPath = Join-Path $env:TEMP "claude-daily-review-launch.ps1"
@"
if (Test-Path "$tokenFile") { `$env:CLAUDE_CODE_OAUTH_TOKEN = (Get-Content "$tokenFile" -Raw).Trim() }
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
`$OutputEncoding = [System.Text.Encoding]::UTF8
claude "$reviewPrompt"
"@ | Set-Content -Path $launcherPath -Encoding utf8

Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoExit", "-File", $launcherPath)

Add-Content -Path $logPath -Encoding utf8 -Value "[$timestamp] 開啟互動視窗詢問報告：$($candidate.Name)`r`n"
