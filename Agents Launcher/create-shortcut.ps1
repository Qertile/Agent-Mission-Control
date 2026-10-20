# Puts an "Agents Launcher" shortcut on the desktop that points at the
# launcher in this folder, wherever AI-Infra was copied to.
$target  = Join-Path $PSScriptRoot 'Agents Launcher.bat'
$lnkPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Agents Launcher.lnk'

$sh  = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut($lnkPath)
$lnk.TargetPath       = $target
$lnk.WorkingDirectory = $PSScriptRoot
$lnk.IconLocation     = '%SystemRoot%\System32\imageres.dll,144'
$lnk.Description      = 'Open all active Claude Code agent tabs'
$lnk.Save()
Write-Host "Shortcut created: $lnkPath"
