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
$config   = Get-Content (Join-Path $root 'agents.json') -Raw -Encoding UTF8 | ConvertFrom-Json

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

$hud = Join-Path $root 'Session HUD\show-session-hud.ps1'
if ($DryRun) {
    "conhost.exe powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$hud`""
} else {
    # Through conhost.exe: started directly, Windows 11 hands the console to
    # Windows Terminal and an empty "powershell" window appears next to the HUD.
    Start-Process conhost.exe -ArgumentList 'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$hud`""
}
