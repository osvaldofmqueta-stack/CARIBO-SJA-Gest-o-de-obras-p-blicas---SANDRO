@echo off
setlocal
cd /d "%~dp0"
title Caribo SJA - Configuracao local

where powershell.exe >nul 2>nul
if errorlevel 1 (
    echo O Windows PowerShell e necessario para executar este instalador.
    pause
    exit /b 1
)

if not exist "%~dp0scripts\install-local.ps1" (
    echo O script scripts\install-local.ps1 nao foi encontrado.
    pause
    exit /b 1
)

echo Configuracao local do Caribo SJA
echo Este instalador conecta o PC a base Neon existente; nao cria nem importa bases locais.
echo A URL do Neon e introduzida sem aparecer no ecra e guardada cifrada para este utilizador.
echo Os dados ficam partilhados; fotos enviadas ficam apenas neste PC.
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-local.ps1"
set "INSTALLER_RESULT=%ERRORLEVEL%"

if not "%INSTALLER_RESULT%"=="0" (
    echo.
    echo A instalacao parou. Corrija o erro acima e execute installer.bat novamente.
    echo Pressione qualquer tecla para sair.
    pause >nul
)

exit /b %INSTALLER_RESULT%