@echo off
echo ========================================
echo FIX AUTOMATICO CORS + LOGIN
echo ========================================
echo.

REM Vai alla directory backend
cd /d C:\Users\david\Desktop\Python\ConfiguratoreEQ\1.0\backend

echo [1/4] Backup main.py...
if exist main.py (
    copy main.py main.py.backup_%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2% >nul
    echo     ✓ Backup creato
) else (
    echo     ! main.py non trovato
)

echo [2/4] Copia main_CORS_FIXED.py...
if exist main_CORS_FIXED.py (
    copy /Y main_CORS_FIXED.py main.py >nul
    echo     ✓ Backend aggiornato con CORS fix
) else (
    echo     ✗ main_CORS_FIXED.py non trovato!
    echo     Scarica il file e mettilo in questa cartella
    pause
    exit
)

echo.
echo BACKEND PRONTO!
echo.
echo Ora avvia il backend in un altro terminal:
echo     cd backend
echo     python main.py
echo.
pause

REM Vai alla directory frontend
cd /d C:\Users\david\Desktop\Python\ConfiguratoreEQ\1.0\frontend

echo [3/4] Backup App.tsx...
if exist src\App.tsx (
    copy src\App.tsx src\App.tsx.backup_%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2% >nul
    echo     ✓ Backup creato
)

echo [4/4] Copia App_DIAGNOSTIC.tsx...
if exist App_DIAGNOSTIC.tsx (
    copy /Y App_DIAGNOSTIC.tsx src\App.tsx >nul
    echo     ✓ Frontend aggiornato con Login diagnostico
) else (
    echo     ✗ App_DIAGNOSTIC.tsx non trovato!
    echo     Scarica il file e mettilo in questa cartella
    pause
    exit
)

echo.
echo ========================================
echo ✅ FIX COMPLETATO!
echo ========================================
echo.
echo PROSSIMI PASSI:
echo.
echo 1. Avvia BACKEND (se non già fatto):
echo    cd backend
echo    python main.py
echo.
echo 2. Avvia FRONTEND (in questo terminal):
echo    npm run dev
echo.
echo 3. Apri browser:
echo    http://localhost:5173
echo.
echo 4. Dovresti vedere:
echo    🔐 Login con pulsante "Accedi (Bypass)"
echo.
pause

REM Cancella localStorage (apre browser con console)
echo.
echo Vuoi cancellare localStorage? (S/N)
set /p clear_storage=
if /i "%clear_storage%"=="S" (
    echo.
    echo Apri Console nel browser (F12) ed esegui:
    echo localStorage.clear();
    echo.
    pause
)

echo.
echo Avvio frontend...
npm run dev
