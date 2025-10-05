@echo off
echo ========================================
echo Starting MMM Crawler at %date% %time%
echo ========================================

cd /d "D:\MMM-main"

echo Current directory: %CD%
echo Node version:
node --version

echo Starting crawler...
node testCrawler.js

echo ========================================
echo Crawler finished at %date% %time%
echo ========================================

pause
