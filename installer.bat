@echo off
setlocal
cd /d "%~dp0"

where powershell.exe >nul 2>nul
if errorlevel 1 (
    echo Windows PowerShell is required to run this installer.
    pause
    exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-local.ps1"
set "INSTALLER_RESULT=%ERRORLEVEL%"

if not "%INSTALLER_RESULT%"=="0" (
    echo.
    echo Installation stopped. Read the error above, fix it, and run installer.bat again.
    pause
)

exit /b %INSTALLER_RESULT%