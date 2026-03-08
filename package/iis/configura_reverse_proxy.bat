@echo off
chcp 65001 >nul
echo ============================================================
echo   Configurazione IIS Reverse Proxy - Elettroquadri
echo ============================================================
echo.
echo Questo script configura IIS come reverse proxy per il
echo Configuratore Elettroquadri, SENZA toccare i siti esistenti.
echo.
echo Installa (se mancanti):
echo   - URL Rewrite Module
echo   - Application Request Routing (ARR)
echo   - win-acme per certificato Let's Encrypt
echo.
echo PREREQUISITO: il sottodominio deve gia' puntare a questo
echo server (record DNS A creato e propagato).
echo.

:: Verifica amministratore
net session >nul 2>&1
if errorlevel 1 (
    echo [ERRORE] Eseguire come Amministratore!
    pause
    exit /b 1
)

:: Chiedi sottodominio
echo Esempi: configuratore.b-conn.it, eq.miodominio.it
echo.
set /p DOMINIO="Inserisci il sottodominio: "

if "%DOMINIO%"=="" (
    echo [ERRORE] Devi specificare un sottodominio.
    pause
    exit /b 1
)

echo.
echo Configurazione per: %DOMINIO%
echo.

set "SCRIPT_DIR=%~dp0"
powershell.exe -ExecutionPolicy Bypass -File "%SCRIPT_DIR%setup_iis_proxy.ps1" -HostName "%DOMINIO%"

pause
