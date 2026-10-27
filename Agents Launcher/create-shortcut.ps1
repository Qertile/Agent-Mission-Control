# Puts an "Agent Mission Control" shortcut on the desktop that points at the
# launcher in this folder, wherever AI-Infra was copied to.
$target  = Join-Path $PSScriptRoot 'Agents Launcher.bat'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Agent Mission Control.lnk'

$sh  = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut($lnkPath)
$lnk.TargetPath       = $target
$lnk.WorkingDirectory = $PSScriptRoot
$lnk.IconLocation     = Join-Path (Split-Path $PSScriptRoot -Parent) 'Session HUD\mission-control.ico'
$lnk.Description      = 'Open Agent Mission Control and its agent tabs'
$lnk.Save()

# The shortcut used to be called "Agents Launcher"; remove that one when it points here.
$oldPath = Join-Path $desktop 'Agents Launcher.lnk'
if ((Test-Path $oldPath) -and $sh.CreateShortcut($oldPath).TargetPath -eq $target) {
    Remove-Item $oldPath
    Write-Host "Old shortcut removed: $oldPath"
}
Write-Host "Shortcut created: $lnkPath"
