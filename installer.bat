@echo off
setlocal
cd /d "%~dp0"
title Caribo SJA - Configuracao local

where powershell.exe >nul 2>nul
if errorlevel 1 (
    echo Windows PowerShell is required to run this installer.
    pause
    exit /b 1
)

if not exist "%~dp0scripts\install-local.ps1" (
    echo The setup script scripts\install-local.ps1 was not found.
    pause
    exit /b 1
)

echo Configuracao local do Caribo SJA
echo Escolha Neon para conectar a base partilhada existente.
echo A URL do Neon e introduzida sem aparecer no ecra e guardada cifrada para este utilizador.
echo Os dados ficam partilhados; fotos enviadas ficam apenas neste PC.
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-local.ps1"
set "INSTALLER_RESULT=%ERRORLEVEL%"

if not "%INSTALLER_RESULT%"=="0" (
    echo.
    echo Installation stopped. Read the error above, fix it, and run installer.bat again.
    pause
)

exit /b %INSTALLER_RESULT%