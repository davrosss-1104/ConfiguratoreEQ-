@echo off
chcp 65001 >nul
echo ==========================================
echo   SETUP GIT - Configuratore Elettroquadri
echo ==========================================
echo.

git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Git non trovato! Scaricalo da: https://git-scm.com/download/win
    pause
    exit /b 1
)

if exist ".git" (
    echo Git gia inizializzato in questa cartella.
    echo Usa git-commit.bat per fare un nuovo commit.
    pause
    exit /b 0
)

set /p GIT_NAME="Il tuo nome (es: David): "
set /p GIT_EMAIL="La tua email: "

git config --global user.name "%GIT_NAME%"
git config --global user.email "%GIT_EMAIL%"

echo.
echo Inizializzazione repository...
git init

if not exist ".gitignore" (
    echo .gitignore non trovato! Copialo nella root del progetto.
    pause
    exit /b 1
)

echo.
echo Primo commit...
git add .
git commit -m "v0.10.0 - Template system RISE/HOME"

echo.
echo Fatto! Repository Git creato.
echo.
echo COMANDI UTILI:
echo   git log --oneline        = Vedi storico
echo   git diff                 = Vedi modifiche
echo   git-commit.bat           = Salva versione
echo.
pause
