@echo off
setlocal
cd /d "%~dp0"
title Fat Burn Hero - Test Server
set "PORT=18080"
set "HOST=127.0.0.1"
"%~dp0runtime\node.exe" "%~dp0launch.mjs"
echo.
echo The service has stopped. Press any key to close this window.
pause >nul
