@echo off
setlocal
chcp 65001 >nul
title Maeum Melody Score Reader

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js가 필요합니다. 설치 페이지를 엽니다.
  start "" "https://nodejs.org/ko/download"
  pause
  exit /b 1
)

set "HELPER_DIR=%LOCALAPPDATA%\MaeumMelody"
set "HELPER_FILE=%HELPER_DIR%\homr-helper.generated.mjs"
if not exist "%HELPER_DIR%" mkdir "%HELPER_DIR%"

echo 악보 읽기 도우미를 준비하고 있습니다...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing 'https://maeum-melody.vercel.app/homr-helper.generated.mjs' -OutFile '%HELPER_FILE%'"
if errorlevel 1 (
  echo 도우미를 받지 못했습니다. 인터넷 연결을 확인해 주세요.
  pause
  exit /b 1
)

start "악보 읽기 도우미" /min node "%HELPER_FILE%"
timeout /t 2 /nobreak >nul
start "" "https://maeum-melody.vercel.app/?start=new"
exit /b 0
