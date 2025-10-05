# PowerShell script to setup Windows Task Scheduler for MMM Crawler
# Run this script as Administrator

param(
    [string]$TaskName = "MMM Crawler",
    [string]$Schedule = "Daily",  # Daily, Weekly, Hourly
    [string]$Time = "09:00",      # HH:MM format
    [string]$DaysOfWeek = "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday"
)

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "This script requires Administrator privileges. Please run PowerShell as Administrator." -ForegroundColor Red
    exit 1
}

$ScriptPath = "D:\MMM-main\run_crawler_scheduled.bat"
$WorkingDirectory = "D:\MMM-main"

# Check if the batch file exists
if (-not (Test-Path $ScriptPath)) {
    Write-Host "Batch file not found at: $ScriptPath" -ForegroundColor Red
    exit 1
}

# Remove existing task if it exists
$ExistingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($ExistingTask) {
    Write-Host "Removing existing task: $TaskName" -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# Create the action
$Action = New-ScheduledTaskAction -Execute $ScriptPath -WorkingDirectory $WorkingDirectory

# Create the trigger based on schedule
switch ($Schedule.ToLower()) {
    "daily" {
        $Trigger = New-ScheduledTaskTrigger -Daily -At $Time
    }
    "weekly" {
        $Days = $DaysOfWeek -split ","
        $Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $Days -At $Time
    }
    "hourly" {
        $Trigger = New-ScheduledTaskTrigger -Once -At $Time -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 365)
    }
    default {
        Write-Host "Invalid schedule. Use: Daily, Weekly, or Hourly" -ForegroundColor Red
        exit 1
    }
}

# Create task settings
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable

# Create the principal (run as SYSTEM)
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

# Register the task
try {
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description "Automated MMM Marketplace Crawler"
    Write-Host "Task '$TaskName' created successfully!" -ForegroundColor Green
    Write-Host "Schedule: $Schedule at $Time" -ForegroundColor Green
    Write-Host "Script: $ScriptPath" -ForegroundColor Green
    
    # Show next run time
    $Task = Get-ScheduledTask -TaskName $TaskName
    $NextRun = (Get-ScheduledTaskInfo -TaskName $TaskName).NextRunTime
    Write-Host "Next run: $NextRun" -ForegroundColor Cyan
    
} catch {
    Write-Host "Error creating task: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`nTo manage this task:" -ForegroundColor Yellow
Write-Host "1. Open Task Scheduler (taskschd.msc)" -ForegroundColor White
Write-Host "2. Find task: $TaskName" -ForegroundColor White
Write-Host "3. Right-click to run, edit, or delete" -ForegroundColor White
