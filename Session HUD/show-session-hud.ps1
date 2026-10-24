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

# --- task edits made from the HUD ------------------------------------------
# A task's due date lives in tasks.md ([due:...]) and its status in
# TaskDatabase.xlsx (Status column, matched on Items = the task title): the same
# places the Task HUD script reads them from. Finishing goes through tasks.md -
# tick the task and let sync-sheet.ps1 set Finished - exactly as a chat edit does.
function Get-TaskLineTitle {
    param([string]$Body)
    # Same stripping as Get-UncheckedTasks, so this matches the title the HUD shows.
    return ($Body -replace '\(added:\S+\)', '' -replace '\[due:\S+\]', '' -replace '\[priority:\S+\]', '').Trim()
}

function Edit-TaskLine {
    param([string]$Path, [string]$Title, [scriptblock]$Change)
    $raw = [System.IO.File]::ReadAllText($Path)
    $bom = ((Get-Content -Path $Path -Encoding Byte -TotalCount 3) -join ',') -eq '239,187,191'
    $lines = [regex]::Split($raw, '(?<=\n)')
    $found = $false
    for ($i = 0; $i -lt $lines.Count -and -not $found; $i++) {
        $body = $lines[$i] -replace '\r?\n$', ''
        if ($body -match '^- \[ \] (.+)$' -and (Get-TaskLineTitle $matches[1]) -eq $Title) {
            $lines[$i] = (& $Change $body) + $lines[$i].Substring($body.Length)
            $found = $true
        }
    }
    if (-not $found) { throw 'task not found in tasks.md' }
    [System.IO.File]::WriteAllText($Path, ($lines -join ''), (New-Object System.Text.UTF8Encoding($bom)))
}

function Set-TaskDue {
    param([string]$Path, [string]$Title, [string]$Due)
    Edit-TaskLine -Path $Path -Title $Title -Change {
        param($b)
        if ($b -match '\[due:\S+\]') { $b -replace '\[due:\S+\]', "[due:$Due]" } else { "$b [due:$Due]" }
    }.GetNewClosure()
}

function Set-TaskChecked {
    param([string]$Path, [string]$Title)
    Edit-TaskLine -Path $Path -Title $Title -Change { param($b) $b -replace '^- \[ \]', '- [x]' }
}

function Start-TaskSync {
    param([string]$SyncScript, [switch]$Wait)
    $p = Start-Process conhost.exe -ArgumentList 'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$SyncScript`"" -PassThru
    if ($Wait) { $p.WaitForExit() }
}

function Set-TaskStatus {
    param([string]$XlsxPath, [string]$Title, [string]$Status, [string]$SyncScript)
    Import-Module ImportExcel -ErrorAction Stop
    $write = {
        $pkg = Open-ExcelPackage -Path $XlsxPath
        try {
            $ws = $pkg.Workbook.Worksheets[1]
            $cols = @{}
            for ($c = 1; $c -le $ws.Dimension.End.Column; $c++) { $cols[[string]$ws.Cells[1, $c].Text] = $c }
            $hits = 0
            for ($r = 2; $r -le $ws.Dimension.End.Row; $r++) {
                if ($ws.Cells[$r, $cols['Items']].Text -eq $Title) { $ws.Cells[$r, $cols['Status']].Value = $Status; $hits++ }
            }
            return $hits
        } finally { Close-ExcelPackage $pkg }
    }
    if ((& $write) -eq 0) {
        # A fresh task is not in the sheet until sync-sheet.ps1 has run: run it, then write.
        Start-TaskSync -SyncScript $SyncScript -Wait
        if ((& $write) -eq 0) { throw 'task not found in TaskDatabase.xlsx' }
    }
}

