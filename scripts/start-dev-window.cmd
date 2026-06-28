@echo off
setlocal
cd /d "%~dp0\.."
echo Opening dev server in a separate window (keeps running if you close Cursor).
start "Building Map Explorer Dev" cmd /k "cd /d "%~dp0\.." && echo. && echo Dev server: http://localhost:5173/ && echo Leave this window open while you work. && echo. && call scripts\start-dev-persistent.cmd"
