@echo off
echo ========================================
echo SETUP BACKEND CONFIGURATORE 1.0
echo ========================================
echo.

REM Vai alla directory backend
cd /d C:\Users\david\Desktop\Python\ConfiguratoreEQ\1.0\backend

echo [1/5] Copio main.py aggiornato...
copy /Y C:\Users\david\Desktop\Python\ConfiguratoreEQ\outputs\main.py main.py
if errorlevel 1 (
    echo ERRORE: Impossibile copiare main.py
    pause
    exit /b 1
)
echo OK - main.py copiato

echo.
echo [2/5] Creo directory rules/...
if not exist rules mkdir rules
echo OK - Directory rules/ creata

echo.
echo [3/5] Copio regole JSON...
copy /Y C:\Users\david\Desktop\Python\ConfiguratoreEQ\outputs\rule_en81_20.json rules\rule_en81_20.json
copy /Y C:\Users\david\Desktop\Python\ConfiguratoreEQ\outputs\rule_gearless_mrl.json rules\rule_gearless_mrl.json
if errorlevel 1 (
    echo ERRORE: Impossibile copiare regole
    pause
    exit /b 1
)
echo OK - Regole copiate in rules/

echo.
echo [4/5] Attivo virtual environment...
call venv\Scripts\activate.bat
if errorlevel 1 (
    echo ERRORE: Virtual environment non trovato
    echo Esegui prima: python -m venv venv
    pause
    exit /b 1
)
echo OK - Virtual environment attivo

echo.
echo [5/5] Avvio server...
echo.
echo ========================================
echo SERVER IN AVVIO
echo ========================================
echo API: http://localhost:8000
echo Docs: http://localhost:8000/docs
echo.
python main.py

pause
