<#
    Starts Agent Mission Control (the web version, Session HUD\amc_web.py): one
    window with the task list, the session monitor and a terminal tab per
    agents.json session. The window opens the sessions ticked "Open on start"
    itself, so there are no Windows Terminal tabs to open here.

    -DryRun prints what it would close and run instead of doing it.
#>
param([switch]$DryRun)

$root = Split-Path $PSScriptRoot -Parent      # the package folder
$web  = Join-Path $root 'Session HUD\amc_web.py'
$log  = Join-Path $root 'Session HUD\amc-web.log'

# A second click replaces the running window. It is closed the way its own close
# button does it, so it ends its agent tabs first; their conversations are kept
# and the new window resumes them.
foreach ($old in @(Get-CimInstance Win32_Process -Filter "Name='pythonw.exe' or Name='python.exe'" |
                   Where-Object { $_.CommandLine -like '*amc_web.py*' })) {
    if ($DryRun) { "close window: pid $($old.ProcessId)"; continue }
    $p = Get-Process -Id $old.ProcessId -ErrorAction SilentlyContinue
    if ($p) {
        $p.CloseMainWindow() | Out-Null
        $p.WaitForExit(10000) | Out-Null
    }
}

# pythonw: no console window next to Agent Mission Control. It has no console to
# print to either, so errors go to amc-web.log.
if ($DryRun) {
    "pythonw `"$web`"  (errors to $log)"
} else {
    Start-Process pythonw -ArgumentList "`"$web`"" -WorkingDirectory (Split-Path $web) -RedirectStandardError $log
}
