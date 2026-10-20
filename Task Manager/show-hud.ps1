function Hide-ConsoleWindow {
    # -WindowStyle Hidden does not reliably suppress the console the launcher
    # creates, which leaves an empty PowerShell window next to the popup. Hide
    # the console this process owns instead.
    if (-not ([System.Management.Automation.PSTypeName]'ConsoleWindow.Native').Type) {
        Add-Type -Namespace ConsoleWindow -Name Native -MemberDefinition @'
            [System.Runtime.InteropServices.DllImport("kernel32.dll")]
            public static extern System.IntPtr GetConsoleWindow();
            [System.Runtime.InteropServices.DllImport("user32.dll")]
            public static extern bool ShowWindow(System.IntPtr hWnd, int nCmdShow);
'@
    }
    $handle = [ConsoleWindow.Native]::GetConsoleWindow()
    if ($handle -ne [System.IntPtr]::Zero) {
        [ConsoleWindow.Native]::ShowWindow($handle, 0) | Out-Null
    }
}

function Get-UncheckedTasks {
    param(
        [string]$Path
    )
    if (-not (Test-Path $Path)) { return @() }
    $lines = Get-Content -Path $Path
    $tasks = @()
    $current = $null
    $resultLinePattern = '^\s+→\s*(?:已回覆|結果)'
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ($line -match '^- \[ \] (.+)$') {
            if ($current) { $tasks += $current }
            $text = $matches[1]
            $due = $null
            if ($text -match '\[due:(\S+)\]') { $due = $matches[1] }
            $added = $null
            if ($text -match '\(added:(\S+)\)') { $added = $matches[1] }
            $text = $text -replace '\(added:\S+\)', ''
            $text = $text -replace '\[due:\S+\]', ''
            $text = $text -replace '\[priority:\S+\]', ''
            $current = [PSCustomObject]@{ Text = $text.Trim(); Description = @(); Due = $due; Added = $added }
        } elseif ($line -match '^- \[x\]') {
            if ($current) { $tasks += $current }
            $current = $null
        } elseif ($line -match '^\s+\S' -and $current) {
            if ($line -match $resultLinePattern) {
                # A result line by itself (no preceding description line owns it) - just skip it.
                continue
            }
            # A description line immediately followed by a result line means that sub-item is
            # already done - skip both instead of showing a "finished" item in the popup.
            $nextLine = if ($i + 1 -lt $lines.Count) { $lines[$i + 1] } else { $null }
            if ($nextLine -and $nextLine -match $resultLinePattern) {
                $i++
                continue
            }
            $current.Description += $line.Trim()
        } else {
            if ($current) { $tasks += $current }
            $current = $null
        }
    }
    if ($current) { $tasks += $current }
    return $tasks
}

function Get-TaskStatusMap {
    param(
        [string]$TasksPath
    )
    $map = @{}
    $xlsxPath = Join-Path (Split-Path -Path $TasksPath -Parent) 'TaskDatabase.xlsx'
    if (-not (Test-Path $xlsxPath)) { return $map }
    try {
        Import-Module ImportExcel -ErrorAction Stop
        $rows = Import-Excel -Path $xlsxPath -ErrorAction Stop
    } catch {
        return $map
    }
    foreach ($row in $rows) {
        if (-not $map.ContainsKey($row.Items)) {
            $map[$row.Items] = $row.Status
        }
    }
    return $map
}

function Get-TaskPriorityScore {
    param(
        [Nullable[datetime]]$Due,
        [string]$Status,
        [datetime]$Today
    )
    if ($Status -eq 'Finished') { return 999999 }
    $weight = switch ($Status) {
        'Checking' { 1 }
        'Ongoing'  { 2 }
        'Pending'  { 3 }
        default    { 3 }
    }
    if (-not $Due) { return 999998 }
    $diffDays = ($Due.Date - $Today.Date).Days
    $sign = if ($Due.Date -lt $Today.Date) { -1 } else { 1 }
    return $sign * [Math]::Abs($diffDays) * $weight
}

