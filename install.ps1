<#
    One-step setup for Agent Mission Control on this PC. Nothing is copied anywhere - the tools
    run from this folder. Setting up means four things:
      1. checking the programs the tools call (Claude Code, Python 3 with
         pywebview, pywinpty and openpyxl, the ImportExcel PowerShell module, the
         DejaVu Sans Mono font), and offering to install each one that is missing,
         just for this Windows user (no admin needed);
      2. making your own agents.json, hud-config.json, tasks.md and TaskDatabase.xlsx
         from their templates, if they are not there yet;
      3. putting the "Agent Mission Control" shortcut on the desktop;
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
# Windows PowerShell 5.1 may not offer TLS 1.2 by default; the downloads below need it.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072
# What an installer just added to PATH, without opening a new terminal.
function RefreshPath {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Download([string]$Url) {
    $file = Join-Path $env:TEMP (Split-Path $Url -Leaf)
    Write-Host "  Downloading $Url"
    $ProgressPreference = 'SilentlyContinue'   # the progress bar makes it many times slower
    Invoke-WebRequest $Url -OutFile $file -UseBasicParsing
    return $file
}

# Claude Code: Anthropic's own installer, into %USERPROFILE%\.local\bin.
$claudeFix = 'run in PowerShell: irm https://claude.ai/install.ps1 | iex'
function ClaudeOk { [bool](Get-Command claude -ErrorAction SilentlyContinue) }
if (-not (ClaudeOk) -and -not $CheckOnly -and (Ask '  Claude Code is missing. Install it now?' $true)) {
    # In its own PowerShell, so an "exit" in that script does not end this one.
    powershell -NoProfile -ExecutionPolicy Bypass -Command 'irm https://claude.ai/install.ps1 | iex'
    $bin = Join-Path $env:USERPROFILE '.local\bin'
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if ((Test-Path (Join-Path $bin 'claude.exe')) -and ($userPath -split ';') -notcontains $bin) {
        [Environment]::SetEnvironmentVariable('Path', ($userPath.TrimEnd(';') + ";$bin"), 'User')
    }
    RefreshPath
}
# Optional: a PC can use only Codex or Antigravity tabs. At least one of the three is needed.
function Optional([string]$Name, [bool]$Ok, [string]$Fix) {
    if ($Ok) { Write-Host "  OK       $Name" } else { Write-Host "  OPTIONAL $Name - $Fix" -ForegroundColor DarkGray }
}
$claudeOk = ClaudeOk
Optional 'Claude Code (claude)' $claudeOk $claudeFix
Optional 'Codex CLI (codex)' ([bool](Get-Command codex -ErrorAction SilentlyContinue)) 'npm install -g @openai/codex'
Optional 'Antigravity CLI (agy)' ([bool](Get-Command agy -ErrorAction SilentlyContinue)) 'install Antigravity and check that "agy" runs in a new terminal.'
if (-not ($claudeOk -or (Get-Command codex -ErrorAction SilentlyContinue) -or (Get-Command agy -ErrorAction SilentlyContinue))) {
    Report 'An AI tool (claude, codex or agy)' $false 'install at least one of the three above.'
}

# A missing Python still leaves a Microsoft Store stub named python on PATH, so
# ask it for a version instead of only looking the command up.
function PythonOk { try { return ((& python --version 2>&1) -join ' ') -match '^Python 3' } catch { return $false } }
$pythonOk = PythonOk
if (-not $pythonOk -and -not $CheckOnly -and (Ask '  Python 3 is missing. Install Python 3.12 from python.org now (just for you, no admin)?' $true)) {
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'amd64' }
    try {
        $setup = Download "https://www.python.org/ftp/python/3.12.10/python-3.12.10-$arch.exe"
        # PrependPath puts it before the Store stub on PATH.
        Start-Process $setup -ArgumentList '/quiet InstallAllUsers=0 PrependPath=1 Include_launcher=0 Include_test=0' -Wait
    } catch { Write-Host "  $_" -ForegroundColor Yellow }
    RefreshPath
    $pythonOk = PythonOk
}
Report 'Python 3 (python)' $pythonOk 'install Python 3 from python.org and tick "Add python.exe to PATH".'

