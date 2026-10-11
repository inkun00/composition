@echo off
setlocal
title Maeum Melody Local App
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1"
if errorlevel 1 pause
endlocal
