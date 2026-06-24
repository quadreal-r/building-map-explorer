@echo off
setlocal
set "TARGET=C:\Users\Robert\OneDrive - Quadreal Property Group\#OI-Industrial East - @Master Sheets&Projects\Claude Projects\Cursor Projects\building-map-explorer"
subst B: /D >nul 2>&1
subst B: "%TARGET%"
if errorlevel 1 (
  echo Failed to map B: drive. Is the OneDrive project path available?
  exit /b 1
)
cd /d B:\
echo Dev server: http://localhost:5173/
npm run dev
