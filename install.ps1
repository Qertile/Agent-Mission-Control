<#
    One-step setup for AI-Infra on this PC. Nothing is copied anywhere - the tools
    run from this folder. Setting up means four things:
      1. checking the programs the tools call (Windows Terminal, Claude Code,
         Python 3, the ImportExcel PowerShell module, the DejaVu Sans Mono font);
      2. making your own agents.json, hud-config.json, tasks.md and TaskDatabase.xlsx
         from their templates, if they are not there yet;
      3. putting the "Agents Launcher" shortcut on the desktop;
      4. registering the scheduled jobs you choose with Windows Task Scheduler.
    Run it again after moving the folder: the shortcut and jobs are re-pointed.

    -CheckOnly stops after step 1 and changes nothing.
#>
param([switch]$CheckOnly)

$root = $PSScriptRoot

function Ask([string]$Question, [bool]$Default) {
    $hint = if ($Default) { '[Y/n]' } else { '[y/N]' }
    $answer = Read-Host "$Question $hint"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
    return $answer -match '^(y|yes)$'
}

Write-Host "`n== 1. Checking what the tools need ==" -ForegroundColor Cyan
$missing = 0
function Report([string]$Name, [bool]$Ok, [string]$Fix) {
    if ($Ok) { Write-Host "  OK       $Name" }
    else { Write-Host "  MISSING  $Name - $Fix" -ForegroundColor Yellow; $script:missing++ }
}

Report 'Windows Terminal (wt)' ([bool](Get-Command wt -ErrorAction SilentlyContinue)) `
    'install "Windows Terminal" from the Microsoft Store.'
Report 'Claude Code (claude)' ([bool](Get-Command claude -ErrorAction SilentlyContinue)) `
    'install Claude Code and check that "claude" runs in a new terminal.'
# A missing Python still leaves a Microsoft Store stub named python on PATH, so
# ask it for a version instead of only looking the command up.
$pythonOk = $false
try { $pythonOk = ((& python --version 2>&1) -join ' ') -match '^Python 3' } catch {}
Report 'Python 3 (python)' $pythonOk 'install Python 3 from python.org and tick "Add python.exe to PATH".'

if (Get-Module -ListAvailable ImportExcel) {
    Report 'PowerShell module ImportExcel' $true ''
} elseif (-not $CheckOnly -and (Ask '  ImportExcel is missing. Install it now from the PowerShell Gallery?' $true)) {
    Install-Module ImportExcel -Scope CurrentUser -Force
    Report 'PowerShell module ImportExcel' ([bool](Get-Module -ListAvailable ImportExcel)) 'run: Install-Module ImportExcel -Scope CurrentUser'
} else {
    Report 'PowerShell module ImportExcel' $false 'run: Install-Module ImportExcel -Scope CurrentUser'
}

$fontKeys = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts', 'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
$fontOk = [bool]($fontKeys | Where-Object { Test-Path $_ } |
    ForEach-Object { (Get-ItemProperty $_).PSObject.Properties.Name } |
    Where-Object { $_ -like 'DejaVu Sans Mono*' })
Report 'Font DejaVu Sans Mono' $fontOk 'download it from https://dejavu-fonts.github.io/ and install the .ttf files.'

if ($CheckOnly) {
    Write-Host "`n$missing item(s) missing. -CheckOnly: nothing was changed."
    return
}

Write-Host "`n== 2. Your own files ==" -ForegroundColor Cyan
# Kept out of git (.gitignore), so a pull never overwrites them; an existing one is left alone.
function FromTemplate([string]$File, [string]$Template) {
    if (Test-Path (Join-Path $root $File)) { Write-Host "  Kept     $File"; return $false }
    Copy-Item (Join-Path $root $Template) (Join-Path $root $File)
    Write-Host "  Created  $File"
    return $true
}
if (FromTemplate 'agents.json' 'agents.template.json') {
    $agents = Join-Path $root 'agents.json'
    [IO.File]::WriteAllText($agents, ([IO.File]::ReadAllText($agents) -replace '__NEW_ID__', [guid]::NewGuid()))
}
FromTemplate 'Session HUD\hud-config.json' 'Session HUD\hud-config.template.json' | Out-Null
FromTemplate 'Task Manager\tasks.md' 'Task Manager\tasks.template.md' | Out-Null
FromTemplate 'Task Manager\TaskDatabase.xlsx' 'Task Manager\TaskDatabase.template.xlsx' | Out-Null

Write-Host "`n== 3. Desktop shortcut ==" -ForegroundColor Cyan
& (Join-Path $root 'Agents Launcher\create-shortcut.ps1')

Write-Host "`n== 4. Scheduled jobs ==" -ForegroundColor Cyan
if (Ask 'Register the daily review (weekdays 09:30), daily summary (weekdays 19:00) and weekly summary (Fridays 19:30)?' $true) {
    & (Join-Path $root 'Daily Summary\setup-schedule.ps1')
}
if (Ask 'Also register the standalone task popup on weekdays at 09:30? (Tasks already show in Agent Mission Control.)' $false) {
    & (Join-Path $root 'Task Manager\setup-schedule.ps1')
}

Write-Host "`nDone." -ForegroundColor Green
if ($missing -gt 0) { Write-Host "$missing item(s) above are still missing - fix them before using the tools." -ForegroundColor Yellow }
Write-Host 'Next: list your tabs in agents.json, then double-click "Agents Launcher" on the desktop.'
