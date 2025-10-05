@echo off
setlocal enabledelayedexpansion

REM Set working directory
cd /d "D:\MMM-main"

REM Create logs directory if it doesn't exist
if not exist "logs" mkdir logs

REM Get current timestamp for log file
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YY=%dt:~2,2%" & set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%" & set "Sec=%dt:~12,2%"
set "timestamp=%YYYY%-%MM%-%DD%_%HH%-%Min%-%Sec%"

REM Log file path
set "logfile=logs\crawler_%timestamp%.log"

echo ======================================== >> "%logfile%"
echo Starting MMM Crawler at %date% %time% >> "%logfile%"
echo ======================================== >> "%logfile%"
echo. >> "%logfile%"

echo Current directory: %CD% >> "%logfile%"
echo Node version: >> "%logfile%"
node --version >> "%logfile%" 2>&1
echo. >> "%logfile%"

echo Starting crawler... >> "%logfile%"
echo ======================================== >> "%logfile%"

REM Run the crawler and capture all output
node testCrawler.js >> "%logfile%" 2>&1

REM Check if the script ran successfully
if %errorlevel% equ 0 (
    echo ======================================== >> "%logfile%"
    echo Crawler completed successfully at %date% %time% >> "%logfile%"
    echo ======================================== >> "%logfile%"
) else (
    echo ======================================== >> "%logfile%"
    echo Crawler failed with error code %errorlevel% at %date% %time% >> "%logfile%"
    echo ======================================== >> "%logfile%"
)

REM Keep only last 10 log files to prevent disk space issues
for /f "skip=10 delims=" %%i in ('dir /b /o-d logs\crawler_*.log 2^>nul') do del "logs\%%i" 2>nul

endlocal
