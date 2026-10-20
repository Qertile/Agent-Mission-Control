# Registers the three Claude jobs against the scripts in this folder.
# Same times as the original setup: review weekdays 09:30, daily summary
# weekdays 19:00, weekly summary Fridays 19:30.
$weekdays = 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'
$jobs = @(
    @{ Name = 'Claude Daily Review';   Script = 'run-daily-review.ps1';   Days = $weekdays;  At = '9:30AM' }
    @{ Name = 'Claude Daily Summary';  Script = 'run-daily-summary.ps1';  Days = $weekdays;  At = '7:00PM' }
    @{ Name = 'Claude Weekly Summary'; Script = 'run-weekly-summary.ps1'; Days = 'Friday';   At = '7:30PM' }
)
foreach ($job in $jobs) {
    $script = Join-Path $PSScriptRoot $job.Script
    if (Get-ScheduledTask -TaskName $job.Name -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $job.Name -Confirm:$false
    }
    $action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
    $trigger  = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $job.Days -At $job.At
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $job.Name -Action $action -Trigger $trigger -Settings $settings | Out-Null
    Write-Host "Registered: $($job.Name)  ($($job.At), $($job.Days -join ', '))"
}
