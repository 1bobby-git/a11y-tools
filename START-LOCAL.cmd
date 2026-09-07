@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Install Node.js 22 or newer first. & pause & exit /b 1)
call npm install --ignore-scripts --no-audit --no-fund
if errorlevel 1 goto fail
call npm run build -- --require-axe
if errorlevel 1 goto fail
call npm test
if errorlevel 1 goto fail
call npm start
exit /b %errorlevel%
:fail
echo Setup or validation failed. Review the error above.
pause
exit /b 1
