$scriptPath = Join-Path $PSScriptRoot 'show-hud.ps1'
. $scriptPath

$script:failed = $false
function Assert-Equal($actual, $expected, $label) {
    if ($actual -ne $expected) {
        Write-Host "FAIL: $label"
        Write-Host "  expected: [$expected]"
        Write-Host "  actual:   [$actual]"
        $script:failed = $true
    } else {
        Write-Host "PASS: $label"
    }
}

$tempDir = Join-Path $env:TEMP "hud-test-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $tempDir | Out-Null

$missingPath = Join-Path $tempDir 'missing.md'
Assert-Equal (Build-HudMessage -Path $missingPath) '目前沒有待辦事項' 'missing file'

$doneOnlyPath = Join-Path $tempDir 'done-only.md'
Set-Content -Path $doneOnlyPath -Value @('- [x] 已完成任務 (added:2026-08-10)')
Assert-Equal (Build-HudMessage -Path $doneOnlyPath) '目前沒有待辦事項' 'all tasks done'

$fixedToday = [datetime]'2026-08-27'

$normalPath = Join-Path $tempDir 'normal.md'
Set-Content -Path $normalPath -Value @(
    '- [ ] 寄報告給客戶 (added:2026-08-10)',
    '- [ ] 準備週會簡報 (added:2026-08-10) [due:2026-08-15]',
    '      這份簡報要涵蓋 Q2 進度與下季規劃',
    '- [x] 舊任務 (added:2026-08-01)'
)
# 準備週會簡報 has an explicit due date closer to (more overdue relative to) $fixedToday,
# so it now sorts ahead of 寄報告給客戶 (which falls back to added+7 days).
Assert-Equal (Build-HudMessage -Path $normalPath -Today $fixedToday) "1. 準備週會簡報 (2026-08-15)`r`n      • 這份簡報要涵蓋 Q2 進度與下季規劃`r`n2. 寄報告給客戶" 'normal list under 5 (priority-sorted, numbered titles, bulleted description, due date)'

$manyPath = Join-Path $tempDir 'many.md'
Set-Content -Path $manyPath -Value (1..7 | ForEach-Object { "- [ ] 任務$_ (added:2026-08-10)" })
$manyResult = Build-HudMessage -Path $manyPath -Today $fixedToday
if ($manyResult -notmatch '還有 2 項') {
    Write-Host "FAIL: remainder note missing from: $manyResult"
    $script:failed = $true
} else {
    Write-Host "PASS: remainder note present"
}

$statusDir = Join-Path $env:TEMP "hud-test-status-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $statusDir | Out-Null
$statusTasksPath = Join-Path $statusDir 'tasks.md'
Set-Content -Path $statusTasksPath -Value @(
    '- [ ] 測試進度任務 (added:2026-08-10)',
    '- [ ] 沒同步過的任務 (added:2026-08-10)'
)
$statusXlsxPath = Join-Path $statusDir 'TaskDatabase.xlsx'
Import-Module ImportExcel -ErrorAction Stop
[PSCustomObject]@{ Items = '測試進度任務'; Status = 'Ongoing' } | Export-Excel -Path $statusXlsxPath -WorksheetName 'Tasks' | Out-Null

$statusResult = Build-HudMessage -Path $statusTasksPath -Today $fixedToday
# Both tasks are equally overdue (same fallback due date); the unsynced task defaults to
# Pending's weight (3) which outranks Ongoing's weight (2) once overdue, so it sorts first.
Assert-Equal $statusResult "1. 沒同步過的任務`r`n2. 測試進度任務 [Ongoing]" 'status tag from TaskDatabase.xlsx, omitted when not yet synced'

$priorityDir = Join-Path $env:TEMP "hud-test-priority-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $priorityDir | Out-Null
$priorityTasksPath = Join-Path $priorityDir 'tasks.md'
Set-Content -Path $priorityTasksPath -Value @(
    '- [ ] 較不急任務 (added:2026-08-10) [due:2026-09-10]',
    '- [ ] 急件任務 (added:2026-08-10) [due:2026-08-20]'
)
$priorityXlsxPath = Join-Path $priorityDir 'TaskDatabase.xlsx'
@(
    [PSCustomObject]@{ Items = '較不急任務'; Status = 'Pending' }
    [PSCustomObject]@{ Items = '急件任務'; Status = 'Checking' }
) | Export-Excel -Path $priorityXlsxPath -WorksheetName 'Tasks' | Out-Null
# 急件任務 is overdue and Checking (weight 1, most urgent); 較不急任務 is far in the future and Pending (weight 3).
$priorityResult = Build-HudMessage -Path $priorityTasksPath -Today $fixedToday
Assert-Equal $priorityResult "1. 急件任務 (2026-08-20) [Checking]`r`n2. 較不急任務 (2026-09-10) [Pending]" 'sorted by TaskDatabase.xlsx-derived priority score, not file order'
Remove-Item -Recurse -Force $priorityDir

$resultLineDir = Join-Path $env:TEMP "hud-test-resultline-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $resultLineDir | Out-Null
$resultLineTasksPath = Join-Path $resultLineDir 'tasks.md'
Set-Content -Path $resultLineTasksPath -Value @(
    '- [ ] 主任務 (added:2026-08-10)',
    '      子項描述一',
    '      → 已回覆：(2026-08-17) 已修好',
    '      子項描述二',
    '      → 結果：(2026-08-17-120000，Claude 自動更新) 已完成',
    '      子項描述三（還沒完成）'
)
$resultLineResult = Build-HudMessage -Path $resultLineTasksPath -Today $fixedToday
# 子項描述一/二 already have a recorded result (done), so they're hidden entirely from the
# popup, not just their result line - only the still-open 子項描述三 remains.
Assert-Equal $resultLineResult "1. 主任務`r`n      • 子項描述三（還沒完成）" 'sub-items with a recorded result (已回覆/結果) are hidden from popup, kept only in Excel'
Remove-Item -Recurse -Force $resultLineDir

Remove-Item -Recurse -Force $statusDir
Remove-Item -Recurse -Force $tempDir

if ($script:failed) {
    Write-Host "SOME TESTS FAILED"
    exit 1
} else {
    Write-Host "ALL TESTS PASSED"
    exit 0
}
