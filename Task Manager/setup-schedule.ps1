$taskName = 'TaskHUD-Weekday-0930'
$scriptPath = Join-Path $PSScriptRoot 'show-hud.ps1'

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Through conhost.exe: started directly, Windows 11 hands the console to
# Windows Terminal and an empty "powershell" window appears next to the popup.
$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At 9:30AM
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Weekday 09:30 task HUD popup' | Out-Null
Write-Host "Scheduled task '$taskName' registered."
