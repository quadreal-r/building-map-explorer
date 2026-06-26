@echo off
setlocal
cd /d "%~dp0\.."
echo Stopping anything listening on port 5173...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
  taskkill /F /PID %%P >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo Dev server: http://localhost:5173/
npm run dev
