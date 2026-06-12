@echo off
echo ========================================
echo  Brainz Sales 서버 시작
echo ========================================

:: 백엔드 서버 (포트 3001)
start "백엔드 서버 :3001" cmd /k "cd /d C:\Users\SALES_LKY\Documents\brainz-sales\server && node index.js"

:: 잠깐 대기 후 프론트엔드 서버 (포트 5173)
timeout /t 2 /nobreak >nul
start "프론트엔드 :5173" cmd /k "cd /d C:\Users\SALES_LKY\Documents\brainz-sales && node node_modules\vite\bin\vite.js"

echo.
echo 서버 시작 중... 잠시 후 브라우저에서 접속하세요.
echo http://localhost:5173/brainz-sales/
echo.
timeout /t 3 /nobreak >nul
start http://localhost:5173/brainz-sales/