# Agent Mission Control's window (pywebview), its terminal tabs (pywinpty) and the
# task statuses (openpyxl). Python 3.7 also needs a newer typing_extensions than it
# ships with, or pywebview fails with "cannot import name 'Unpack'".
$pipCmd = 'python -m pip install -U pywebview pywinpty openpyxl typing_extensions'
function PyModulesOk { try { & python -c 'import webview, winpty, openpyxl' 2>$null; return $LASTEXITCODE -eq 0 } catch { return $false } }
if (-not $pythonOk) {
    Report 'Python modules pywebview, pywinpty, openpyxl' $false 'install Python 3 first.'
} elseif (PyModulesOk) {
    Report 'Python modules pywebview, pywinpty, openpyxl' $true ''
} elseif (-not $CheckOnly -and (Ask '  Python modules for Agent Mission Control are missing. Install them now with pip?' $true)) {
    Invoke-Expression $pipCmd
    Report 'Python modules pywebview, pywinpty, openpyxl' (PyModulesOk) "run: $pipCmd"
} else {
    Report 'Python modules pywebview, pywinpty, openpyxl' $false "run: $pipCmd"
}

if (Get-Module -ListAvailable ImportExcel) {
    Report 'PowerShell module ImportExcel' $true ''
} elseif (-not $CheckOnly -and (Ask '  ImportExcel is missing. Install it now from the PowerShell Gallery?' $true)) {
    # A new PC has no NuGet provider yet, and Install-Module would stop to ask for it.
    try { Install-PackageProvider NuGet -MinimumVersion 2.8.5.201 -Scope CurrentUser -Force | Out-Null } catch {}
    Install-Module ImportExcel -Scope CurrentUser -Force -AllowClobber
    Report 'PowerShell module ImportExcel' ([bool](Get-Module -ListAvailable ImportExcel)) 'run: Install-Module ImportExcel -Scope CurrentUser'
} else {
    Report 'PowerShell module ImportExcel' $false 'run: Install-Module ImportExcel -Scope CurrentUser'
}

$fontKeys = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts', 'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
function FontOk { [bool]($fontKeys | Where-Object { Test-Path $_ } |
    ForEach-Object { (Get-ItemProperty $_).PSObject.Properties.Name } |
    Where-Object { $_ -like 'DejaVu Sans Mono*' }) }
$fontOk = FontOk
if (-not $fontOk -and -not $CheckOnly -and (Ask '  DejaVu Sans Mono is missing. Download and install it now (just for you)?' $true)) {
    try {
        $zip = Download 'https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.zip'
        $unzipped = Join-Path $env:TEMP 'dejavu-fonts'
        Expand-Archive $zip $unzipped -Force
        $fonts = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'
        New-Item -ItemType Directory -Force $fonts | Out-Null
        $key = 'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
        if (-not (Test-Path $key)) { New-Item $key -Force | Out-Null }
        foreach ($ttf in Get-ChildItem $unzipped -Recurse -Filter 'DejaVuSansMono*.ttf') {
            Copy-Item $ttf.FullName $fonts -Force
            # DejaVuSansMono-BoldOblique.ttf -> "DejaVu Sans Mono Bold Oblique (TrueType)"
            $style = ($ttf.BaseName -replace '^DejaVuSansMono-?', '') -creplace '(?<=.)([A-Z])', ' $1'
            $name = ('DejaVu Sans Mono ' + $style).Trim() + ' (TrueType)'
            Set-ItemProperty $key $name (Join-Path $fonts $ttf.Name)
        }
    } catch { Write-Host "  $_" -ForegroundColor Yellow }
    $fontOk = FontOk
}
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
    # The template's one tab is a Claude tab; without claude, start with no tabs (add them with +).
    $text = if ($claudeOk) { [IO.File]::ReadAllText($agents) -replace '__NEW_ID__', [guid]::NewGuid() } else { "{`n  `"sessions`": [`n  ]`n}`n" }
    [IO.File]::WriteAllText($agents, $text)
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
Write-Host 'Next: list your tabs in agents.json, then double-click "Agent Mission Control" on the desktop.'
