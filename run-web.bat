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

echo Preparing local HTTPS certificate...
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (-not (Test-Path '%APP_DIR%.cert\brainz-sales-dev.pfx')) { New-Item -ItemType Directory -Force -Path '%APP_DIR%.cert' | Out-Null; $cert = New-SelfSignedCertificate -DnsName 'localhost','192.168.10.18' -CertStoreLocation 'Cert:\CurrentUser\My' -FriendlyName 'brainz-sales-dev' -NotAfter (Get-Date).AddYears(3); $pwd = ConvertTo-SecureString 'brainz-sales' -AsPlainText -Force; Export-PfxCertificate -Cert $cert -FilePath '%APP_DIR%.cert\brainz-sales-dev.pfx' -Password $pwd | Out-Null }"

echo Starting API server...
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (-not (Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue)) { Start-Process -WindowStyle Hidden -FilePath 'C:\Program Files\nodejs\npm.cmd' -ArgumentList @('run','dev') -WorkingDirectory '%APP_DIR%server' }"

echo Starting document mail API...
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (-not (Get-NetTCPConnection -LocalPort 5174 -ErrorAction SilentlyContinue)) { Start-Process -WindowStyle Hidden -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList @('src\modules\document\documentMailApi.cjs') -WorkingDirectory '%APP_DIR%' }"

echo Starting brainz-sales web app...
echo URL: https://192.168.10.18:5173/brainz-sales/
start "open brainz-sales" powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 3; Start-Process 'https://192.168.10.18:5173/brainz-sales/'"
call npm.cmd run dev -- --host 192.168.10.18 --port 5173

pause
