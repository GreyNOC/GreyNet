@echo off
setlocal

REM Quick launcher — runs the app in Electron without building an installer.
REM Use this for development; use build.bat to produce distributable .exe files.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not on PATH.
  echo Install from https://nodejs.org/ then re-run.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing Electron ^(one-time^)...
  call npm install
  if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

echo Launching GreyNet...
call npm start
endlocal
