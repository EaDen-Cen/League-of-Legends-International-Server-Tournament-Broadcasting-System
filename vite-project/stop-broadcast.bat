@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title LoL Broadcast Stop

echo ==========================================
echo   LoL Broadcast - Stopping...
echo ==========================================
echo.

echo [1/2] Stopping server on port 3001...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
  taskkill /PID %%P /F >nul 2>&1
)

echo [2/2] Stopping Cloudflare tunnel...
taskkill /IM cloudflared.exe /F >nul 2>&1

if exist "artifacts\current-public-url.txt" del /q "artifacts\current-public-url.txt" >nul 2>&1

echo.
echo LoL Broadcast stopped.
timeout /t 2 /nobreak >nul
endlocal
