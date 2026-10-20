Import-Module ImportExcel -ErrorAction Stop

$tasksPath = Join-Path $PSScriptRoot 'tasks.md'
$xlsxPath = Join-Path $PSScriptRoot 'TaskDatabase.xlsx'

function Get-AllTasks {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return @() }
    $lines = Get-Content -Path $Path
    $tasks = @()
    $current = $null
    foreach ($line in $lines) {
        if ($line -match '^- \[( |x)\] (.+)$') {
            if ($current) { $tasks += $current }
            $checked = $matches[1] -eq 'x'
            $body = $matches[2]
            $added = $null
            if ($body -match '\(added:(\S+)\)') { $added = $matches[1] }
            $due = $null
            if ($body -match '\[due:(\S+)\]') { $due = $matches[1] }
            $text = $body -replace '\(added:\S+\)', '' -replace '\[due:\S+\]', '' -replace '\[priority:\S+\]', ''
            $current = [PSCustomObject]@{
                Text    = $text.Trim()
                Added   = $added
                Due     = $due
                Checked = $checked
                Items   = @()
                Result  = ''
            }
        } elseif ($current -and $line -match '^\s+→\s*(?:已回覆|結果)[^:：]*[:：]\s*(.+)$' -and $current.Items.Count -gt 0) {
            $current.Items[$current.Items.Count - 1].Result = $matches[1].Trim()
        } elseif ($current -and $line -match '^\s+→\s*(?:已回覆|結果)[^:：]*[:：]\s*(.+)$') {
            $current.Result = $matches[1].Trim()
        } elseif ($current -and $line -match '^\s+\S') {
            $current.Items += [PSCustomObject]@{ Subitem = $line.Trim(); Result = '' }
        } else {
            if ($current) { $tasks += $current }
            $current = $null
        }
    }
    if ($current) { $tasks += $current }
    return $tasks
}

function Get-SheetRows {
    param([string]$Path)
    $tasks = Get-AllTasks -Path $Path
    $rows = @()
    foreach ($t in $tasks) {
        if ($t.Items.Count -eq 0) {
            $rows += [PSCustomObject]@{ Items = $t.Text; Subitem = ''; Begin = $t.Added; Due = $t.Due; Checked = $t.Checked; Result = $t.Result }
        } else {
            foreach ($item in $t.Items) {
                $rows += [PSCustomObject]@{ Items = $t.Text; Subitem = $item.Subitem; Begin = $t.Added; Due = $t.Due; Checked = $t.Checked; Result = $item.Result }
            }
        }
    }
    return $rows
}

function Get-ExistingStatusMap {
    param([string]$Path)
    $map = @{}
    if (-not (Test-Path $Path)) { return $map }
    try {
        $existing = Import-Excel -Path $Path -ErrorAction Stop
    } catch {
        return $map
    }
    foreach ($row in $existing) {
        $key = "$($row.Items)|$($row.Subitem)"
        $map[$key] = $row.Status
    }
    return $map
}

function Get-DiscardedRows {
    # Rows manually marked Status=Discarded are no longer tracked in tasks.md at all (the
    # task line was removed), so they'd otherwise vanish on every resync. Preserve them as-is.
    param([string]$Path)
    $rows = @()
    if (-not (Test-Path $Path)) { return $rows }
    try {
        $existing = Import-Excel -Path $Path -ErrorAction Stop
    } catch {
        return $rows
    }
    foreach ($row in $existing) {
        if ($row.Status -eq 'Discarded') {
            $rows += [PSCustomObject]@{
                P       = $null
                Begin   = $row.Begin
                Due     = $row.Due
                Status  = 'Discarded'
                Items   = $row.Items
                Subitem = $row.Subitem
                Result  = $row.Result
            }
        }
    }
    return $rows
}

try {
    $statusMap = Get-ExistingStatusMap -Path $xlsxPath
    $discardedRows = Get-DiscardedRows -Path $xlsxPath
    $rows = Get-SheetRows -Path $tasksPath

    $output = foreach ($r in $rows) {
        $key = "$($r.Items)|$($r.Subitem)"
        if ($r.Checked) {
            $status = 'Finished'
        } else {
            $existing = $statusMap[$key]
            if ($existing -and $existing -ne 'Finished') {
                $status = $existing
            } else {
                $status = 'Pending'
            }
        }
        $beginDate = if ($r.Begin) { [datetime]::ParseExact($r.Begin, 'yyyy-MM-dd', $null) } else { $null }
        $dueDate = if ($r.Due) {
            [datetime]::ParseExact($r.Due, 'yyyy-MM-dd', $null)
        } elseif ($beginDate) {
            $beginDate.AddDays(7)
        } else {
            $null
        }
        [PSCustomObject]@{
            P       = $null
            Begin   = $beginDate
            Due     = $dueDate
            Status  = $status
            Items   = $r.Items
            Subitem = $r.Subitem
            Result  = $r.Result
        }
    }
    $output = @($output) + $discardedRows

    if (Test-Path $xlsxPath) { Remove-Item -Path $xlsxPath -ErrorAction Stop }

    $pkg = $output | Export-Excel -Path $xlsxPath -WorksheetName 'Tasks' -AutoSize -BoldTopRow -FreezeTopRow -PassThru
    $ws = $pkg.Workbook.Worksheets['Tasks']

    $rowCount = $output.Count
    for ($i = 0; $i -lt $rowCount; $i++) {
        $rowNum = $i + 2
        $ws.Cells["A$rowNum"].Formula = "IF(OR(D$rowNum=`"Finished`",D$rowNum=`"Discarded`"),999999,IF(C$rowNum<TODAY(),-1,1)*ABS(C$rowNum-TODAY())*_xlfn.IFS(D$rowNum=`"Checking`",1,D$rowNum=`"Ongoing`",2,D$rowNum=`"Pending`",3))"
    }
    $ws.Column(2).Style.Numberformat.Format = 'yyyy-mm-dd'
    $ws.Column(3).Style.Numberformat.Format = 'yyyy-mm-dd'
    $ws.Cells[$ws.Dimension.Address].AutoFitColumns()

    Close-ExcelPackage $pkg
    Write-Host "Synced $rowCount rows to $xlsxPath"
} catch {
    Write-Host "同步失敗：$($_.Exception.Message)"
    Write-Host "常見原因：TaskDatabase.xlsx 正在 Excel 裡開著，請先關閉再重試。"
    exit 1
}
