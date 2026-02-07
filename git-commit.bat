@echo off
chcp 65001 >nul
echo ==========================================
echo   SALVA VERSIONE - Configuratore CEQ
echo ==========================================
echo.

if not exist ".git" (
    echo Git non inizializzato! Lancia prima git-setup.bat
    pause
    exit /b 1
)

echo File modificati:
echo ------------------------------------------
git status --short
echo ------------------------------------------
echo.

set /p MSG="Descrizione modifica: "

if "%MSG%"=="" (
    echo Devi inserire una descrizione!
    pause
    exit /b 1
)

git add .
git commit -m "%MSG%"

echo.
echo Versione salvata!
echo.
echo Ultime 5 versioni:
git log --oneline -5
echo.
pause
