@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title LoL Broadcast Launcher

echo ==========================================
echo   LoL Broadcast - Starting...
echo ==========================================
echo.

where node >nul 2>&1 || (echo [ERROR] Node.js was not found in PATH.& pause & exit /b 1)
where npm >nul 2>&1 || (echo [ERROR] npm was not found in PATH.& pause & exit /b 1)
where cloudflared >nul 2>&1 || (echo [ERROR] cloudflared was not found in PATH.& pause & exit /b 1)
if not exist "package.json" (echo [ERROR] Launcher must stay in vite-project.& pause & exit /b 1)
if not exist "run-cloudflare.ps1" (echo [ERROR] run-cloudflare.ps1 is missing. Run git pull again.& pause & exit /b 1)
if not exist "run-server.ps1" (echo [ERROR] run-server.ps1 is missing. Extract the complete update package.& pause & exit /b 1)

echo Preparing dependencies and web pages...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-server.ps1" -PrepareOnly
if errorlevel 1 (
  echo [ERROR] Preparation failed. See the error above.
  pause
  exit /b 1
)

if not exist "artifacts" mkdir "artifacts"
del /q "artifacts\cloudflared.log" >nul 2>&1
del /q "artifacts\current-public-url.txt" >nul 2>&1

echo [1/6] Stopping old LoL server on port 3001...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do taskkill /PID %%P /F >nul 2>&1
echo [2/6] Stopping old Cloudflare tunnel...
taskkill /IM cloudflared.exe /F >nul 2>&1
timeout /t 1 /nobreak >nul

echo [3/6] Starting LoL server...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-server.ps1" -Background
echo       Waiting for local server...
set /a SERVER_TRIES=0
:wait_server
powershell -NoProfile -Command "try { $h=Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/health' -TimeoutSec 2; if(-not $h.ok){exit 1}; Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3001/control' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto server_ready
set /a SERVER_TRIES+=1
if !SERVER_TRIES! GEQ 30 goto server_failed
timeout /t 1 /nobreak >nul
goto wait_server

:server_failed
echo [ERROR] Server did not become ready within 30 seconds.
echo Server error log:
if exist "artifacts\server.log" type "artifacts\server.log"
echo Full log: %~dp0artifacts\server.log
pause
exit /b 1

:server_ready
echo       Server is ready.
echo [4/6] Starting Cloudflare Quick Tunnel...
start "LoL Cloudflare Tunnel" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-cloudflare.ps1"

echo [5/6] Waiting for public URL...
set /a TUNNEL_TRIES=0
:wait_tunnel
set "PUBLIC_URL="
if exist "artifacts\cloudflared.log" (
  for /f "delims=" %%U in ('powershell -NoProfile -Command "$text=Get-Content -Raw -LiteralPath 'artifacts\cloudflared.log'; $m=[regex]::Matches($text,'https://[a-zA-Z0-9-]+\.trycloudflare\.com'); if($m.Count){$m[$m.Count-1].Value}"') do set "PUBLIC_URL=%%U"
)
if defined PUBLIC_URL goto tunnel_ready
set /a TUNNEL_TRIES+=1
if !TUNNEL_TRIES! GEQ 60 goto tunnel_failed
timeout /t 1 /nobreak >nul
goto wait_tunnel

:tunnel_failed
echo [ERROR] No public URL was found within 60 seconds.
echo.
if exist "artifacts\cloudflared.log" (
  echo Cloudflare log:
  type "artifacts\cloudflared.log"
) else (
  echo [ERROR] cloudflared.log was not created.
  echo         Check the "LoL Cloudflare Tunnel" window.
)
pause
exit /b 1

:tunnel_ready
> "artifacts\current-public-url.txt" echo !PUBLIC_URL!
>>"artifacts\current-public-url.txt" echo !PUBLIC_URL!/control
>>"artifacts\current-public-url.txt" echo !PUBLIC_URL!/caster
>>"artifacts\current-public-url.txt" echo !PUBLIC_URL!/overlay/draft

echo [6/6] Opening local Control...
start "" "http://127.0.0.1:3001/control"
echo.
echo ==========================================
echo   LoL Broadcast is READY
echo ==========================================
echo Local Control:
echo   http://127.0.0.1:3001/control
echo.
echo Public:
echo   !PUBLIC_URL!
echo.
echo Caster:
echo   !PUBLIC_URL!/caster
echo.
echo Overlay:
echo   !PUBLIC_URL!/overlay/draft
echo.
echo Saved to artifacts\current-public-url.txt
echo ==========================================
echo.
pause
endlocal
