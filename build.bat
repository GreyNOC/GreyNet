@echo off
setlocal EnableDelayedExpansion

REM ============================================================
REM  GreyNet — Windows build script
REM  Produces a portable .exe and an installer in .\dist
REM ============================================================

cd /d "%~dp0"

echo.
echo ================================================
echo  GreyNet Windows Build
echo ================================================
echo.

REM ---- Check Node.js -------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not on PATH.
  echo.
  echo Install Node.js LTS from:  https://nodejs.org/
  echo Then re-run this script.
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo Using Node !NODE_VER!

REM ---- Check npm -----------------------------------
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not on PATH. Reinstall Node.js to fix.
  pause
  exit /b 1
)

REM ---- Install dependencies ------------------------
if not exist node_modules (
  echo.
  echo Installing build dependencies ^(Electron + electron-builder^)...
  echo This is a one-time download of ~200 MB. Be patient.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed. See output above.
    pause
    exit /b 1
  )
) else (
  echo Using cached node_modules.
)

REM ---- Build ----------------------------------------
echo.
echo Building Windows portable .exe + installer...
echo.
call npm run build
if errorlevel 1 (
  echo.
  echo [ERROR] Build failed. See output above.
  pause
  exit /b 1
)

echo.
echo ================================================
echo  Build complete
echo ================================================
echo.
echo Output files are in the .\dist folder:
echo.
dir /b dist\*.exe 2>nul
echo.
echo - Portable .exe: runs from anywhere, no install.
echo - Installer .exe: traditional NSIS installer.
echo.
pause
endlocal
