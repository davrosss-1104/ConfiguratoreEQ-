@echo off
chcp 65001 >nul
echo Rimozione Servizio Elettroquadri Server
echo ========================================

net session >nul 2>&1
if errorlevel 1 (
    echo [ERRORE] Richiede permessi di Amministratore.
    pause
    exit /b 1
)

set "SERVICE_NAME=ElettroquadriServer"
set "NSSM_PATH=%~dp0nssm.exe"

if not exist "%NSSM_PATH%" (
    echo [ERRORE] nssm.exe non trovato
    pause
    exit /b 1
)

echo Arresto servizio...
"%NSSM_PATH%" stop %SERVICE_NAME% >nul 2>&1
timeout /t 2 >nul

echo Rimozione servizio...
"%NSSM_PATH%" remove %SERVICE_NAME% confirm

echo.
echo Servizio rimosso.
pause
