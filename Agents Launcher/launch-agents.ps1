<#
    Opens the Claude Code tabs listed in agents.json (in the package folder, one
    level up), grouped into Windows Terminal windows by their "window" number,
    then starts Agent Mission Control. agents.json is the one list both this
    launcher and Agent Mission Control read.

    -DryRun prints the Windows Terminal commands instead of running them.
#>
param([switch]$DryRun)

$root     = Split-Path $PSScriptRoot -Parent      # the package folder
$workDir  = Split-Path $root -Parent              # every tab starts here
$agentBat = Join-Path $PSScriptRoot 'agent.bat'
$hud      = Join-Path $root 'Session HUD\show-session-hud.ps1'
$config   = Get-Content (Join-Path $root 'agents.json') -Raw -Encoding UTF8 | ConvertFrom-Json

# A second click must not stack a second set of tabs and HUD on the first one,
# so the previous launch is closed first. Agent tabs are found by their tab
# titles through UI Automation and closed with their own close button: Windows
# Terminal keeps every window in one process, so there is nothing to kill
# without taking unrelated terminal windows down too.
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A         = [System.Windows.Automation.AutomationElement]
$names     = @($config.sessions | ForEach-Object { $_.name })
$tabCond   = New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)
$closeCond = New-Object System.Windows.Automation.PropertyCondition($A::AutomationIdProperty, 'CloseButton')
foreach ($wt in @(Get-Process WindowsTerminal -ErrorAction SilentlyContinue)) {
    $winCond = New-Object System.Windows.Automation.PropertyCondition($A::ProcessIdProperty, $wt.Id)
    foreach ($window in $A::RootElement.FindAll('Children', $winCond)) {
        foreach ($tab in $window.FindAll('Descendants', $tabCond)) {
            # Claude Code prefixes the title with a status glyph, e.g. "✳ KOYO".
            $title = $tab.Current.Name -replace '^\W+', ''
            if ($names -notcontains $title) { continue }
            if ($DryRun) { "close tab: $($tab.Current.Name)"; continue }
            $close = $tab.FindFirst('Descendants', $closeCond)
            if ($close) {
                $close.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
                Start-Sleep -Milliseconds 300
            }
        }
    }
}
foreach ($old in @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*show-session-hud.ps1*' })) {
    if ($DryRun) { "close HUD: pid $($old.ProcessId)"; continue }
    (Get-Process -Id $old.ProcessId -ErrorAction SilentlyContinue).CloseMainWindow() | Out-Null
}
if (-not $DryRun) { Start-Sleep -Seconds 1 }

$windows = @($config.sessions) | Group-Object { [int]$_.window } | Sort-Object { [int]$_.Name }
foreach ($window in $windows) {
    # "cmd /k call": this folder's path has spaces, and without "call" cmd strips
    # the outer quotes of the line, so the path breaks and the tab never starts.
    $tabs = foreach ($s in $window.Group) {
        'new-tab -d "{0}" --title "{1}" cmd /k call "{2}" {3} "{1}"' -f $workDir, $s.name, $agentBat, $s.id
    }
    $wtArgs = '-w -1 ' + ($tabs -join ' ; ')
    if ($DryRun) { "wt $wtArgs" } else { Start-Process wt -ArgumentList $wtArgs }
}

if ($DryRun) {
    "conhost.exe powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$hud`""
} else {
    # Through conhost.exe: started directly, Windows 11 hands the console to
    # Windows Terminal and an empty "powershell" window appears next to the HUD.
    Start-Process conhost.exe -ArgumentList 'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$hud`""
}
