@echo off
cd /d "%~dp0"
echo ---- %date% %time% ---- >> sync.log
call npm run sync >> sync.log 2>&1
