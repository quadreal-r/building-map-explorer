@echo off
setlocal
cd /d "%~dp0\.."
echo Dev server: http://localhost:5173/
echo.
echo This window keeps Vite running. If it exits, it restarts automatically.
echo Leave this window open while you work (safe to close Cursor).
echo.
:loop
call npm run dev
echo.
echo [%date% %time%] Dev server stopped. Restarting in 3 seconds...
ping -n 4 127.0.0.1 >nul
goto loop