# --- account-wide usage --------------------------------------------------------
# The percentages the Claude app and /usage show come from Anthropic's OAuth usage
# endpoint and cover the whole account - every machine sharing the login - which
# the local transcript scan cannot see. The HUD uses the access token Claude Code
# keeps in .credentials.json; it is never shown and goes nowhere but that endpoint.
function Get-AccountUsage {
    $credFile = Join-Path $env:USERPROFILE '.claude\.credentials.json'
    if (-not (Test-Path $credFile)) { throw 'no .credentials.json' }
    $token = (Get-Content $credFile -Raw | ConvertFrom-Json).claudeAiOauth.accessToken
    if (-not $token) { throw 'no OAuth token in .credentials.json' }
    $headers = @{ Authorization = "Bearer $token"; 'anthropic-beta' = 'oauth-2025-04-20'; Accept = 'application/json' }
    $r = Invoke-RestMethod -Uri 'https://api.anthropic.com/api/oauth/usage' -Headers $headers -TimeoutSec 10
    return [PSCustomObject]@{
        FiveHour      = [double]$r.five_hour.utilization
        FiveHourReset = [datetime]::Parse($r.five_hour.resets_at)
        Week          = [double]$r.seven_day.utilization
        WeekReset     = [datetime]::Parse($r.seven_day.resets_at)
    }
}

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
    # Hours only, one decimal, no other unit: "25.1 hrs".
    return ('{0:0.0} hrs' -f ((Get-Date) - $Started).TotalHours)
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
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes   # to pick a Windows Terminal tab

    if (-not ([System.Management.Automation.PSTypeName]'SessionHudNative').Type) {
        Add-Type -Namespace SessionHudNative -Name Win32 -MemberDefinition @'
            [System.Runtime.InteropServices.DllImport("user32.dll")]
            public static extern bool ReleaseCapture();
            [System.Runtime.InteropServices.DllImport("user32.dll")]
            public static extern int SendMessage(System.IntPtr hWnd, int Msg, int wParam, int lParam);
            [System.Runtime.InteropServices.DllImport("user32.dll")]
            public static extern bool SetProcessDpiAwarenessContext(System.IntPtr context);
            [System.Runtime.InteropServices.DllImport("user32.dll")]
            public static extern bool SetForegroundWindow(System.IntPtr hWnd);
            [System.Runtime.InteropServices.DllImport("user32.dll")]
            public static extern System.IntPtr GetForegroundWindow();
            [System.Runtime.InteropServices.DllImport("user32.dll")]
            public static extern bool IsIconic(System.IntPtr hWnd);
            [System.Runtime.InteropServices.DllImport("user32.dll")]
            public static extern bool ShowWindow(System.IntPtr hWnd, int cmd);
            [System.Runtime.InteropServices.DllImport("user32.dll")]
            public static extern void keybd_event(byte vk, byte scan, int flags, int extra);
            [System.Runtime.InteropServices.DllImport("user32.dll")]
            public static extern uint SendInput(uint count, INPUT[] inputs, int size);
            [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
            public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public System.IntPtr dwExtraInfo; }
            [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
            public struct INPUT { public uint type; public KEYBDINPUT ki; public long pad; }
            public static INPUT Key(ushort vk, ushort scan, uint flags) {
                INPUT i = new INPUT(); i.type = 1; i.ki.wVk = vk; i.ki.wScan = scan; i.ki.dwFlags = flags; return i;
            }
            public static int InputSize() { return System.Runtime.InteropServices.Marshal.SizeOf(typeof(INPUT)); }
'@
    }
    # Per-monitor DPI aware (V2), before any window exists. Otherwise, on a monitor
    # with a different scale, Windows bitmap-stretches the window and, seeing
    # WS_THICKFRAME, reserves a frame it paints itself: a light band on the top
    # and left, content clipped at the bottom and right.
    [SessionHudNative.Win32]::SetProcessDpiAwarenessContext([System.IntPtr](-4)) | Out-Null
    if (-not ([System.Management.Automation.PSTypeName]'SessionHudNative.SnapForm').Type) {
        # Borderless form that Windows still treats as a normal sizable window, so
        # Aero Snap works (drag to a screen edge, Win+Arrow). WS_THICKFRAME gives
        # it that status; the frame Windows would then draw is taken away again in
        # WM_NCCALCSIZE, and WM_GETMINMAXINFO keeps Maximized on the work area.
        Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition @'
            using System;
            using System.Runtime.InteropServices;
            using System.Windows.Forms;

            namespace SessionHudNative {
                public class SnapForm : Form {
                    const int WS_THICKFRAME = 0x00040000, WS_MINIMIZEBOX = 0x00020000, WS_MAXIMIZEBOX = 0x00010000;
                    const int SIZABLE = WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX;
                    const int WM_NCCALCSIZE = 0x0083, WM_NCPAINT = 0x0085, WM_NCACTIVATE = 0x0086;
                    const int WM_GETMINMAXINFO = 0x0024, WM_STYLECHANGING = 0x007C;

                    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
                    [StructLayout(LayoutKind.Sequential)] struct MINMAXINFO {
                        public POINT ptReserved, ptMaxSize, ptMaxPosition, ptMinTrackSize, ptMaxTrackSize;
                    }

                    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int attr, ref int value, int size);
                    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
                    [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h, int i, int v);
                    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int hh, uint f);

                    protected override void OnHandleCreated(EventArgs e) {
                        base.OnHandleCreated(e);
                        // The sizable styles go on after creation, not through CreateParams:
                        // WinForms sizes the window from CreateParams, and with a frame style
                        // there it adds a frame the client never gets, so every restore from
                        // Maximized grew the window by 14 px.
                        SetWindowLong(Handle, -16, GetWindowLong(Handle, -16) | SIZABLE);
                        SetWindowPos(Handle, IntPtr.Zero, 0, 0, 0, 0, 0x0027);   // FRAMECHANGED|NOMOVE|NOSIZE|NOZORDER
                        // Windows 11 gives a framed window rounded corners and a 1-px border: off.
                        int square = 1;                                     // DWMWCP_DONOTROUND
                        DwmSetWindowAttribute(Handle, 33, ref square, 4);   // DWMWA_WINDOW_CORNER_PREFERENCE
                        int none = unchecked((int)0xFFFFFFFE);              // DWMWA_COLOR_NONE
                        DwmSetWindowAttribute(Handle, 34, ref none, 4);     // DWMWA_BORDER_COLOR
                    }

                    protected override void WndProc(ref Message m) {
                        // WinForms rewrites the style from CreateParams on UpdateStyles: keep ours.
                        if (m.Msg == WM_STYLECHANGING && (int)m.WParam.ToInt64() == -16) {
                            Marshal.WriteInt32(m.LParam, 4, Marshal.ReadInt32(m.LParam, 4) | SIZABLE);
                        }
                        if (m.Msg == WM_NCCALCSIZE) { m.Result = IntPtr.Zero; return; }   // client area = whole window
                        // DefWindowProc still paints the frame of a WS_THICKFRAME window on
                        // (de)activation, straight over the client's outer 7 px: never let it.
                        if (m.Msg == WM_NCPAINT) { m.Result = IntPtr.Zero; return; }
                        if (m.Msg == WM_NCACTIVATE) { m.LParam = (IntPtr)(-1); }           // -1: no frame redraw
                        base.WndProc(ref m);
                        if (m.Msg == WM_GETMINMAXINFO) {
                            Screen s = Screen.FromHandle(m.HWnd);
                            MINMAXINFO mmi = (MINMAXINFO)Marshal.PtrToStructure(m.LParam, typeof(MINMAXINFO));
                            mmi.ptMaxPosition.X = s.WorkingArea.Left - s.Bounds.Left;
                            mmi.ptMaxPosition.Y = s.WorkingArea.Top - s.Bounds.Top;
                            mmi.ptMaxSize.X = s.WorkingArea.Width;
                            mmi.ptMaxSize.Y = s.WorkingArea.Height;
                            Marshal.StructureToPtr(mmi, m.LParam, false);
                        }
                    }
                }
            }
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

    $form = New-Object SessionHudNative.SnapForm
    $form.Text = 'Agent Mission Control'
    $form.ShowInTaskbar = $true
    $form.StartPosition = 'CenterScreen'
    # 1099 for the sessions side plus the 362-px task column on the left; 805 high
    # keeps the session list as tall as before the header and input rows came.
    $form.Size = New-Object System.Drawing.Size(1461, 805)
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

    # Maximized fills the work area (SnapForm keeps the taskbar visible) - that is the fullscreen.
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
    $usageState = [PSCustomObject]@{ Snapshot = $null; FetchedAt = $null; Failed = $false; Week = $null; WeekAt = $null
                                     Account = $null; AccountAt = $null; AccountError = $null }

    $usagePanel = New-Object System.Windows.Forms.Panel
    $usagePanel.Dock = 'Top'
    $hasCap = ($config -and $config.costCap5h -and [double]$config.costCap5h -gt 0)
    # The pie sits beside the text, so the cap does not add a row.
    $usagePanel.Height = 140
    $usagePanel.BackColor = $bgColor

    # Overview type a step above the grid's 12: the headline must clear the pies.
    $usageFont      = New-Object System.Drawing.Font($termFont, 13)
    $usageBigFont   = New-Object System.Drawing.Font($termFont, 20, [System.Drawing.FontStyle]::Bold)
    $usageLabelFont = New-Object System.Drawing.Font($termFont, 12, [System.Drawing.FontStyle]::Bold)

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
            # Reset time from the account when it is known: the block the account is
            # in is what counts, not the one this machine's transcripts suggest.
            $acct = $usageState.Account
            if ($acct) {
                $left = Format-Remaining ([Math]::Max(0, [int]($acct.FiveHourReset - (Get-Date)).TotalSeconds))
                $headline += ' · resets {0:HH:mm} · {1} left' -f $acct.FiveHourReset, $left
            } elseif ($snap.blockEnd) {
                $to = [datetime]::Parse($snap.blockEnd)
                $left = Format-Remaining ([int]$snap.blockSecondsLeft)
                $headline += ' · resets {0:HH:mm} · {1} left' -f $to, $left
            } else {
                $headline += ' · no block running'
            }
            $g.DrawString($headline, $usageFont, $brushLabel, ($x + 300), ($y + 8))

            $y += 38
            if ($acct -or $hasCap) {
                # Two pies side by side, upper right: 5-hour block, then week.
                # Caption above, percentage below, both in text colour. The
                # account's own percentages when they could be fetched; otherwise
                # this machine's spend against the caps in hud-config.json.
                $pies = if ($acct) {
                    @(
                        [PSCustomObject]@{ Caption = '5H';   Frac = $acct.FiveHour / 100 }
                        [PSCustomObject]@{ Caption = 'WEEK'; Frac = $acct.Week / 100 }
                    )
                } else {
                    $used5h = if ($null -ne $snap.blockCost) { [double]$snap.blockCost } else { $winTotal }
                    $usedWk = if ($usageState.Week) { $(if ($null -ne $usageState.Week.cost) { [double]$usageState.Week.cost } else { [double]$usageState.Week.total }) } else { 0 }
                    @(
                        [PSCustomObject]@{ Caption = '5H';   Frac = $(if ([double]$config.costCap5h -gt 0) { $used5h / [double]$config.costCap5h } else { -1 }) }
                        [PSCustomObject]@{ Caption = 'WEEK'; Frac = $(if ([double]$config.costCapWeek -gt 0) { $usedWk / [double]$config.costCapWeek } else { -1 }) }
                    )
                }
                $pieD = 64
                $pieGap = 34
                $pieY = 30
                $pieFlags = [System.Windows.Forms.TextFormatFlags]::HorizontalCenter -bor [System.Windows.Forms.TextFormatFlags]::VerticalCenter
                $oldMode = $g.SmoothingMode
                for ($k = 0; $k -lt $pies.Count; $k++) {
                    $pie = $pies[$k]
                    if ($pie.Frac -lt 0) { continue }
                    $frac = [Math]::Min(1.0, [double]$pie.Frac)
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

            $y += 30
            $g.DrawString('TODAY/WEEK', $usageLabelFont, $brushAccent, $x, $y)
            $weekTotal = if ($usageState.Week) { Format-TokenCount ([double]$usageState.Week.total) } else { '...' }
            $g.DrawString(('{0} tokens / {1} tokens' -f (Format-TokenCount ([double]$snap.today.total)), $weekTotal), `
                $usageFont, $brushValue, $valueX, ($y - 2))

            $y += 28
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

    # Double-click a session: the chat box at the bottom talks to it from then on.
    # The row's Tag holds its paragraphs; the first one is the session name.
    $grid.Add_CellDoubleClick({
        param($sender, $e)
        if ($e.RowIndex -lt 0) { return }
        $name = $grid.Rows[$e.RowIndex].Tag[0].Text
        if (-not $name) { return }
        $sessionTarget.Name = $name
        $sessionInput.Caption.Text = "to $name"
        $sessionInput.Status.Text = ''
        $sessionInput.Box.Focus()
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
            $acctNote = if ($usageState.Account) { ' · account {0:HH:mm:ss}' -f $usageState.AccountAt }
                        elseif ($usageState.AccountError) { ' · account: ' + $usageState.AccountError }
                        else { '' }
            $noteLabel.Text = ('{0} active · sessions {1} · usage {2:HH:mm:ss}' -f $count, $stamp, $usageState.FetchedAt) + $acctNote
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

        # Account-wide limits once a minute; a failed fetch keeps the last reading.
        if (-not $usageState.AccountAt -or ((Get-Date) - $usageState.AccountAt).TotalSeconds -ge 60) {
            try { $usageState.Account = Get-AccountUsage; $usageState.AccountError = $null }
            catch { $usageState.AccountError = $_.Exception.Message }
            $usageState.AccountAt = Get-Date
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
    # --- typing into a Claude Code tab -------------------------------------------
    # Claude Code's TUI only takes real keyboard input (console input written
    # into its buffer never reaches it), so: bring the Windows Terminal window to
    # the front, select the tab through UI Automation, send the text and Enter as
    # keystrokes, then take the focus back. Returns $null, or what went wrong.
    $sendToTab = {
        param([string]$TabName, [string]$Text)
        $A = [System.Windows.Automation.AutomationElement]
        $tabCond = New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)
        $tab = $null; $win = $null; $hwnd = [IntPtr]::Zero
        foreach ($wt in @(Get-Process WindowsTerminal -ErrorAction SilentlyContinue)) {
            $winCond = New-Object System.Windows.Automation.PropertyCondition($A::ProcessIdProperty, $wt.Id)
            foreach ($w in $A::RootElement.FindAll('Children', $winCond)) {
                foreach ($t in $w.FindAll('Descendants', $tabCond)) {
                    # Claude Code prefixes the title with a status glyph, e.g. "✳ KOYO".
                    if (($t.Current.Name -replace '^\W+', '') -eq $TabName) { $tab = $t; $win = $w; $hwnd = [IntPtr]$w.Current.NativeWindowHandle }
                }
            }
        }
        if (-not $tab) { return "no '$TabName' tab open" }
        if ([SessionHudNative.Win32]::IsIconic($hwnd)) { [SessionHudNative.Win32]::ShowWindow($hwnd, 9) | Out-Null }
        [SessionHudNative.Win32]::SetForegroundWindow($hwnd) | Out-Null
        $tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
        Start-Sleep -Milliseconds 300
        # Selecting a tab that is already selected moves no focus, so focus the
        # terminal pane itself. Only the selected tab's pane is on screen; its
        # name is whatever title the shell last set, so it cannot be matched.
        $paneCond = New-Object System.Windows.Automation.PropertyCondition($A::ClassNameProperty, 'TermControl')
        $pane = $win.FindAll('Descendants', $paneCond) | Where-Object { -not $_.Current.IsOffscreen } | Select-Object -First 1
        if (-not $pane) { return 'terminal pane not found' }
        $pane.SetFocus(); Start-Sleep -Milliseconds 200
        if ([SessionHudNative.Win32]::GetForegroundWindow() -ne $hwnd) { return 'could not focus the terminal' }
        # Enter goes on its own, with its hardware scan code (0x1C): without the
        # scan code the terminal takes it as a newline inside the prompt, not a
        # submit. A newline inside the text is typed the way Claude Code documents
        # it for any terminal: a backslash, then Enter.
        $enter = @([SessionHudNative.Win32]::Key(13, 0x1C, 0), [SessionHudNative.Win32]::Key(13, 0x1C, 2))
        $lines = $Text -split "`r?`n"
        for ($n = 0; $n -lt $lines.Count; $n++) {
            $chunk = if ($n -lt $lines.Count - 1) { $lines[$n] + '\' } else { $lines[$n] }
            $keys = New-Object System.Collections.Generic.List[SessionHudNative.Win32+INPUT]
            foreach ($c in $chunk.ToCharArray()) {
                $keys.Add([SessionHudNative.Win32]::Key(0, [int]$c, 0x0004))   # KEYEVENTF_UNICODE
                $keys.Add([SessionHudNative.Win32]::Key(0, [int]$c, 0x0006))   # ... | KEYEVENTF_KEYUP
            }
            if ($keys.Count) { [SessionHudNative.Win32]::SendInput($keys.Count, $keys.ToArray(), [SessionHudNative.Win32]::InputSize()) | Out-Null }
            Start-Sleep -Milliseconds 300
            [SessionHudNative.Win32]::SendInput(2, $enter, [SessionHudNative.Win32]::InputSize()) | Out-Null
            Start-Sleep -Milliseconds 150
        }
        Start-Sleep -Milliseconds 100
        # A fake Alt tap lifts the foreground lock so the HUD can take focus back.
        [SessionHudNative.Win32]::keybd_event(0x12, 0, 0, 0); [SessionHudNative.Win32]::keybd_event(0x12, 0, 2, 0)
        $form.Activate()
        return $null
    }

    # Input block at the bottom of a column: a caption line (caption left, result
    # right) over a full-width two-line box. Enter sends, Shift+Enter is a newline;
    # the caller wires Enter to $sendToTab.
    $newInputRow = {
        param([string]$Caption)
        $row = New-Object System.Windows.Forms.Panel
        $row.Dock = 'Bottom'
        $row.Height = 80
        $row.BackColor = $barColor
        $row.Padding = New-Object System.Windows.Forms.Padding(8, 4, 8, 6)
        $head = New-Object System.Windows.Forms.Panel
        $head.Dock = 'Top'
        $head.Height = 20
        $head.BackColor = $barColor
        $cap = New-Object System.Windows.Forms.Label
        $cap.Text = $Caption
        $cap.AutoSize = $true
        $cap.Dock = 'Left'
        $cap.ForeColor = $accentColor
        $cap.BackColor = $barColor
        $cap.Font = New-Object System.Drawing.Font($termFont, 9, [System.Drawing.FontStyle]::Bold)
        $cap.TextAlign = 'MiddleLeft'
        $status = New-Object System.Windows.Forms.Label
        $status.Dock = 'Fill'
        $status.ForeColor = $noteColor
        $status.BackColor = $barColor
        $status.Font = New-Object System.Drawing.Font($termFont, 9, [System.Drawing.FontStyle]::Italic)
        $status.TextAlign = 'MiddleRight'
        $head.Controls.Add($status)
        $head.Controls.Add($cap)
        $box = New-Object System.Windows.Forms.TextBox
        $box.Dock = 'Fill'
        $box.Multiline = $true   # no scrollbar: the box follows the caret as you type
        $box.BorderStyle = 'FixedSingle'
        $box.BackColor = $bgColor
        $box.ForeColor = $titleColor
        $box.Font = New-Object System.Drawing.Font($termFont, 12)
        $row.Controls.Add($box)
        $row.Controls.Add($head)
        # Up on the first line / Down on the last line walk the lines sent from
        # this box, like a shell history; the caller appends to History on send.
        $hist = New-Object System.Collections.Generic.List[string]
        $state = [PSCustomObject]@{ Index = 0 }   # Index = History.Count means "a new line"
        $box.Add_KeyDown({
            param($sender, $e)
            $line = $sender.GetLineFromCharIndex($sender.SelectionStart)
            if ($e.KeyCode -eq [System.Windows.Forms.Keys]::Up -and $line -eq 0) {
                if ($state.Index -gt 0) { $state.Index--; $sender.Text = $hist[$state.Index]; $sender.SelectionStart = $sender.TextLength }
                $e.SuppressKeyPress = $true
            } elseif ($e.KeyCode -eq [System.Windows.Forms.Keys]::Down -and $line -ge $sender.GetLineFromCharIndex($sender.TextLength)) {
                if ($state.Index -lt $hist.Count) {
                    $state.Index++
                    $sender.Text = if ($state.Index -lt $hist.Count) { $hist[$state.Index] } else { '' }
                    $sender.SelectionStart = $sender.TextLength
                }
                $e.SuppressKeyPress = $true
            }
        }.GetNewClosure())
        return [PSCustomObject]@{ Row = $row; Box = $box; Status = $status; Caption = $cap; History = $hist; State = $state }
    }

    $taskDir    = Join-Path (Split-Path $ScriptDir -Parent) 'Task Manager'
    $xlsxPath   = Join-Path $taskDir 'TaskDatabase.xlsx'
    $syncScript = Join-Path $taskDir 'sync-sheet.ps1'

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

    # Enter here types the line into the Task Reminder tab.
    $taskInput = & $newInputRow 'to Task Reminder'
    $taskInput.Box.Add_KeyDown({
        param($sender, $e)
        if ($e.KeyCode -ne [System.Windows.Forms.Keys]::Enter -or $e.Shift) { return }   # Shift+Enter: newline
        $e.SuppressKeyPress = $true
        $text = $sender.Text.Trim()
        if (-not $text) { return }
        $taskInput.Status.Text = 'sending...'; $taskInput.Status.Refresh()
        $err = & $sendToTab 'Task Reminder' $text
        if ($err) { $taskInput.Status.Text = $err } else {
            $taskInput.History.Add($text); $taskInput.State.Index = $taskInput.History.Count
            $sender.Clear(); $taskInput.Status.Text = 'sent ' + (Get-Date -Format 'HH:mm:ss')
        }
    })

    # Docking resolves from the last-added control: header on top, the input
    # row at the very bottom, the note above it, the list fills the rest.
    $taskPanel.Controls.Add($taskBoxPad)
    $taskPanel.Controls.Add($taskNote)
    $taskPanel.Controls.Add($taskInput.Row)
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
    $taskHits = New-Object System.Collections.Generic.List[object]   # clickable due / status spans

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
        $taskHits.Clear()
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
                # Due and status are clickable: their spans are remembered for the click handler.
                $due = if ($task.Due) { $task.Due } else { 'no due' }
                & $addRun "`n>> " $noteColor $taskBodyFont
                $start = $taskBox.TextLength
                & $addRun ('{0,-12}' -f $due) $noteColor $taskBodyFont
                $taskHits.Add([PSCustomObject]@{ Start = $start; Length = $due.Length; Kind = 'due'; Task = $task })
                $start = $taskBox.TextLength
                if ($task.Status) {
                    & $addRun $task.Status (Get-HudStatusColor -Status $task.Status) $taskStatusFont
                    $statusLen = $task.Status.Length
                } else {
                    & $addRun '-' $noteColor $taskStatusFont   # not in TaskDatabase.xlsx yet
                    $statusLen = 1
                }
                $taskHits.Add([PSCustomObject]@{ Start = $start; Length = $statusLen; Kind = 'status'; Task = $task })
            }
        }
        $taskBox.SelectionStart = 0
        $taskNote.Text = if ($display.Remaining -gt 0) { "+$($display.Remaining) more in tasks.md" } else { '' }
    }

    $taskTimer = New-Object System.Windows.Forms.Timer
    $taskTimer.Interval = 30000
    $taskTimer.Add_Tick($refreshTasks)

    # Click on a due date: a small calendar; pick a day and tasks.md is updated and
    # synced. Click on a status: Pending / Ongoing / Checking / Finished.
    # The calendar sits in its own borderless window sized to the calendar: inside
    # a ToolStripDropDown the host resizes it and clicks land on the wrong day.
    $dueCalendar = New-Object System.Windows.Forms.MonthCalendar
    $dueCalendar.MaxSelectionCount = 1
    $dueCalendar.Location = New-Object System.Drawing.Point(0, 0)
    $duePopup = New-Object System.Windows.Forms.Form
    $duePopup.FormBorderStyle = 'None'
    $duePopup.ShowInTaskbar = $false
    $duePopup.StartPosition = 'Manual'
    $duePopup.TopMost = $true
    $duePopup.Controls.Add($dueCalendar)
    $duePopup.Add_Shown({ $duePopup.ClientSize = $dueCalendar.Size })
    $duePopup.Add_Deactivate({ $duePopup.Hide() })   # click anywhere else: gone
    $editTarget = [PSCustomObject]@{ Task = $null }
    $dueCalendar.Add_DateSelected({
        param($sender, $e)
        $duePopup.Hide()
        $task = $editTarget.Task
        if (-not $task) { return }
        $due = $e.Start.ToString('yyyy-MM-dd')
        try {
            Set-TaskDue -Path $tasksPath -Title $task.Text -Due $due
            Start-TaskSync -SyncScript $syncScript
            $taskNote.Text = "due set to $due"
        } catch { $taskNote.Text = "due not saved: $($_.Exception.Message)" }
        & $refreshTasks
    })

    $statusMenu = New-Object System.Windows.Forms.ContextMenuStrip
    foreach ($name in 'Pending', 'Ongoing', 'Checking', 'Finished') {
        $statusMenu.Items.Add($name).Add_Click({
            param($sender, $e)
            $task = $editTarget.Task
            $status = $sender.Text
            if (-not $task) { return }
            try {
                if ($status -eq 'Finished') {
                    # Ticked in tasks.md: gone from the list at once, Finished in the sheet after sync.
                    Set-TaskChecked -Path $tasksPath -Title $task.Text
                    Start-TaskSync -SyncScript $syncScript
                } else {
                    Set-TaskStatus -XlsxPath $xlsxPath -Title $task.Text -Status $status -SyncScript $syncScript
                }
                $taskNote.Text = "status set to $status"
            } catch { $taskNote.Text = "status not saved: $($_.Exception.Message)" }
            & $refreshTasks
        })
    }

    $taskBox.Add_MouseClick({
        param($sender, $e)
        # A drag leaves a selection: that is copying, not a click on a field.
        if ($e.Button -ne [System.Windows.Forms.MouseButtons]::Left -or $taskBox.SelectionLength -gt 0) { return }
        $idx = $taskBox.GetCharIndexFromPosition($e.Location)
        $hit = $taskHits | Where-Object { $idx -ge $_.Start -and $idx -lt ($_.Start + $_.Length) } | Select-Object -First 1
        if (-not $hit) { return }
        # GetCharIndexFromPosition snaps to the nearest character, so a click in the
        # blank below or beside the text still lands on one: the click has to be on
        # the span's own glyphs (DejaVu Sans Mono is about 0.6 em wide).
        $first = $taskBox.GetPositionFromCharIndex($hit.Start)
        $last  = $taskBox.GetPositionFromCharIndex($hit.Start + $hit.Length - 1)
        $lineH = $taskBodyFont.Height
        if ($e.Y -lt $first.Y -or $e.Y -gt $first.Y + $lineH -or $e.X -lt $first.X -or $e.X -gt $last.X + [int]($lineH * 0.6)) { return }
        $editTarget.Task = $hit.Task
        $at = $taskBox.PointToScreen($e.Location)
        if ($hit.Kind -eq 'due') {
            $d = [datetime]::MinValue
            $dueCalendar.SetDate($(if ($hit.Task.Due -and [datetime]::TryParseExact($hit.Task.Due, 'yyyy-MM-dd', $null, [System.Globalization.DateTimeStyles]::None, [ref]$d)) { $d } else { (Get-Date).Date }))
            $duePopup.Location = $at
            $duePopup.Show()
            $duePopup.ClientSize = $dueCalendar.Size
            $duePopup.Activate()
        } else {
            $statusMenu.Show($at)
        }
    })

    # --- sessions column (right) ----------------------------------------------
    $sessionsPanel = New-Object System.Windows.Forms.Panel
    $sessionsPanel.Dock = 'Fill'
    $sessionsPanel.BackColor = $bgColor

    # Same header as the task column.
    $sessionHeader = New-Object System.Windows.Forms.Label
    $sessionHeader.Text = 'Session Monitor'
    $sessionHeader.Dock = 'Top'
    $sessionHeader.Height = 30
    $sessionHeader.BackColor = $barColor
    $sessionHeader.ForeColor = $accentColor
    $sessionHeader.Font = New-Object System.Drawing.Font($termFont, 12, [System.Drawing.FontStyle]::Bold)
    $sessionHeader.TextAlign = 'MiddleLeft'
    $sessionHeader.Padding = New-Object System.Windows.Forms.Padding(8, 0, 0, 0)

    # Enter here types the line into the chosen session's tab: Sessions Manager
    # until a session in the list is double-clicked.
    $sessionTarget = [PSCustomObject]@{ Name = 'Sessions Manager' }
    $sessionInput = & $newInputRow 'to Sessions Manager'
    $sessionInput.Box.Add_KeyDown({
        param($sender, $e)
        if ($e.KeyCode -ne [System.Windows.Forms.Keys]::Enter -or $e.Shift) { return }   # Shift+Enter: newline
        $e.SuppressKeyPress = $true
        $text = $sender.Text.Trim()
        if (-not $text) { return }
        $sessionInput.Status.Text = 'sending...'; $sessionInput.Status.Refresh()
        $err = & $sendToTab $sessionTarget.Name $text
        if ($err) { $sessionInput.Status.Text = $err } else {
            $sessionInput.History.Add($text); $sessionInput.State.Index = $sessionInput.History.Count
            $sender.Clear(); $sessionInput.Status.Text = 'sent ' + (Get-Date -Format 'HH:mm:ss')
        }
    })

    $sessionsPanel.Controls.Add($inner)
    $sessionsPanel.Controls.Add($usagePanel)
    $sessionsPanel.Controls.Add($sessionInput.Row)
    $sessionsPanel.Controls.Add($sessionHeader)

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
