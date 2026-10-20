# Per-session activity trace for the sparklines. The sample is how many bytes a
# session appended to its own transcript in the last second - it costs one file
# length per session per tick, no parsing, and it tracks what the session is
# actually producing.
# The task panel reuses the Task HUD's own parsing and ranking (tasks.md +
# TaskDatabase.xlsx status), so both views always agree. Dot-sourcing only
# loads its functions; its own window is guarded behind a direct-run check.
$script:TaskHudScript = Join-Path (Split-Path $PSScriptRoot -Parent) 'Task Manager\show-hud.ps1'
if (Test-Path $script:TaskHudScript) { . $script:TaskHudScript }

$script:ActivitySamples  = @{}
$script:TranscriptPaths  = @{}
$script:TranscriptLast   = @{}
$script:ActivityWindow   = 60

function Update-ActivitySamples {
    param([object[]]$Sessions)

    $root = Join-Path $env:USERPROFILE '.claude\projects'
    foreach ($s in $Sessions) {
        $sid = $s.SessionId
        if (-not $sid) { continue }

        if (-not $script:TranscriptPaths.ContainsKey($sid)) {
            $hit = Get-ChildItem -Path $root -Filter "$sid.jsonl" -Recurse -ErrorAction SilentlyContinue |
                Select-Object -First 1
            $script:TranscriptPaths[$sid] = if ($hit) { $hit.FullName } else { '' }
        }

        $len = 0
        $path = $script:TranscriptPaths[$sid]
        if ($path -and (Test-Path $path)) { $len = (Get-Item $path -ErrorAction SilentlyContinue).Length }

        # First sighting has no previous length, so its delta is zero rather
        # than the whole file.
        $prev = if ($script:TranscriptLast.ContainsKey($sid)) { $script:TranscriptLast[$sid] } else { $len }
        $script:TranscriptLast[$sid] = $len

        if (-not $script:ActivitySamples.ContainsKey($sid)) {
            $script:ActivitySamples[$sid] = New-Object System.Collections.Generic.List[double]
        }
        $buf = $script:ActivitySamples[$sid]
        $buf.Add([double][Math]::Max(0, $len - $prev))
        while ($buf.Count -gt $script:ActivityWindow) { $buf.RemoveAt(0) }
    }
}

function Get-ActivityScale {
    # One shared ceiling so the rows can be compared against each other.
    $max = 0.0
    foreach ($buf in $script:ActivitySamples.Values) {
        foreach ($v in $buf) { if ($v -gt $max) { $max = $v } }
    }
    if ($max -lt 2048) { $max = 2048 }
    return $max
}

