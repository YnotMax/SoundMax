@echo off
title SoundMax - Iniciando como ADM
echo ------------------------------------------
echo   SoundMax - Verificando Permissoes...
echo ------------------------------------------

:: Testar se ja temos privilegios de Admin
net session >nul 2>&1
if %errorLevel% == 0 (
    goto :gotAdmin
) else (
    echo Requisitando privilegios de Administrador...
    goto :UACPrompt
)

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%temp%\getadmin.vbs"
    "%temp%\getadmin.vbs"
    exit /B

:gotAdmin
    if exist "%temp%\getadmin.vbs" ( del "%temp%\getadmin.vbs" )
    pushd "%CD%"
    CD /D "%~dp0"

echo ------------------------------------------
echo   SoundMax - Premium Soundboard (MODO ADM)
echo ------------------------------------------

echo Limpando cache e processos antigos...
taskkill /F /IM electron.exe >nul 2>&1
rmdir /s /q "%APPDATA%\soundmax" >nul 2>&1
rmdir /s /q "%LOCALAPPDATA%\soundmax" >nul 2>&1

echo Iniciando engine nativa...
npm start
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] O app fechou inesperadamente.
    pause
)