function Get-HudDisplayTasks {
    param(
        [string]$Path,
        [int]$Count = 5,
        [Nullable[datetime]]$Today = $null
    )
    if (-not $Today) { $Today = (Get-Date).Date }
    $allTasks = Get-UncheckedTasks -Path $Path
    $statusMap = Get-TaskStatusMap -TasksPath $Path
    foreach ($task in $allTasks) {
        $status = $null
        if ($statusMap.ContainsKey($task.Text)) { $status = $statusMap[$task.Text] }
        $task | Add-Member -NotePropertyName Status -NotePropertyValue $status -Force

        $effectiveDue = $null
        if ($task.Due) {
            $parsed = [datetime]::MinValue
            if ([datetime]::TryParseExact($task.Due, 'yyyy-MM-dd', $null, [System.Globalization.DateTimeStyles]::None, [ref]$parsed)) {
                $effectiveDue = $parsed
            }
        } elseif ($task.Added) {
            $parsed = [datetime]::MinValue
            if ([datetime]::TryParseExact($task.Added, 'yyyy-MM-dd', $null, [System.Globalization.DateTimeStyles]::None, [ref]$parsed)) {
                $effectiveDue = $parsed.AddDays(7)
            }
        }
        $score = Get-TaskPriorityScore -Due $effectiveDue -Status $status -Today $Today
        $task | Add-Member -NotePropertyName PriorityScore -NotePropertyValue $score -Force
    }
    $sorted = @($allTasks | Sort-Object -Property PriorityScore)
    $top = @($sorted | Select-Object -First $Count)
    return [PSCustomObject]@{
        Top       = $top
        Remaining = $sorted.Count - $top.Count
    }
}

function Build-HudMessage {
    param(
        [string]$Path,
        [int]$Count = 5,
        [Nullable[datetime]]$Today = $null
    )
    $display = Get-HudDisplayTasks -Path $Path -Count $Count -Today $Today
    if ($display.Top.Count -eq 0) {
        return '目前沒有待辦事項'
    }
    $lines = @()
    $index = 0
    foreach ($task in $display.Top) {
        $index++
        $title = "$index. $($task.Text)"
        if ($task.Due) { $title += " ($($task.Due))" }
        if ($task.Status) { $title += " [$($task.Status)]" }
        $lines += $title
        foreach ($desc in $task.Description) {
            $lines += "      • $desc"
        }
    }
    $message = $lines -join "`r`n"
    if ($display.Remaining -gt 0) {
        $message += "`r`n`r`n還有 $($display.Remaining) 項，開 Claude 問我"
    }
    return $message
}

function Get-HudStatusColor {
    param([string]$Status)
    switch ($Status) {
        'Ongoing'  { return [System.Drawing.Color]::FromArgb(0, 220, 255) }
        'Checking' { return [System.Drawing.Color]::FromArgb(255, 196, 0) }
        'Pending'  { return [System.Drawing.Color]::FromArgb(140, 150, 160) }
        default    { return [System.Drawing.Color]::FromArgb(140, 150, 160) }
    }
}

