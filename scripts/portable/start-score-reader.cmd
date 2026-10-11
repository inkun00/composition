@echo off
setlocal
title Maeum Melody Score Reader

where node >nul 2>nul
if errorlevel 1 (
  echo The score reader needs Node.js installed on this computer.
  echo Install it from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

if not exist "%~dp0homr-helper.generated.mjs" (
  echo Keep this launcher beside the packaged homr-helper.generated.mjs file.
  pause
  exit /b 1
)

echo Starting the packaged score reader. Keep this window open while reading scores.
echo The app can install the Python recognition runtime when needed.
pushd "%~dp0"
node "%~dp0homr-helper.generated.mjs"
set "READER_EXIT=%ERRORLEVEL%"
popd
if not "%READER_EXIT%"=="0" pause
exit /b %READER_EXIT%
