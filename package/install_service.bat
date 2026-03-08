@echo off
chcp 65001 >nul
echo ============================================================
echo   Installazione Servizio Windows - Elettroquadri Server
echo ============================================================
echo.

:: Verifica permessi amministratore
net session >nul 2>&1
if errorlevel 1 (
    echo [ERRORE] Questo script richiede permessi di Amministratore.
    echo Clicca destro ^> "Esegui come amministratore"
    pause
    exit /b 1
)

set "SERVICE_NAME=ElettroquadriServer"
set "INSTALL_DIR=%~dp0"
set "EXE_PATH=%INSTALL_DIR%ElettroquadriServer.exe"
set "NSSM_PATH=%INSTALL_DIR%nssm.exe"

:: ── Verifica exe ──
if not exist "%EXE_PATH%" (
    echo [ERRORE] ElettroquadriServer.exe non trovato in %INSTALL_DIR%
    pause
    exit /b 1
)

:: ── Verifica NSSM ──
if not exist "%NSSM_PATH%" (
    echo [INFO] NSSM non trovato. Scaricamento in corso...
    echo.
    echo NSSM (Non-Sucking Service Manager) è necessario per installare
    echo l'applicazione come servizio Windows.
    echo.
    echo Scarica NSSM da: https://nssm.cc/download
    echo Copia nssm.exe (64-bit) nella cartella: %INSTALL_DIR%
    echo Poi riesegui questo script.
    echo.
    echo In alternativa, puoi avviare manualmente con:
    echo   ElettroquadriServer.exe
    pause
    exit /b 1
)

:: ── Rimuovi servizio esistente ──
"%NSSM_PATH%" status %SERVICE_NAME% >nul 2>&1
if not errorlevel 1 (
    echo Rimozione servizio esistente...
    "%NSSM_PATH%" stop %SERVICE_NAME% >nul 2>&1
    "%NSSM_PATH%" remove %SERVICE_NAME% confirm >nul 2>&1
    timeout /t 2 >nul
)

:: ── Installa servizio ──
echo Installazione servizio %SERVICE_NAME%...
"%NSSM_PATH%" install %SERVICE_NAME% "%EXE_PATH%"

:: Configura parametri
"%NSSM_PATH%" set %SERVICE_NAME% AppDirectory "%INSTALL_DIR%"
"%NSSM_PATH%" set %SERVICE_NAME% DisplayName "Elettroquadri Configuratore Server"
"%NSSM_PATH%" set %SERVICE_NAME% Description "Server web per il Configuratore Elettroquadri - preventivi e distinte base ascensori"
"%NSSM_PATH%" set %SERVICE_NAME% Start SERVICE_AUTO_START

:: Log di output
"%NSSM_PATH%" set %SERVICE_NAME% AppStdout "%INSTALL_DIR%logs\service_stdout.log"
"%NSSM_PATH%" set %SERVICE_NAME% AppStderr "%INSTALL_DIR%logs\service_stderr.log"
"%NSSM_PATH%" set %SERVICE_NAME% AppStdoutCreationDisposition 4
"%NSSM_PATH%" set %SERVICE_NAME% AppStderrCreationDisposition 4
"%NSSM_PATH%" set %SERVICE_NAME% AppRotateFiles 1
"%NSSM_PATH%" set %SERVICE_NAME% AppRotateBytes 5242880

:: Restart automatico su crash
"%NSSM_PATH%" set %SERVICE_NAME% AppExit Default Restart
"%NSSM_PATH%" set %SERVICE_NAME% AppRestartDelay 5000

:: Crea cartella logs
if not exist "%INSTALL_DIR%logs" mkdir "%INSTALL_DIR%logs"

:: ── Avvia servizio ──
echo Avvio servizio...
"%NSSM_PATH%" start %SERVICE_NAME%

timeout /t 3 >nul

"%NSSM_PATH%" status %SERVICE_NAME%
if errorlevel 1 (
    echo.
    echo [ATTENZIONE] Il servizio potrebbe non essersi avviato correttamente.
    echo Controlla i log in: %INSTALL_DIR%logs\
) else (
    echo.
    echo ============================================================
    echo   Servizio installato e avviato con successo!
    echo.
    echo   Nome servizio: %SERVICE_NAME%
    echo   Avvio automatico: Sì (parte col sistema)
    echo   Log: %INSTALL_DIR%logs\
    echo.
    echo   Apri il browser: http://localhost:8080
    echo.
    echo   Gestione servizio:
    echo     Avvia:   net start %SERVICE_NAME%
    echo     Ferma:   net stop %SERVICE_NAME%
    echo     Stato:   nssm status %SERVICE_NAME%
    echo ============================================================
)

pause
