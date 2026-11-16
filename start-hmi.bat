@echo off
rem ============================================================
rem  Window Bench HMI launcher (double-click to run)
rem  Starts the production build (dist/) on a local server
rem  and opens it in the default browser.
rem  Close the "HMI server" window to stop the HMI.
rem ============================================================
cd /d "%~dp0"

rem Use bundled Node.js if npm is not on PATH
where npm >nul 2>nul || set "PATH=%PATH%;%USERPROFILE%\.local\lib\nodejs"

rem Start local server for dist/ (port 4173, strict)
start "HMI server" cmd /c "npm run preview -- --strictPort --host localhost"

timeout /t 2 /nobreak >nul
start http://localhost:4173

echo.
echo  HMI is running at http://localhost:4173
echo  Close the "HMI server" window to stop it.
timeout /t 5 >nul
