@echo off
setlocal
cd /d "%~dp0\.."
echo Dev server: http://localhost:5173/
npm run dev