function Show-HudForm {
    param(
        [string]$Path,
        [int]$Count = 5
    )
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    if (-not ([System.Management.Automation.PSTypeName]'HudNative').Type) {
        Add-Type -Namespace HudNative -Name Win32 -MemberDefinition @'
            [System.Runtime.InteropServices.DllImport("user32.dll")]
            public static extern bool ReleaseCapture();
            [System.Runtime.InteropServices.DllImport("user32.dll")]
            public static extern int SendMessage(System.IntPtr hWnd, int Msg, int wParam, int lParam);
'@
    }
    $WM_NCLBUTTONDOWN = 0x00A1
    $HTCAPTION        = 2
    $HTBOTTOMRIGHT    = 17

    $display = Get-HudDisplayTasks -Path $Path -Count $Count

    $bgColor      = [System.Drawing.Color]::FromArgb(6, 10, 6)
    $barColor     = [System.Drawing.Color]::FromArgb(10, 16, 10)
    $accentColor  = [System.Drawing.Color]::FromArgb(51, 255, 102)
    $titleColor   = [System.Drawing.Color]::FromArgb(140, 255, 140)
    $descColor    = [System.Drawing.Color]::FromArgb(70, 160, 90)
    $noteColor    = [System.Drawing.Color]::FromArgb(90, 150, 100)
    $closeHover   = [System.Drawing.Color]::FromArgb(200, 60, 60)
    $termFont     = 'DejaVu Sans Mono'

    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'Todo List'
    $form.ShowInTaskbar = $true
    $form.StartPosition = 'CenterScreen'
    $form.Size = New-Object System.Drawing.Size(680, 320)
    $form.FormBorderStyle = 'None'
    $form.MinimumSize = New-Object System.Drawing.Size(360, 260)
    $form.TopMost = $true
    $form.BackColor = $bgColor
    $form.Opacity = 0.92

    $dragHandler = {
        if ($_.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
            [HudNative.Win32]::ReleaseCapture() | Out-Null
            [HudNative.Win32]::SendMessage($form.Handle, $WM_NCLBUTTONDOWN, $HTCAPTION, 0) | Out-Null
        }
    }

    $titleBar = New-Object System.Windows.Forms.Panel
    $titleBar.Dock = 'Top'
    $titleBar.Height = 30
    $titleBar.BackColor = $barColor
    $titleBar.Add_MouseDown($dragHandler)

    $titleLabel = New-Object System.Windows.Forms.Label
    $titleLabel.Text = '> Todo List'
    $titleLabel.ForeColor = $accentColor
    $titleLabel.BackColor = $barColor
    $titleLabel.Font = New-Object System.Drawing.Font($termFont, 12, [System.Drawing.FontStyle]::Bold)
    $titleLabel.Dock = 'Left'
    $titleLabel.Width = 200
    $titleLabel.TextAlign = 'MiddleLeft'
    $titleLabel.Padding = New-Object System.Windows.Forms.Padding(10, 0, 0, 0)
    $titleLabel.Add_MouseDown($dragHandler)

    $closeButton = New-Object System.Windows.Forms.Button
    $closeButton.Text = 'X'
    $closeButton.Dock = 'Right'
    $closeButton.Width = 40
    $closeButton.FlatStyle = 'Flat'
    $closeButton.BackColor = $barColor
    $closeButton.ForeColor = $titleColor
    $closeButton.Font = New-Object System.Drawing.Font('DejaVu Sans Mono', 12)
    $closeButton.FlatAppearance.BorderSize = 0
    $closeButton.FlatAppearance.MouseOverBackColor = $closeHover
    $closeButton.Add_Click({ $form.Close() })

    $minimizeButton = New-Object System.Windows.Forms.Button
    $minimizeButton.Text = '-'
    $minimizeButton.Dock = 'Right'
    $minimizeButton.Width = 40
    $minimizeButton.FlatStyle = 'Flat'
    $minimizeButton.BackColor = $barColor
    $minimizeButton.ForeColor = $titleColor
    $minimizeButton.Font = New-Object System.Drawing.Font('DejaVu Sans Mono', 16)
    $minimizeButton.FlatAppearance.BorderSize = 0
    $minimizeButton.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::FromArgb(30, 45, 30)
    $minimizeButton.Add_Click({ $form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized })

    $titleBar.Controls.Add($titleLabel)
    $titleBar.Controls.Add($minimizeButton)
    $titleBar.Controls.Add($closeButton)

    $scanline = New-Object System.Windows.Forms.Panel
    $scanline.Dock = 'Top'
    $scanline.Height = 2
    $scanline.BackColor = $accentColor

    $inner = New-Object System.Windows.Forms.Panel
    $inner.Dock = 'Fill'
    $inner.BackColor = $bgColor

    $noteFont = New-Object System.Drawing.Font('DejaVu Sans Mono', 9, [System.Drawing.FontStyle]::Italic)

    $grid = New-Object System.Windows.Forms.DataGridView
    $grid.Dock = 'Fill'
    $grid.BackgroundColor = $bgColor
    $grid.BorderStyle = 'None'
    $grid.ReadOnly = $true
    $grid.AllowUserToAddRows = $false
    $grid.AllowUserToDeleteRows = $false
    $grid.AllowUserToResizeRows = $false
    $grid.AllowUserToResizeColumns = $false
    $grid.RowHeadersVisible = $false
    # Cell selection + clipboard so any cell (or a dragged block of them) can be
    # picked and copied with Ctrl+C or the right-click menu.
    $grid.SelectionMode = 'CellSelect'
    $grid.MultiSelect = $true
    $grid.ClipboardCopyMode = 'EnableWithoutHeaderText'
    $grid.EnableHeadersVisualStyles = $false
    $grid.GridColor = $barColor
    $grid.CellBorderStyle = 'SingleHorizontal'
    $grid.ColumnHeadersHeightSizeMode = 'AutoSize'
    $grid.AutoSizeRowsMode = 'None'
    $grid.RowTemplate.Height = 30
    $grid.ScrollBars = 'Vertical'
    $grid.Font = New-Object System.Drawing.Font('DejaVu Sans Mono', 12)
    $grid.Margin = New-Object System.Windows.Forms.Padding(10)

    $grid.ColumnHeadersDefaultCellStyle.BackColor = $barColor
    $grid.ColumnHeadersDefaultCellStyle.ForeColor = $accentColor
    $grid.ColumnHeadersDefaultCellStyle.Font = New-Object System.Drawing.Font('DejaVu Sans Mono', 12, [System.Drawing.FontStyle]::Bold)
    $grid.ColumnHeadersDefaultCellStyle.Alignment = 'MiddleLeft'
    $grid.ColumnHeadersBorderStyle = 'None'
    $grid.DefaultCellStyle.BackColor = $bgColor
    $grid.DefaultCellStyle.ForeColor = $titleColor
    $grid.DefaultCellStyle.SelectionBackColor = $barColor
    $grid.DefaultCellStyle.SelectionForeColor = $accentColor
    $grid.DefaultCellStyle.WrapMode = 'True'
    $grid.DefaultCellStyle.Padding = New-Object System.Windows.Forms.Padding(4, 4, 4, 4)

    function Get-WrappedLines {
        param($Text, $Font, [double]$MaxWidth, $Graphics)
        if ([string]::IsNullOrEmpty($Text)) { return @('') }
        $words = $Text -split ' '
        $lines = New-Object System.Collections.Generic.List[string]
        $line = ''
        foreach ($w in $words) {
            $test = if ($line -eq '') { $w } else { "$line $w" }
            $width = $Graphics.MeasureString($test, $Font).Width
            if ($width -gt $MaxWidth -and $line -ne '') {
                $lines.Add($line)
                $line = $w
            } else {
                $line = $test
            }
        }
        if ($line -ne '') { $lines.Add($line) }
        if ($lines.Count -eq 0) { $lines.Add('') }
        return $lines.ToArray()
    }

    $copyMenu = New-Object System.Windows.Forms.ContextMenuStrip
    $copyMenu.BackColor = $barColor
    $copyMenu.ForeColor = $titleColor
    $copyMenu.ShowImageMargin = $false
    $copyItem = $copyMenu.Items.Add('Copy')
    $copyItem.Add_Click({
        if ($grid.GetClipboardContent()) {
            [System.Windows.Forms.Clipboard]::SetDataObject($grid.GetClipboardContent())
        }
    })
    $copyAllItem = $copyMenu.Items.Add('Copy all rows')
    $copyAllItem.Add_Click({
        $grid.SelectAll()
        if ($grid.GetClipboardContent()) {
            [System.Windows.Forms.Clipboard]::SetDataObject($grid.GetClipboardContent())
        }
    })
    $grid.ContextMenuStrip = $copyMenu

    # Right-clicking should select the cell under the cursor first, otherwise
    # Copy acts on whatever happened to be selected before.
    $grid.Add_CellMouseDown({
        param($sender, $e)
        if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Right -and $e.RowIndex -ge 0 -and $e.ColumnIndex -ge 0) {
            if (-not $grid.Rows[$e.RowIndex].Cells[$e.ColumnIndex].Selected) {
                $grid.ClearSelection()
                $grid.CurrentCell = $grid.Rows[$e.RowIndex].Cells[$e.ColumnIndex]
            }
        }
    })

    $itemPadLeft = 6
    $itemPadTop  = 6

    $colItem = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
    $colItem.Name = 'Item'
    $colItem.HeaderText = 'Item'
    $colItem.AutoSizeMode = 'Fill'
    $colItem.DefaultCellStyle.Padding = New-Object System.Windows.Forms.Padding($itemPadLeft, $itemPadTop, 4, 6)

    $colStatus = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
    $colStatus.Name = 'Status'
    $colStatus.HeaderText = 'Status'
    $colStatus.Width = 95
    $colStatus.DefaultCellStyle.Alignment = [System.Windows.Forms.DataGridViewContentAlignment]::MiddleCenter
    $colStatus.DefaultCellStyle.Font = New-Object System.Drawing.Font('DejaVu Sans Mono', 12, [System.Drawing.FontStyle]::Bold)
    $colStatus.HeaderCell.Style.Alignment = [System.Windows.Forms.DataGridViewContentAlignment]::MiddleCenter

    $colDue = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
    $colDue.Name = 'Due'
    $colDue.HeaderText = 'Due'
    $colDue.Width = 95
    $colDue.DefaultCellStyle.Alignment = [System.Windows.Forms.DataGridViewContentAlignment]::MiddleCenter
    $colDue.HeaderCell.Style.Alignment = [System.Windows.Forms.DataGridViewContentAlignment]::MiddleCenter

    $grid.Columns.Add($colItem) | Out-Null
    $grid.Columns.Add($colDue) | Out-Null
    $grid.Columns.Add($colStatus) | Out-Null

    if ($display.Top.Count -eq 0) {
        $grid.Rows.Add('目前沒有待辦事項', '', '') | Out-Null
    } else {
        foreach ($task in $display.Top) {
            $taskText = $task.Text
            if ($taskText.Length -gt 0) {
                $taskText = $taskText.Substring(0, 1).ToUpper() + $taskText.Substring(1)
            }
            $paragraphs = @([PSCustomObject]@{ Prefix = '▸ '; Text = $taskText; Color = $titleColor })
            foreach ($desc in $task.Description) {
                $descText = $desc
                if ($descText.Length -gt 0) {
                    $descText = $descText.Substring(0, 1).ToUpper() + $descText.Substring(1)
                }
                $paragraphs += [PSCustomObject]@{ Prefix = '    · '; Text = $descText; Color = $descColor }
            }
            $plainText = ($paragraphs | ForEach-Object { "$($_.Prefix)$($_.Text)" }) -join "`n"
            $rowIndex = $grid.Rows.Add($plainText, $(if ($task.Due) { $task.Due } else { '' }), $(if ($task.Status) { $task.Status } else { '' }))
            $grid.Rows[$rowIndex].Tag = $paragraphs
            $grid.Rows[$rowIndex].Cells['Status'].Style.Alignment = [System.Windows.Forms.DataGridViewContentAlignment]::MiddleCenter
            $grid.Rows[$rowIndex].Cells['Due'].Style.Alignment = [System.Windows.Forms.DataGridViewContentAlignment]::MiddleCenter
            if ($task.Status) {
                $grid.Rows[$rowIndex].Cells['Status'].Style.ForeColor = Get-HudStatusColor -Status $task.Status
            } else {
                $grid.Rows[$rowIndex].Cells['Status'].Style.ForeColor = $noteColor
            }
        }
    }

    $centerFlags = [System.Windows.Forms.TextFormatFlags]::HorizontalCenter -bor [System.Windows.Forms.TextFormatFlags]::VerticalCenter -bor [System.Windows.Forms.TextFormatFlags]::SingleLine

    $grid.Add_CellPainting({
        param($sender, $e)
        if ($e.ColumnIndex -eq $colStatus.Index -or $e.ColumnIndex -eq $colDue.Index) {
            $e.Handled = $true
            $g = $e.Graphics
            $bounds = $e.CellBounds
            if ($e.RowIndex -lt 0) {
                $brushBg = New-Object System.Drawing.SolidBrush($barColor)
                $g.FillRectangle($brushBg, $bounds)
                $brushBg.Dispose()
                $headerText = if ($e.ColumnIndex -eq $colStatus.Index) { 'Status' } else { 'Due' }
                [System.Windows.Forms.TextRenderer]::DrawText($g, $headerText, $grid.ColumnHeadersDefaultCellStyle.Font, $bounds, $accentColor, $centerFlags)
            } else {
                $isSelected = ($e.State -band [System.Windows.Forms.DataGridViewElementStates]::Selected) -ne 0
                $bg = if ($isSelected) { $barColor } else { $bgColor }
                $brushBg = New-Object System.Drawing.SolidBrush($bg)
                $g.FillRectangle($brushBg, $bounds)
                $brushBg.Dispose()
                $text = "$($e.Value)"
                $fg = $grid.Rows[$e.RowIndex].Cells[$e.ColumnIndex].Style.ForeColor
                if ($fg -eq [System.Drawing.Color]::Empty) { $fg = $titleColor }
                $font = if ($e.ColumnIndex -eq $colStatus.Index) { $colStatus.DefaultCellStyle.Font } else { $grid.Font }
                [System.Windows.Forms.TextRenderer]::DrawText($g, $text, $font, $bounds, $fg, $centerFlags)
            }
            return
        }
        if ($e.RowIndex -lt 0 -or $e.ColumnIndex -ne $colItem.Index) { return }
        $paragraphs = $grid.Rows[$e.RowIndex].Tag
        if (-not $paragraphs) { return }
        $e.Handled = $true
        $g = $e.Graphics
        $bounds = $e.CellBounds
        $isSelected = ($e.State -band [System.Windows.Forms.DataGridViewElementStates]::Selected) -ne 0
        $bg = if ($isSelected) { $barColor } else { $bgColor }
        $brushBg = New-Object System.Drawing.SolidBrush($bg)
        $g.FillRectangle($brushBg, $bounds)
        $brushBg.Dispose()

        $font = $grid.Font
        $maxWidth = $bounds.Width - $itemPadLeft - 4
        $y = $bounds.Top + $itemPadTop

        foreach ($p in $paragraphs) {
            $prefixWidth = [math]::Ceiling($g.MeasureString($p.Prefix, $font).Width)
            $available = $maxWidth - $prefixWidth
            $lines = Get-WrappedLines -Text $p.Text -Font $font -MaxWidth $available -Graphics $g
            $lineIndex = 0
            foreach ($ln in $lines) {
                if ($lineIndex -eq 0) {
                    $x = $bounds.Left + $itemPadLeft
                    $text = "$($p.Prefix)$ln"
                } else {
                    $x = $bounds.Left + $itemPadLeft + $prefixWidth
                    $text = $ln
                }
                $brush = New-Object System.Drawing.SolidBrush($p.Color)
                $g.DrawString($text, $font, $brush, $x, $y)
                $brush.Dispose()
                $y += $font.Height
                $lineIndex++
            }
        }
    })

    $updateItemRowHeights = {
        $g = $grid.CreateGraphics()
        $font = $grid.Font
        $colWidth = $colItem.Width
        $maxWidth = $colWidth - $itemPadLeft - 4
        foreach ($row in $grid.Rows) {
            $paragraphs = $row.Tag
            if (-not $paragraphs) { continue }
            $totalLines = 0
            foreach ($p in $paragraphs) {
                $prefixWidth = [math]::Ceiling($g.MeasureString($p.Prefix, $font).Width)
                $available = $maxWidth - $prefixWidth
                $lines = Get-WrappedLines -Text $p.Text -Font $font -MaxWidth $available -Graphics $g
                $totalLines += $lines.Count
            }
            $row.Height = [Math]::Max(30, $totalLines * $font.Height + $itemPadTop + 6)
        }
        $g.Dispose()
    }
    & $updateItemRowHeights
    $grid.Add_Resize({ & $updateItemRowHeights }.GetNewClosure())

    $noteLabel = New-Object System.Windows.Forms.Label
    $noteLabel.Dock = 'Bottom'
    $noteLabel.Height = 24
    $noteLabel.BackColor = $bgColor
    $noteLabel.ForeColor = $noteColor
    $noteLabel.Font = $noteFont
    $noteLabel.TextAlign = 'MiddleLeft'
    $noteLabel.Padding = New-Object System.Windows.Forms.Padding(10, 0, 0, 0)
    if ($display.Remaining -gt 0) {
        $noteLabel.Text = "還有 $($display.Remaining) 項，開 Claude 問我"
    } else {
        $noteLabel.Visible = $false
    }

    $grip = New-Object System.Windows.Forms.Panel
    $grip.Size = New-Object System.Drawing.Size(14, 14)
    $grip.Anchor = [System.Windows.Forms.AnchorStyles]::Bottom -bor [System.Windows.Forms.AnchorStyles]::Right
    $grip.Cursor = [System.Windows.Forms.Cursors]::SizeNWSE
    $grip.BackColor = $bgColor
    $grip.Add_Paint({
        param($sender, $e)
        $pen = New-Object System.Drawing.Pen($accentColor, 2)
        for ($n = 2; $n -le 10; $n += 4) {
            $e.Graphics.DrawLine($pen, 14 - $n, 14, 14, 14 - $n)
        }
        $pen.Dispose()
    })
    $grip.Add_MouseDown({
        if ($_.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
            [HudNative.Win32]::ReleaseCapture() | Out-Null
            [HudNative.Win32]::SendMessage($form.Handle, $WM_NCLBUTTONDOWN, $HTBOTTOMRIGHT, 0) | Out-Null
        }
    })

    $inner.Controls.Add($grid)
    $inner.Controls.Add($noteLabel)
    $form.Controls.Add($inner)
    $form.Controls.Add($scanline)
    $form.Controls.Add($titleBar)
    $form.Controls.Add($grip)
    $grip.BringToFront()
    $grip.Location = New-Object System.Drawing.Point(($form.ClientSize.Width - 16), ($form.ClientSize.Height - 16))
    $form.ShowDialog() | Out-Null
    $form.Dispose()
}

function Close-ExistingHudPopups {
    $existing = Get-Process -Name powershell -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowTitle -eq 'Todo List' }
    if (-not $existing) { return }
    $existing | ForEach-Object { $_.CloseMainWindow() | Out-Null }
    Start-Sleep -Milliseconds 300
    Get-Process -Name powershell -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowTitle -eq 'Todo List' } |
        Stop-Process -Force -ErrorAction SilentlyContinue
}

if ($MyInvocation.InvocationName -ne '.') {
    Close-ExistingHudPopups
    $tasksPath = Join-Path $PSScriptRoot 'tasks.md'
    Show-HudForm -Path $tasksPath
}
