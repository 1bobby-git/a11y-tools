@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required. See README.md.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:4173/ in your browser.
node scripts\serve.mjs
pause