function Hide-ConsoleWindow {
    # -WindowStyle Hidden does not reliably suppress the console the launcher
    # creates, which leaves an empty PowerShell window next to the HUD. Hide
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

# Display order and labels come from agents.json in the package folder - the
# same list Agents Launcher opens its tabs from, so a tab is added, renamed or
# moved in one place. Keyed on session id: the id never changes, while the name
# the registry reports can drift (a resumed tab may come back auto-named).
# Sessions not in the list are appended, newest first, under the registry name.
# Read on every refresh, so edits show up without restarting the window.
function Get-SessionOrder {
    $file = Join-Path (Split-Path $PSScriptRoot -Parent) 'agents.json'
    if (-not (Test-Path $file)) { return @() }
    try {
        return @((Get-Content $file -Raw -Encoding UTF8 | ConvertFrom-Json).sessions |
            ForEach-Object { [PSCustomObject]@{ Id = $_.id; Label = $_.name } })
    } catch {
        return @()
    }
}

function Get-ActiveSessions {
    <#
        Reads the session registry Claude Code keeps in ~/.claude/sessions and
        drops entries whose process is gone (crashed sessions leave their json
        behind).
    #>
    $dir = Join-Path $env:USERPROFILE '.claude\sessions'
    if (-not (Test-Path $dir)) { return @() }
    $sessions = @()
    foreach ($file in Get-ChildItem -Path $dir -Filter '*.json' -ErrorAction SilentlyContinue) {
        try {
            $data = Get-Content -Path $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        } catch {
            continue
        }
        if (-not $data.pid) { continue }
        # The daemon pre-warms a spare worker alongside every background job
        # (daemon.log: "bg spawned <id> (spare)"). It holds no conversation and
        # retires itself when idle, so it is noise in this list.
        if ($data.spare) { continue }
        $proc = Get-Process -Id $data.pid -ErrorAction SilentlyContinue
        if (-not $proc) { continue }

        $started = $null
        if ($data.startedAt) {
            $started = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$data.startedAt).LocalDateTime
        }
        # updatedAt moves whenever the session flips busy/idle, so it is the
        # end of its last turn rather than just its start time.
        $updated = $null
        if ($data.updatedAt) {
            $updated = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$data.updatedAt).LocalDateTime
        }
        $name = $data.name
        if (-not $name) {
            $name = if ($data.sessionId) { $data.sessionId.Substring(0, 8) } else { "pid $($data.pid)" }
        }
        $sessions += [PSCustomObject]@{
            Pid       = $data.pid
            SessionId = "$($data.sessionId)"
            Name      = "$name"
            Cwd       = "$($data.cwd)"
            Status    = "$($data.status)"
            Kind      = "$($data.kind)"
            Version   = "$($data.version)"
            StartedAt = $started
            UpdatedAt = $updated
        }
    }
    $order = @(Get-SessionOrder)
    foreach ($s in $sessions) {
        $rank = 1000
        for ($i = 0; $i -lt $order.Count; $i++) {
            if ($order[$i].Id -eq $s.SessionId) {
                $rank = $i
                $s.Name = $order[$i].Label
                break
            }
        }
        $s | Add-Member -NotePropertyName Rank -NotePropertyValue $rank -Force
    }
    return @($sessions | Sort-Object -Property @{ Expression = { $_.Rank } }, `
                                                @{ Expression = { $_.StartedAt }; Descending = $true })
}

function Get-UsageSnapshot {
    <#
        Runs scan-usage.py and returns the parsed result, or $null when the
        scanner is unavailable.
    #>
    param([string]$ScriptDir)

    $scanner = Join-Path $ScriptDir 'scan-usage.py'
    if (-not (Test-Path $scanner)) { return $null }
    try {
        $raw = & python $scanner 2>$null
    } catch {
        return $null
    }
    if (-not $raw) { return $null }
    try {
        return ($raw -join '') | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Get-HudConfig {
    param([string]$ScriptDir)

    $path = Join-Path $ScriptDir 'hud-config.json'
    if (-not (Test-Path $path)) { return $null }
    try {
        return Get-Content -Path $path -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Format-TokenCount {
    param([double]$Value)
    if ($Value -ge 1000000) { return ('{0:N1}M' -f ($Value / 1000000)) }
    if ($Value -ge 1000)    { return ('{0:N1}K' -f ($Value / 1000)) }
    return ('{0:N0}' -f $Value)
}

function Format-Remaining {
    # [int] in PowerShell ROUNDS, so 2939s (49m) would come out as "1h49m".
    # Every division here has to floor explicitly.
    param([int]$Seconds)
    if ($Seconds -le 0) { return 'resetting' }
    $h = [int][Math]::Floor($Seconds / 3600)
    $m = [int][Math]::Floor(($Seconds % 3600) / 60)
    if ($h -ge 1) { return ('{0}h{1:00}m' -f $h, $m) }
    return ('{0}m' -f $m)
}

function Format-Uptime {
    param([Nullable[datetime]]$Started)
    if (-not $Started) { return '' }
    $span = (Get-Date) - $Started
    if ($span.TotalDays -ge 1) { return ('{0}d{1}h' -f [int][Math]::Floor($span.TotalDays), $span.Hours) }
    if ($span.TotalHours -ge 1) { return ('{0}h{1:00}m' -f [int][Math]::Floor($span.TotalHours), $span.Minutes) }
    return ('{0}m' -f [int][Math]::Floor($span.TotalMinutes))
}

function Get-SessionStatusColor {
    param([string]$Status)
    switch ($Status) {
        'busy'     { return [System.Drawing.Color]::FromArgb(0, 220, 255) }
        'running'  { return [System.Drawing.Color]::FromArgb(0, 220, 255) }
        'waiting'  { return [System.Drawing.Color]::FromArgb(255, 196, 0) }
        'idle'     { return [System.Drawing.Color]::FromArgb(140, 255, 140) }
        default    { return [System.Drawing.Color]::FromArgb(140, 150, 160) }
    }
}

function Show-SessionHudForm {
    param(
        [string]$ScriptDir,
        [int]$SessionIntervalMs = 3000,
        [int]$UsageIntervalMs = 15000
    )

    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    if (-not ([System.Management.Automation.PSTypeName]'SessionHudNative').Type) {
        Add-Type -Namespace SessionHudNative -Name Win32 -MemberDefinition @'
            [System.Runtime.InteropServices.DllImport("user32.dll")]
            public static extern bool ReleaseCapture();
            [System.Runtime.InteropServices.DllImport("user32.dll")]
            public static extern int SendMessage(System.IntPtr hWnd, int Msg, int wParam, int lParam);
'@
    }
    $WM_NCLBUTTONDOWN = 0x00A1
    $HTCAPTION        = 2
    $HTBOTTOMRIGHT    = 17

    $bgColor     = [System.Drawing.Color]::FromArgb(6, 10, 6)
    $barColor    = [System.Drawing.Color]::FromArgb(10, 16, 10)
    $accentColor = [System.Drawing.Color]::FromArgb(51, 255, 102)
    $titleColor  = [System.Drawing.Color]::FromArgb(140, 255, 140)
    $descColor   = [System.Drawing.Color]::FromArgb(70, 160, 90)
    $noteColor   = [System.Drawing.Color]::FromArgb(90, 150, 100)
    $closeHover  = [System.Drawing.Color]::FromArgb(200, 60, 60)
    # Sparkline: one line with a translucent fill under it. No bed, no grid.
    $sparkLine   = [System.Drawing.Color]::FromArgb(51, 255, 102)
    $sparkFill   = [System.Drawing.Color]::FromArgb(70, 51, 255, 102)
    $termFont    = 'DejaVu Sans Mono'

    $config = Get-HudConfig -ScriptDir $ScriptDir

    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'Agent Mission Control'
    $form.ShowInTaskbar = $true
    $form.StartPosition = 'CenterScreen'
    # 1099 for the sessions side plus the 362-px task column on the left.
    $form.Size = New-Object System.Drawing.Size(1461, 695)
    $form.FormBorderStyle = 'None'
    $form.MinimumSize = New-Object System.Drawing.Size(700, 400)
    $form.TopMost = $false
    $form.BackColor = $bgColor
    $form.Opacity = 0.92

    $dragHandler = {
        if ($_.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
            [SessionHudNative.Win32]::ReleaseCapture() | Out-Null
            [SessionHudNative.Win32]::SendMessage($form.Handle, $WM_NCLBUTTONDOWN, $HTCAPTION, 0) | Out-Null
        }
    }

    $titleBar = New-Object System.Windows.Forms.Panel
    $titleBar.Dock = 'Top'
    $titleBar.Height = 30
    $titleBar.BackColor = $barColor
    $titleBar.Add_MouseDown($dragHandler)

    $titleLabel = New-Object System.Windows.Forms.Label
    $titleLabel.Text = '> Agent Mission Control'
    $titleLabel.ForeColor = $accentColor
    $titleLabel.BackColor = $barColor
    $titleLabel.Font = New-Object System.Drawing.Font($termFont, 12, [System.Drawing.FontStyle]::Bold)
    $titleLabel.Dock = 'Left'
    $titleLabel.Width = 260
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
    $closeButton.Font = New-Object System.Drawing.Font($termFont, 12)
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
    $minimizeButton.Font = New-Object System.Drawing.Font($termFont, 16)
    $minimizeButton.FlatAppearance.BorderSize = 0
    $minimizeButton.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::FromArgb(30, 45, 30)
    $minimizeButton.Add_Click({ $form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized })

    # Borderless, so Maximized covers the whole screen - that is the fullscreen.
    $fullButton = New-Object System.Windows.Forms.Button
    $fullButton.Text = '□'
    $fullButton.Dock = 'Right'
    $fullButton.Width = 40
    $fullButton.FlatStyle = 'Flat'
    $fullButton.BackColor = $barColor
    $fullButton.ForeColor = $titleColor
    $fullButton.Font = New-Object System.Drawing.Font($termFont, 13)
    $fullButton.FlatAppearance.BorderSize = 0
    $fullButton.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::FromArgb(30, 45, 30)
    $fullButton.Add_Click({
        if ($form.WindowState -eq [System.Windows.Forms.FormWindowState]::Maximized) {
            $form.WindowState = [System.Windows.Forms.FormWindowState]::Normal
        } else {
            $form.WindowState = [System.Windows.Forms.FormWindowState]::Maximized
        }
    })

    # Dock=Right fills from the last-added control outward: close, full, minimize.
    $titleBar.Controls.Add($titleLabel)
    $titleBar.Controls.Add($minimizeButton)
    $titleBar.Controls.Add($fullButton)
    $titleBar.Controls.Add($closeButton)

    $scanline = New-Object System.Windows.Forms.Panel
    $scanline.Dock = 'Top'
    $scanline.Height = 2
    $scanline.BackColor = $accentColor

    # --- usage panel -------------------------------------------------------
    $usageState = [PSCustomObject]@{ Snapshot = $null; FetchedAt = $null; Failed = $false; Week = $null; WeekAt = $null }

    $usagePanel = New-Object System.Windows.Forms.Panel
    $usagePanel.Dock = 'Top'
    $hasCap = ($config -and $config.costCap5h -and [double]$config.costCap5h -gt 0)
    # The pie sits beside the text, so the cap does not add a row.
    $usagePanel.Height = 166
    $usagePanel.BackColor = $bgColor

    # Overview type is deliberately 1.5x the grid type so the numbers read at a glance.
    $usageFont      = New-Object System.Drawing.Font($termFont, 16)
    $usageBigFont   = New-Object System.Drawing.Font($termFont, 22, [System.Drawing.FontStyle]::Bold)
    $usageLabelFont = New-Object System.Drawing.Font($termFont, 13, [System.Drawing.FontStyle]::Bold)

    $usagePanel.Add_Paint({
        param($sender, $e)
        $g = $e.Graphics
        $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
        $x = 12
        $y = 8
        $snap = $usageState.Snapshot

        $brushLabel = New-Object System.Drawing.SolidBrush($descColor)
        $brushValue = New-Object System.Drawing.SolidBrush($titleColor)
        $brushAccent = New-Object System.Drawing.SolidBrush($accentColor)
        $brushNote = New-Object System.Drawing.SolidBrush($noteColor)

        $valueX = $x + 180

        if (-not $snap) {
            $msg = if ($usageState.Failed) { 'USAGE  scanner unavailable (needs python on PATH)' } else { 'USAGE  scanning...' }
            $g.DrawString($msg, $usageFont, $brushNote, $x, $y)
        } else {
            # Current 5-hour usage block
            $g.DrawString('5H BLOCK', $usageLabelFont, $brushAccent, $x, ($y + 8))
            $winTotal = [double]$snap.block.total
            $g.DrawString((Format-TokenCount $winTotal), $usageBigFont, $brushValue, $valueX, $y)
            $headline = 'tokens · {0} req' -f $snap.block.requests
            if ($snap.blockEnd) {
                $to = [datetime]::Parse($snap.blockEnd)
                $left = Format-Remaining ([int]$snap.blockSecondsLeft)
                $headline += ' · resets {0:HH:mm} · {1} left' -f $to, $left
            } else {
                $headline += ' · no block running'
            }
            $g.DrawString($headline, $usageFont, $brushLabel, ($x + 320), ($y + 8))

            $y += 44
            if ($hasCap) {
                # Share-of-cap pie, upper right. One value, so no legend: the
                # percentage is printed under it and the colour only repeats the
                # state it already says in words.
                # Two pies side by side: 5-hour block, then week. Caption above,
                # percentage below, both in text colour.
                $pies = @(
                    [PSCustomObject]@{ Caption = '5H';   Used = $(if ($null -ne $snap.blockCost) { [double]$snap.blockCost } else { $winTotal }); Cap = [double]$config.costCap5h }
                    [PSCustomObject]@{ Caption = 'WEEK'; Used = $(if ($usageState.Week) { $(if ($null -ne $usageState.Week.cost) { [double]$usageState.Week.cost } else { [double]$usageState.Week.total }) } else { 0 }); Cap = [double]$config.costCapWeek }
                )
                $pieD = 64
                $pieGap = 34
                $pieY = 30
                $pieFlags = [System.Windows.Forms.TextFormatFlags]::HorizontalCenter -bor [System.Windows.Forms.TextFormatFlags]::VerticalCenter
                $oldMode = $g.SmoothingMode
                for ($k = 0; $k -lt $pies.Count; $k++) {
                    $pie = $pies[$k]
                    if (-not $pie.Cap -or $pie.Cap -le 0) { continue }
                    $frac = [Math]::Min(1.0, $pie.Used / $pie.Cap)
                    $fillColor = if ($frac -ge 0.9) { [System.Drawing.Color]::FromArgb(255, 90, 90) }
                                 elseif ($frac -ge 0.7) { [System.Drawing.Color]::FromArgb(255, 196, 0) }
                                 else { $accentColor }
                    $pieX = $sender.Width - 24 - ($pies.Count - $k) * $pieD - ($pies.Count - 1 - $k) * $pieGap

                    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
                    $brushHole = New-Object System.Drawing.SolidBrush($barColor)
                    $g.FillEllipse($brushHole, $pieX, $pieY, $pieD, $pieD)
                    $brushHole.Dispose()
                    $brushWedge = New-Object System.Drawing.SolidBrush($fillColor)
                    $g.FillPie($brushWedge, $pieX, $pieY, $pieD, $pieD, -90, (360 * $frac))
                    $brushWedge.Dispose()
                    $penRing = New-Object System.Drawing.Pen($descColor, 1)
                    $g.DrawEllipse($penRing, $pieX, $pieY, $pieD, $pieD)
                    $penRing.Dispose()
                    $g.SmoothingMode = $oldMode

                    $capRect = New-Object System.Drawing.Rectangle(($pieX - 20), ($pieY - 24), ($pieD + 40), 20)
                    [System.Windows.Forms.TextRenderer]::DrawText($g, $pie.Caption, $usageLabelFont, $capRect, $descColor, $pieFlags)
                    $pctRect = New-Object System.Drawing.Rectangle(($pieX - 20), ($pieY + $pieD + 4), ($pieD + 40), 22)
                    [System.Windows.Forms.TextRenderer]::DrawText($g, ('{0:P0}' -f $frac), $usageLabelFont, $pctRect, $titleColor, $pieFlags)
                }
            }

            $g.DrawString(('new input {0} · output {1} · cache write {2} · cache read {3}' -f `
                (Format-TokenCount $snap.block.input), (Format-TokenCount $snap.block.output), `
                (Format-TokenCount $snap.block.cacheCreate), (Format-TokenCount $snap.block.cacheRead)), `
                $usageFont, $brushLabel, $x, $y)

            $y += 38
            $g.DrawString('TODAY/WEEK', $usageLabelFont, $brushAccent, $x, $y)
            $weekTotal = if ($usageState.Week) { Format-TokenCount ([double]$usageState.Week.total) } else { '...' }
            $g.DrawString(('{0} tokens / {1} tokens' -f (Format-TokenCount ([double]$snap.today.total)), $weekTotal), `
                $usageFont, $brushValue, $valueX, ($y - 4))

            $y += 34
            # Only the biggest few models fit on one line; the rest are counted.
            $models = @($snap.byModel.PSObject.Properties | Sort-Object -Property @{ Expression = { [double]$_.Value }; Descending = $true })
            $modelParts = @()
            foreach ($prop in ($models | Select-Object -First 3)) {
                $short = $prop.Name -replace '^claude-', ''
                $modelParts += ('{0} {1}' -f $short, (Format-TokenCount ([double]$prop.Value)))
            }
            if ($models.Count -gt 3) { $modelParts += ('+{0} more' -f ($models.Count - 3)) }
            if ($modelParts.Count -gt 0) {
                $g.DrawString('MODELS', $usageLabelFont, $brushAccent, $x, $y)
                $g.DrawString(($modelParts -join ' · '), $usageFont, $brushLabel, $valueX, ($y - 4))
            }
        }

        $brushLabel.Dispose(); $brushValue.Dispose(); $brushAccent.Dispose(); $brushNote.Dispose()

        $penLine = New-Object System.Drawing.Pen($barColor, 1)
        $g.DrawLine($penLine, 0, ($sender.Height - 1), $sender.Width, ($sender.Height - 1))
        $penLine.Dispose()
    })
    $usagePanel.Add_Resize({ $usagePanel.Invalidate() })
    $usagePanel.Add_MouseDown($dragHandler)


    # --- session grid ------------------------------------------------------
    $inner = New-Object System.Windows.Forms.Panel
    $inner.Dock = 'Fill'
    $inner.BackColor = $bgColor

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
    # The native scrollbar cannot be themed, so it is switched off and a flat
    # one in the HUD palette is drawn by $scrollBar below.
    $grid.ScrollBars = 'None'
    $grid.Font = New-Object System.Drawing.Font($termFont, 12)

    $grid.ColumnHeadersDefaultCellStyle.BackColor = $barColor
    $grid.ColumnHeadersDefaultCellStyle.ForeColor = $accentColor
    $grid.ColumnHeadersDefaultCellStyle.Font = New-Object System.Drawing.Font($termFont, 12, [System.Drawing.FontStyle]::Bold)
    $grid.ColumnHeadersDefaultCellStyle.Alignment = 'MiddleLeft'
    $grid.ColumnHeadersBorderStyle = 'None'
    $grid.DefaultCellStyle.BackColor = $bgColor
    $grid.DefaultCellStyle.ForeColor = $titleColor
    $grid.DefaultCellStyle.SelectionBackColor = $barColor
    $grid.DefaultCellStyle.SelectionForeColor = $accentColor
    $grid.DefaultCellStyle.WrapMode = 'True'

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

    $colSession = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
    $colSession.Name = 'Session'
    $colSession.HeaderText = 'Session'
    $colSession.AutoSizeMode = 'Fill'

    $colStatus = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
    $colStatus.Name = 'Status'
    $colStatus.HeaderText = 'Status'
    $colStatus.Width = 90
    $colStatus.DefaultCellStyle.Font = New-Object System.Drawing.Font($termFont, 12, [System.Drawing.FontStyle]::Bold)

    $colTokens = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
    $colTokens.Name = 'Tokens'
    $colTokens.HeaderText = '5h Tok'
    $colTokens.Width = 85

    $colUp = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
    $colUp.Name = 'Up'
    $colUp.HeaderText = 'Up'
    $colUp.Width = 85

    $colUpdated = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
    $colUpdated.Name = 'Updated'
    $colUpdated.HeaderText = 'Last Update'
    $colUpdated.Width = 215

    $grid.Columns.Add($colSession) | Out-Null
    $grid.Columns.Add($colStatus) | Out-Null
    $grid.Columns.Add($colTokens) | Out-Null
    $grid.Columns.Add($colUp) | Out-Null
    $grid.Columns.Add($colUpdated) | Out-Null

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

    $centerFlags = [System.Windows.Forms.TextFormatFlags]::HorizontalCenter -bor `
                   [System.Windows.Forms.TextFormatFlags]::VerticalCenter -bor `
                   [System.Windows.Forms.TextFormatFlags]::SingleLine

    $grid.Add_CellPainting({
        param($sender, $e)
        if ($e.ColumnIndex -ne $colSession.Index) {
            $e.Handled = $true
            $g = $e.Graphics
            $bounds = $e.CellBounds
            if ($e.RowIndex -lt 0) {
                $brushBg = New-Object System.Drawing.SolidBrush($barColor)
                $g.FillRectangle($brushBg, $bounds)
                $brushBg.Dispose()
                $headerText = $grid.Columns[$e.ColumnIndex].HeaderText
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
        if ($e.RowIndex -lt 0) { return }
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

        # The sparkline occupies the right end of the cell; keep the text clear of it.
        $sparkW = 210
        $sparkH = $bounds.Height - 14
        $sparkX = $bounds.Right - $sparkW - 10
        $drawSpark = ($sparkH -ge 16 -and $sparkX -gt ($bounds.Left + 160))

        $font = $grid.Font
        $maxWidth = $bounds.Width - $itemPadLeft - 4
        if ($drawSpark) { $maxWidth = $sparkX - $bounds.Left - $itemPadLeft - 10 }
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

        if (-not $drawSpark) { return }
        $sid = $grid.Rows[$e.RowIndex].Cells[$e.ColumnIndex].Tag
        if (-not $sid -or -not $script:ActivitySamples.ContainsKey($sid)) { return }
        $buf = $script:ActivitySamples[$sid]
        if ($buf.Count -lt 2) { return }

        # No plot bed - the chart sits straight on the row background.
        $sparkY = $bounds.Top + 7
        $scale = Get-ActivityScale
        $step = $sparkW / ($script:ActivityWindow - 1)
        # Oldest sample sits at the left edge even when the buffer is not full yet.
        $offset = $script:ActivityWindow - $buf.Count
        $pts = New-Object System.Collections.Generic.List[System.Drawing.PointF]
        for ($k = 0; $k -lt $buf.Count; $k++) {
            $px = $sparkX + ($offset + $k) * $step
            $py = $sparkY + $sparkH - 1 - (($buf[$k] / $scale) * ($sparkH - 2))
            $pts.Add((New-Object System.Drawing.PointF([single]$px, [single]$py)))
        }

        $oldSmooth = $g.SmoothingMode
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        if ($pts.Count -ge 2) {
            $poly = New-Object System.Collections.Generic.List[System.Drawing.PointF]
            $poly.Add((New-Object System.Drawing.PointF([single]$pts[0].X, [single]($sparkY + $sparkH))))
            $poly.AddRange($pts)
            $poly.Add((New-Object System.Drawing.PointF([single]$pts[$pts.Count - 1].X, [single]($sparkY + $sparkH))))
            $brushArea = New-Object System.Drawing.SolidBrush($sparkFill)
            $g.FillPolygon($brushArea, $poly.ToArray())
            $brushArea.Dispose()
            $penLine = New-Object System.Drawing.Pen($sparkLine, 1.4)
            $g.DrawLines($penLine, $pts.ToArray())
            $penLine.Dispose()
        }
        $g.SmoothingMode = $oldSmooth
    })

    $updateRowHeights = {
        $g = $grid.CreateGraphics()
        $font = $grid.Font
        $maxWidth = $colSession.Width - $itemPadLeft - 4
        foreach ($row in $grid.Rows) {
            $paragraphs = $row.Tag
            if (-not $paragraphs) { continue }
            $totalLines = 0
            foreach ($p in $paragraphs) {
                $prefixWidth = [math]::Ceiling($g.MeasureString($p.Prefix, $font).Width)
                $lines = Get-WrappedLines -Text $p.Text -Font $font -MaxWidth ($maxWidth - $prefixWidth) -Graphics $g
                $totalLines += $lines.Count
            }
            $row.Height = [Math]::Max(30, $totalLines * $font.Height + $itemPadTop + 6)
        }
        $g.Dispose()
    }

    $noteLabel = New-Object System.Windows.Forms.Label
    $noteLabel.Dock = 'Bottom'
    $noteLabel.Height = 24
    $noteLabel.BackColor = $bgColor
    $noteLabel.ForeColor = $noteColor
    $noteLabel.Font = New-Object System.Drawing.Font($termFont, 9, [System.Drawing.FontStyle]::Italic)
    $noteLabel.TextAlign = 'MiddleLeft'
    $noteLabel.Padding = New-Object System.Windows.Forms.Padding(10, 0, 0, 0)

    # --- flat scrollbar in the HUD palette ---------------------------------
    $scrollBar = New-Object System.Windows.Forms.Panel
    $scrollBar.Dock = 'Right'
    $scrollBar.Width = 12
    $scrollBar.BackColor = $bgColor
    $scrollState = [PSCustomObject]@{ Dragging = $false }

    $scrollMetrics = {
        $total = $grid.Rows.Count
        $visible = $grid.DisplayedRowCount($false)
        if ($visible -lt 1) { $visible = 1 }
        $trackH = $scrollBar.Height
        $thumbH = if ($total -gt 0) { [Math]::Max(28, [int]($trackH * $visible / $total)) } else { $trackH }
        [PSCustomObject]@{
            Total    = $total
            Visible  = $visible
            MaxFirst = [Math]::Max(0, $total - $visible)
            TrackH   = $trackH
            ThumbH   = [Math]::Min($trackH, $thumbH)
        }
    }

    $scrollBar.Add_Paint({
        param($sender, $e)
        $m = & $scrollMetrics
        $g = $e.Graphics
        $brushTrack = New-Object System.Drawing.SolidBrush($barColor)
        $g.FillRectangle($brushTrack, 0, 0, $sender.Width, $sender.Height)
        $brushTrack.Dispose()
        if ($m.MaxFirst -le 0) { return }
        $first = [Math]::Max(0, $grid.FirstDisplayedScrollingRowIndex)
        $thumbY = [int](($m.TrackH - $m.ThumbH) * $first / $m.MaxFirst)
        $brushThumb = New-Object System.Drawing.SolidBrush($accentColor)
        $g.FillRectangle($brushThumb, 3, $thumbY, ($sender.Width - 6), $m.ThumbH)
        $brushThumb.Dispose()
    })

    $scrollTo = {
        param($mouseY)
        $m = & $scrollMetrics
        if ($m.MaxFirst -le 0) { return }
        $span = [Math]::Max(1, $m.TrackH - $m.ThumbH)
        $frac = ($mouseY - ($m.ThumbH / 2)) / $span
        $frac = [Math]::Min(1.0, [Math]::Max(0.0, $frac))
        $grid.FirstDisplayedScrollingRowIndex = [int][Math]::Round($m.MaxFirst * $frac)
        $scrollBar.Invalidate()
    }

    $scrollBar.Add_MouseDown({ $scrollState.Dragging = $true; & $scrollTo $_.Y })
    $scrollBar.Add_MouseMove({ if ($scrollState.Dragging) { & $scrollTo $_.Y } })
    $scrollBar.Add_MouseUp({ $scrollState.Dragging = $false })
    $scrollBar.Add_Resize({ $scrollBar.Invalidate() })

    $grid.Add_MouseWheel({
        param($sender, $e)
        $m = & $scrollMetrics
        if ($m.MaxFirst -le 0) { return }
        $step = if ($e.Delta -gt 0) { -1 } else { 1 }
        $next = [Math]::Max(0, [Math]::Min($m.MaxFirst, $grid.FirstDisplayedScrollingRowIndex + $step))
        $grid.FirstDisplayedScrollingRowIndex = $next
        $scrollBar.Invalidate()
    })
    $grid.Add_Scroll({ $scrollBar.Invalidate() })

    $refreshGrid = {
        $sessions = Get-ActiveSessions
        $snap = $usageState.Snapshot

        # Build the rows first so an unchanged row set can be updated in place.
        # Rebuilding the grid every few seconds would wipe whatever the user had
        # selected, which makes copying out of it impossible.
        $desired = New-Object System.Collections.Generic.List[object]
        if ($sessions.Count -eq 0) {
            $desired.Add([PSCustomObject]@{
                Key = 'none'
                Paragraphs = @([PSCustomObject]@{ Prefix = '  '; Text = 'No active sessions'; Color = $noteColor })
                Cells = @('No active sessions', '', '', '', '')
                StatusColor = $noteColor
                SessionId = $null
            })
        } else {
            foreach ($s in $sessions) {
                $tokens = '-'
                $slot = $null
                if ($snap -and $s.SessionId) {
                    $slot = $snap.bySession.PSObject.Properties[$s.SessionId]
                    if ($slot) { $tokens = Format-TokenCount ([double]$slot.Value.block.total) }
                }
                $shortId = if ($s.SessionId.Length -ge 8) { $s.SessionId.Substring(0, 8) } else { $s.SessionId }
                $paragraphs = @(
                    [PSCustomObject]@{ Prefix = '▸ '; Text = $s.Name; Color = $titleColor },
                    [PSCustomObject]@{ Prefix = '    · '; Text = ('{0}  (pid {1})' -f $shortId, $s.Pid); Color = $descColor }
                )
                # The painted cell is drawn from Tag; Value is what Ctrl+C copies,
                # so keep the whole identity line in it.
                $sessionValue = '{0}  {1}  pid {2}' -f $s.Name, $shortId, $s.Pid

                # Prefer real token activity when the scan saw any, otherwise the
                # registry's own updatedAt.
                $updated = $s.UpdatedAt
                if ($slot -and $slot.Value.lastTs) {
                    $fromScan = [datetime]::Parse($slot.Value.lastTs)
                    if (-not $updated -or $fromScan -gt $updated) { $updated = $fromScan }
                }
                $updatedText = if ($updated) { $updated.ToString('yyyy-MM-dd HH:mm:ss') } else { '' }

                $desired.Add([PSCustomObject]@{
                    Key = $sessionValue
                    Paragraphs = $paragraphs
                    Cells = @($sessionValue, $s.Status, $tokens, (Format-Uptime $s.StartedAt), $updatedText)
                    StatusColor = (Get-SessionStatusColor -Status $s.Status)
                    SessionId = $s.SessionId
                })
            }
        }

        $sameRows = ($grid.Rows.Count -eq $desired.Count)
        if ($sameRows) {
            for ($i = 0; $i -lt $desired.Count; $i++) {
                if ($grid.Rows[$i].Cells['Session'].Value -ne $desired[$i].Key) { $sameRows = $false; break }
            }
        }

        if ($sameRows) {
            for ($i = 0; $i -lt $desired.Count; $i++) {
                $row = $grid.Rows[$i]
                for ($c = 1; $c -lt $grid.Columns.Count; $c++) {
                    if ($row.Cells[$c].Value -ne $desired[$i].Cells[$c]) { $row.Cells[$c].Value = $desired[$i].Cells[$c] }
                }
                $row.Cells['Status'].Style.ForeColor = $desired[$i].StatusColor
            }
        } else {
            $selectedId = $null
            if ($grid.CurrentRow -and $grid.CurrentRow.Index -ge 0) {
                $selectedId = $grid.Rows[$grid.CurrentRow.Index].Cells['Session'].Value
            }
            $scrollIndex = $grid.FirstDisplayedScrollingRowIndex

            $grid.Rows.Clear()
            foreach ($d in $desired) {
                $rowIndex = $grid.Rows.Add($d.Cells)
                $grid.Rows[$rowIndex].Tag = $d.Paragraphs
                $grid.Rows[$rowIndex].Cells['Session'].Tag = $d.SessionId
                $grid.Rows[$rowIndex].Cells['Status'].Style.ForeColor = $d.StatusColor
            }
            & $updateRowHeights

            if ($selectedId) {
                foreach ($row in $grid.Rows) {
                    if ($row.Cells['Session'].Value -eq $selectedId) {
                        $grid.CurrentCell = $row.Cells['Session']
                        break
                    }
                }
            }
            if ($scrollIndex -ge 0 -and $scrollIndex -lt $grid.Rows.Count) {
                $grid.FirstDisplayedScrollingRowIndex = $scrollIndex
            }
        }
        $scrollBar.Invalidate()

        $count = $sessions.Count
        $stamp = Get-Date -Format 'HH:mm:ss'
        if ($usageState.FetchedAt) {
            $noteLabel.Text = ('{0} active · sessions {1} · usage {2:HH:mm:ss}' -f $count, $stamp, $usageState.FetchedAt)
        } else {
            $noteLabel.Text = ('{0} active · sessions {1}' -f $count, $stamp)
        }
    }

    $refreshUsage = {
        # The weekly total reads up to seven days of transcripts, so only every 5 min.
        if (-not $usageState.WeekAt -or ((Get-Date) - $usageState.WeekAt).TotalMinutes -ge 5) {
            $weekFile = Join-Path $ScriptDir 'week-usage.json'
            $resetDay  = if ($config -and $null -ne $config.weekResetWeekday) { [int]$config.weekResetWeekday } else { 4 }
            $resetHour = if ($config -and $null -ne $config.weekResetHour) { [int]$config.weekResetHour } else { 21 }
            & python (Join-Path $ScriptDir 'scan-usage.py') --week $weekFile $resetDay $resetHour 2>$null | Out-Null
            if (Test-Path $weekFile) {
                try { $usageState.Week = Get-Content $weekFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch {}
            }
            $usageState.WeekAt = Get-Date
        }

        $snap = Get-UsageSnapshot -ScriptDir $ScriptDir
        if ($snap) {
            $usageState.Snapshot = $snap
            $usageState.FetchedAt = Get-Date
            $usageState.Failed = $false
        } else {
            $usageState.Failed = $true
        }
        $usagePanel.Invalidate()
    }

    $grid.Add_Resize({ & $updateRowHeights }.GetNewClosure())

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
            [SessionHudNative.Win32]::ReleaseCapture() | Out-Null
            [SessionHudNative.Win32]::SendMessage($form.Handle, $WM_NCLBUTTONDOWN, $HTBOTTOMRIGHT, 0) | Out-Null
        }
    })

    # Docking is resolved from the last control to the first, so the Fill grid
    # must be added first, then the right-hand scrollbar, then the bottom note.
    $inner.Controls.Add($grid)
    $inner.Controls.Add($scrollBar)
    $inner.Controls.Add($noteLabel)
    # --- task column (left) ------------------------------------------------
    # Each task is a vertical block - title, sub-items, then ">> due  status" -
    # instead of the popup's three columns, which do not fit a narrow column.
    $taskPanel = New-Object System.Windows.Forms.Panel
    $taskPanel.Dock = 'Left'
    $taskPanel.Width = 360
    $taskPanel.BackColor = $bgColor

    $taskHeader = New-Object System.Windows.Forms.Label
    $taskHeader.Text = 'Tasks'
    $taskHeader.Dock = 'Top'
    $taskHeader.Height = 30
    $taskHeader.BackColor = $barColor
    $taskHeader.ForeColor = $accentColor
    $taskHeader.Font = New-Object System.Drawing.Font($termFont, 12, [System.Drawing.FontStyle]::Bold)
    $taskHeader.TextAlign = 'MiddleLeft'
    $taskHeader.Padding = New-Object System.Windows.Forms.Padding(8, 0, 0, 0)

    # A read-only RichTextBox keeps the text selectable and copyable.
    $taskBox = New-Object System.Windows.Forms.RichTextBox
    $taskBox.Dock = 'Fill'
    $taskBox.ReadOnly = $true
    $taskBox.BorderStyle = 'None'
    $taskBox.BackColor = $bgColor
    $taskBox.ForeColor = $titleColor
    $taskBox.Font = New-Object System.Drawing.Font($termFont, 12)
    $taskBox.DetectUrls = $false
    $taskBox.ScrollBars = 'Vertical'   # appears only when the list is taller than the panel
    $taskBox.WordWrap = $true
    $taskBox.TabStop = $false

    $taskBoxPad = New-Object System.Windows.Forms.Panel
    $taskBoxPad.Dock = 'Fill'
    $taskBoxPad.BackColor = $bgColor
    $taskBoxPad.Padding = New-Object System.Windows.Forms.Padding(10, 8, 6, 4)
    $taskBoxPad.Controls.Add($taskBox)

    $taskNote = New-Object System.Windows.Forms.Label
    $taskNote.Dock = 'Bottom'
    $taskNote.Height = 24
    $taskNote.BackColor = $bgColor
    $taskNote.ForeColor = $noteColor
    $taskNote.Font = New-Object System.Drawing.Font($termFont, 9, [System.Drawing.FontStyle]::Italic)
    $taskNote.TextAlign = 'MiddleLeft'
    $taskNote.Padding = New-Object System.Windows.Forms.Padding(10, 0, 0, 0)

    $taskPanel.Controls.Add($taskBoxPad)
    $taskPanel.Controls.Add($taskNote)
    $taskPanel.Controls.Add($taskHeader)

    $taskDivider = New-Object System.Windows.Forms.Panel
    $taskDivider.Dock = 'Left'
    $taskDivider.Width = 2
    $taskDivider.BackColor = $barColor

    $tasksPath = Join-Path (Split-Path $ScriptDir -Parent) 'Task Manager\tasks.md'
    $taskState = [PSCustomObject]@{ Signature = $null }
    # Same faces as the session grid: names regular 12, Status bold 12.
    $taskTitleFont = New-Object System.Drawing.Font($termFont, 12)
    $taskBodyFont = New-Object System.Drawing.Font($termFont, 12)
    $taskStatusFont = New-Object System.Drawing.Font($termFont, 12, [System.Drawing.FontStyle]::Bold)

    $refreshTasks = {
        if (-not (Get-Command Get-HudDisplayTasks -ErrorAction SilentlyContinue)) {
            $taskBox.Text = "Task HUD script not found:`n$script:TaskHudScript"
            return
        }
        # Every open task, in priority order - the user wants the whole list, not a top 5.
        $display = Get-HudDisplayTasks -Path $tasksPath -Count ([int]::MaxValue)
        # Only redraw when something changed, so a selection survives refreshes.
        $sig = (@($display.Top | ForEach-Object { '{0}|{1}|{2}|{3}' -f $_.Text, $_.Due, $_.Status, ($_.Description -join '/') }) -join "`n") + "|$($display.Remaining)"
        if ($sig -eq $taskState.Signature) { return }
        $taskState.Signature = $sig

        $addRun = {
            param([string]$Text, $Color, $Font)
            $taskBox.SelectionStart = $taskBox.TextLength
            $taskBox.SelectionLength = 0
            $taskBox.SelectionColor = $Color
            $taskBox.SelectionFont = $Font
            $taskBox.AppendText($Text)
        }

        $taskBox.Clear()
        if ($display.Top.Count -eq 0) {
            & $addRun 'No open tasks' $noteColor $taskBodyFont
        } else {
            $first = $true
            foreach ($task in $display.Top) {
                if (-not $first) { & $addRun "`n`n" $titleColor $taskBodyFont }
                $first = $false
                $title = $task.Text
                if ($title.Length -gt 0) { $title = $title.Substring(0, 1).ToUpper() + $title.Substring(1) }
                # The marker gets its own run: RichTextBox swaps the whole run to
                # a fallback serif font when it meets a glyph the font lacks.
                & $addRun '▸ ' $titleColor $taskBodyFont
                & $addRun $title $titleColor $taskTitleFont
                foreach ($desc in $task.Description) {
                    & $addRun "`n    " $descColor $taskBodyFont
                    & $addRun '▸ ' $descColor $taskBodyFont
                    & $addRun $desc $descColor $taskBodyFont
                }
                $due = if ($task.Due) { $task.Due } else { 'no due' }
                & $addRun ("`n>> " + ('{0,-12}' -f $due)) $noteColor $taskBodyFont
                if ($task.Status) {
                    & $addRun $task.Status (Get-HudStatusColor -Status $task.Status) $taskStatusFont
                }
            }
        }
        $taskBox.SelectionStart = 0
        $taskNote.Text = if ($display.Remaining -gt 0) { "+$($display.Remaining) more in tasks.md" } else { '' }
    }

    $taskTimer = New-Object System.Windows.Forms.Timer
    $taskTimer.Interval = 30000
    $taskTimer.Add_Tick($refreshTasks)

    # --- sessions column (right) ----------------------------------------------
    $sessionsPanel = New-Object System.Windows.Forms.Panel
    $sessionsPanel.Dock = 'Fill'
    $sessionsPanel.BackColor = $bgColor
    $sessionsPanel.Controls.Add($inner)
    $sessionsPanel.Controls.Add($usagePanel)

    # Docking resolves from the last-added control: title bar and scanline span
    # the full width, then the task column takes the left, the rest is sessions.
    $form.Controls.Add($sessionsPanel)
    $form.Controls.Add($taskDivider)
    $form.Controls.Add($taskPanel)
    $form.Controls.Add($scanline)
    $form.Controls.Add($titleBar)
    $form.Controls.Add($grip)
    $grip.BringToFront()
    $grip.Location = New-Object System.Drawing.Point(($form.ClientSize.Width - 16), ($form.ClientSize.Height - 16))

    $sessionTimer = New-Object System.Windows.Forms.Timer
    $sessionTimer.Interval = $SessionIntervalMs
    $sessionTimer.Add_Tick($refreshGrid)

    $usageTimer = New-Object System.Windows.Forms.Timer
    $usageTimer.Interval = $UsageIntervalMs
    $usageTimer.Add_Tick($refreshUsage)

    # One sample per second drives the 60-second sparklines.
    $activityTimer = New-Object System.Windows.Forms.Timer
    $activityTimer.Interval = 1000
    $activityTimer.Add_Tick({
        Update-ActivitySamples -Sessions (Get-ActiveSessions)
        $grid.Invalidate()
    })

    $form.Add_Shown({
        & $refreshGrid
        & $refreshUsage
        & $refreshGrid
        $sessionTimer.Start()
        $usageTimer.Start()
        $activityTimer.Start()
        & $refreshTasks
        $taskTimer.Start()
    })
    $form.Add_FormClosed({
        $sessionTimer.Stop(); $sessionTimer.Dispose()
        $usageTimer.Stop(); $usageTimer.Dispose()
        $activityTimer.Stop(); $activityTimer.Dispose()
        $taskTimer.Stop(); $taskTimer.Dispose()
    })

    $form.ShowDialog() | Out-Null
    $form.Dispose()
}

function Close-ExistingSessionHud {
    $existing = Get-Process -Name powershell -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowTitle -eq 'Agent Mission Control' }
    if (-not $existing) { return }
    $existing | ForEach-Object { $_.CloseMainWindow() | Out-Null }
    Start-Sleep -Milliseconds 300
    Get-Process -Name powershell -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowTitle -eq 'Agent Mission Control' } |
        Stop-Process -Force -ErrorAction SilentlyContinue
}

if ($MyInvocation.InvocationName -ne '.') {
    Hide-ConsoleWindow
    Close-ExistingSessionHud
    Show-SessionHudForm -ScriptDir $PSScriptRoot
}
