@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
echo ============================================================
echo   Configuratore Elettroquadri - Build di Produzione
echo ============================================================
echo.

:: ?????? Verifica prerequisiti ??????
where python >nul 2>&1
if errorlevel 1 (
    echo [ERRORE] Python non trovato. Installare Python 3.11+
    pause
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ERRORE] Node.js non trovato. Installare Node.js 18+
    pause
    exit /b 1
)

:: ?????? Root del progetto (1.0\) dove stanno backend\ e frontend\ ??????
set "ROOT=%~dp0"
cd /d "%ROOT%"

:: ?????? Step 1: Build Frontend React ??????
echo.
echo [1/4] Build frontend React...
echo -------------------------------------------

cd /d "%ROOT%frontend"

if not exist "node_modules" (
    echo Installazione dipendenze npm...
    call npm install
    if errorlevel 1 (
        echo [ERRORE] npm install fallito
        pause
        exit /b 1
    )
)

:: API URL vuoto = URL relativo (stessa origine in produzione)
set "VITE_API_URL="
call npm run build
if errorlevel 1 (
    echo [ERRORE] Build frontend fallito
    pause
    exit /b 1
)

echo [OK] Frontend compilato in frontend\dist\

cd /d "%ROOT%"

:: ?????? Step 2: Virtual environment Python ??????
echo.
echo [2/4] Ambiente Python...
echo -------------------------------------------

:: Usa il venv esistente del backend
if exist "%ROOT%backend\venv\Scripts\activate.bat" (
    echo Uso venv esistente in backend\venv
    call "%ROOT%backend\venv\Scripts\activate.bat"
) else (
    if not exist "%ROOT%venv_build" (
        echo Creazione virtual environment per il build...
        python -m venv venv_build
    )
    call "%ROOT%venv_build\Scripts\activate.bat"
)

pip install --upgrade pip >nul 2>&1
pip install -r requirements_prod.txt
if errorlevel 1 (
    echo [ERRORE] Installazione dipendenze Python fallita
    pause
    exit /b 1
)

echo [OK] Dipendenze Python installate

:: ?????? Step 3: Build EXE con PyInstaller ??????
echo.
echo [3/4] Creazione EXE con PyInstaller...
echo -------------------------------------------

pyinstaller elettroquadri.spec --clean --noconfirm --distpath dist_server --workpath build_server
if errorlevel 1 (
    echo [ERRORE] PyInstaller fallito
    pause
    exit /b 1
)

echo [OK] EXE creato

:: ?????? Step 4: Assembla pacchetto distribuzione ??????
echo.
echo [4/4] Assemblaggio pacchetto...
echo -------------------------------------------

set "DIST_DIR=%ROOT%dist_server\ElettroquadriServer"
set "PKG_DIR=%ROOT%package"

if exist "%PKG_DIR%" rmdir /s /q "%PKG_DIR%"
mkdir "%PKG_DIR%"

:: Copia exe e dipendenze PyInstaller
xcopy /E /I /Y "%DIST_DIR%" "%PKG_DIR%" >nul

:: Copia frontend build ??? web/
mkdir "%PKG_DIR%\web" >nul 2>&1
xcopy /E /I /Y "%ROOT%frontend\dist" "%PKG_DIR%\web" >nul
echo [OK] Frontend copiato in web\

:: Copia rules JSON
if exist "%ROOT%backend\rules" (
    xcopy /E /I /Y "%ROOT%backend\rules" "%PKG_DIR%\rules" >nul
    echo [OK] Rules copiate
)

:: Copia data JSON
if exist "%ROOT%backend\data" (
    xcopy /E /I /Y "%ROOT%backend\data" "%PKG_DIR%\data" >nul
    echo [OK] Data copiati
)

:: Copia templates docx
if exist "%ROOT%backend\templates" (
    xcopy /E /I /Y "%ROOT%backend\templates" "%PKG_DIR%\templates" >nul
    echo [OK] Templates copiati
)

:: Copia logo
if exist "%ROOT%backend\logo_elettroquadri.png" (
    copy /Y "%ROOT%backend\logo_elettroquadri.png" "%PKG_DIR%\" >nul
)

:: Copia script servizio
copy /Y "%ROOT%install_service.bat" "%PKG_DIR%\" >nul 2>&1
copy /Y "%ROOT%uninstall_service.bat" "%PKG_DIR%\" >nul 2>&1
copy /Y "%ROOT%start_hidden.vbs" "%PKG_DIR%\" >nul 2>&1

:: Copia cartella IIS
if exist "%ROOT%iis" (
    mkdir "%PKG_DIR%\iis" >nul 2>&1
    xcopy /E /I /Y "%ROOT%iis" "%PKG_DIR%\iis" >nul
    echo [OK] File IIS inclusi
)

:: Copia database
if exist "%ROOT%backend\configuratore.db" (
    copy /Y "%ROOT%backend\configuratore.db" "%PKG_DIR%\elettroquadri.db" >nul
    echo [OK] Database copiato
)

call deactivate 2>nul

echo.
echo ============================================================
echo   BUILD COMPLETATO!
echo.
echo   Pacchetto in: %PKG_DIR%
echo.
echo   DEPLOYMENT SUL SERVER:
echo   1. Copia "package\" in C:\Elettroquadri\
echo   2. Sul server: cd C:\Elettroquadri\iis
echo      configura_reverse_proxy.bat  (admin)
echo   3. Sul server: cd C:\Elettroquadri
echo      install_service.bat  (admin)
echo   4. Browser: https://tuo-sottodominio
echo ============================================================
pause
