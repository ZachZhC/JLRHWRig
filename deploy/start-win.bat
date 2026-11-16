@echo off
REM HMI launcher - Windows
REM Double-click to open HMI in browser. Requires Python 3 or Node.js.
cd /d "%~dp0"

set PORT=8080
set BROWSER_URL=http://127.0.0.1:%PORT%/

REM --- Locate dist folder ---
set "DIST_DIR="
if exist "dist\index.html" set "DIST_DIR=%cd%\dist"
if "%DIST_DIR%"=="" if exist "..\dist\index.html" set "DIST_DIR=%cd%\..\dist"

if "%DIST_DIR%"=="" (
  echo [HMI] ERROR: dist\index.html not found.
  pause
  exit /b 1
)

REM --- cd into dist and start server ---
cd /d "%DIST_DIR%"

where python >nul 2>nul
if %ERRORLEVEL%==0 goto :py_ok
where py >nul 2>nul
if %ERRORLEVEL%==0 goto :py_ok
where node >nul 2>nul
if %ERRORLEVEL%==0 goto :node_ok

echo [HMI] ERROR: Python 3 or Node.js not found.
echo  Install Python 3 from Microsoft Store (recommended)
pause
exit /b 1

:py_ok
echo [HMI] Serving from: %cd%
echo [HMI] URL: %BROWSER_URL%
echo [HMI] Close this window to stop.
echo.
start "" /b cmd /c "python -m http.server %PORT% >nul 2>&1"
timeout /t 2 /nobreak >nul
start "" "%BROWSER_URL%"
exit /b 0

:node_ok
echo [HMI] Starting via Node.js ...
start "" /b cmd /c "npx -y serve -s -l %PORT% . >nul 2>&1"
timeout /t 3 /nobreak >nul
start "" "%BROWSER_URL%"
exit /b 0
