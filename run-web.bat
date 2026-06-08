@echo off
setlocal
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd was not found. Please install Node.js first.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting brainz-sales web app...
echo URL: http://127.0.0.1:5173/
start "open brainz-sales" powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 3; Start-Process 'http://127.0.0.1:5173/'"
call npm.cmd run dev -- --host 127.0.0.1 --port 5173

pause
