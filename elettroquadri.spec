# -*- mode: python ; coding: utf-8 -*-
"""
elettroquadri.spec - PyInstaller build spec
Eseguire dalla ROOT del progetto (1.0\):
    pyinstaller elettroquadri.spec --distpath dist_server --workpath build_server
"""
import os

block_cipher = None

ROOT_DIR = os.path.abspath('.')
BACKEND_DIR = os.path.join(ROOT_DIR, 'backend')

hidden_imports = [
    'uvicorn',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'uvicorn.lifespan.off',
    'fastapi',
    'starlette',
    'starlette.responses',
    'starlette.routing',
    'starlette.middleware',
    'starlette.middleware.cors',
    'starlette.middleware.trustedhost',
    'sqlalchemy',
    'sqlalchemy.dialects.sqlite',
    'sqlalchemy.dialects.mssql',
    'sqlalchemy.dialects.mssql.pyodbc',
    'pydantic',
    'pydantic_core',
    'multipart',
    'python_multipart',
    'email_validator',
    'passlib',
    'passlib.handlers',
    'passlib.handlers.bcrypt',
    'bcrypt',
    'jose',
    'jose.jwt',
    'python_jose',
    'openpyxl',
    'docx',
    'anyio',
    'anyio._backends',
    'anyio._backends._asyncio',
    'sniffio',
    'httptools',
    'websockets',
    'dotenv',
    'h11',
    'click',
    'colorama',
    'annotated_types',
    'typing_extensions',
]

# Dati da includere nel pacchetto
datas = []

# Rules JSON
rules_dir = os.path.join(BACKEND_DIR, 'rules')
if os.path.exists(rules_dir):
    datas.append((rules_dir, 'rules'))

# Data JSON
data_dir = os.path.join(BACKEND_DIR, 'data')
if os.path.exists(data_dir):
    datas.append((data_dir, 'data'))

# Templates docx
templates_dir = os.path.join(BACKEND_DIR, 'templates')
if os.path.exists(templates_dir):
    datas.append((templates_dir, 'templates'))

# Logo
logo = os.path.join(BACKEND_DIR, 'logo_elettroquadri.png')
if os.path.exists(logo):
    datas.append((logo, '.'))

a = Analysis(
    # Entry point: server_prod.py nella cartella backend/
    [os.path.join(BACKEND_DIR, 'server_prod.py')],
    # pathex: backend/ così trova tutti i moduli (main.py, models.py ecc.)
    pathex=[BACKEND_DIR],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter', 'matplotlib', 'numpy', 'scipy', 'pandas',
        'PIL', 'cv2', 'torch', 'tensorflow',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='ElettroquadriServer',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='ElettroquadriServer',
)
