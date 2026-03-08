"""
server_prod.py - Launcher di produzione per Configuratore Elettroquadri
Esegue FastAPI + serve frontend React build come file statici.
Configurazione da config.ini nella stessa cartella dell'exe.

Sicurezza:
- Swagger/ReDoc disabilitati in produzione
- Security headers su ogni risposta
- Rate limiting su login
- Binding su 127.0.0.1 (solo IIS ci arriva)
- Trusted Host middleware
"""
import sys
import os
import configparser
import logging
import time
from collections import defaultdict
from pathlib import Path

# ── Determina cartella base (dove sta l'exe o lo script) ──
if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).parent

os.chdir(BASE_DIR)

# ── Logging ──
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "server.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("elettroquadri")

# ── Configurazione ──
config = configparser.ConfigParser()
config_file = BASE_DIR / "config.ini"

if not config_file.exists():
    config["server"] = {
        "host": "127.0.0.1",
        "port": "8080",
        "workers": "1",
    }
    config["database"] = {
        "type": "sqlite",
        "sqlite_path": "elettroquadri.db",
        "mssql_server": "localhost",
        "mssql_database": "elettroquadri",
        "mssql_username": "sa",
        "mssql_password": "",
        "mssql_driver": "ODBC Driver 17 for SQL Server",
    }
    config["app"] = {
        "debug": "false",
        "secret_key": "CAMBIARE-QUESTA-CHIAVE-IN-PRODUZIONE",
        "allowed_origins": "*",
    }
    config["security"] = {
        # true = disabilita /docs e /redoc
        "disable_swagger": "true",
        # Rate limiting login: max tentativi per finestra temporale
        "login_rate_limit_max": "5",
        "login_rate_limit_window_seconds": "300",
        # Dominio consentito (per Trusted Host middleware)
        # Lasciare vuoto per disabilitare il controllo
        "trusted_host": "",
        # Header HSTS max-age in secondi (31536000 = 1 anno)
        "hsts_max_age": "31536000",
    }
    with open(config_file, "w") as f:
        config.write(f)
    logger.info(f"Creato config.ini di default in {config_file}")
else:
    config.read(config_file, encoding="utf-8")

# ── Configura database PRIMA di importare main ──
db_type = config.get("database", "type", fallback="sqlite")

if db_type == "sqlite":
    db_path = config.get("database", "sqlite_path", fallback="elettroquadri.db")
    if not os.path.isabs(db_path):
        db_path = str(BASE_DIR / db_path)
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
elif db_type == "mssql":
    server = config.get("database", "mssql_server")
    database = config.get("database", "mssql_database")
    username = config.get("database", "mssql_username")
    password = config.get("database", "mssql_password")
    driver = config.get("database", "mssql_driver", fallback="ODBC Driver 17 for SQL Server")
    driver_encoded = driver.replace(" ", "+")
    os.environ["DATABASE_URL"] = (
        f"mssql+pyodbc://{username}:{password}@{server}/{database}"
        f"?driver={driver_encoded}&TrustServerCertificate=yes"
    )

os.environ["SECRET_KEY"] = config.get("app", "secret_key", fallback="default-secret")

# ── Parametri sicurezza ──
debug_mode = config.getboolean("app", "debug", fallback=False)
disable_swagger = config.getboolean("security", "disable_swagger", fallback=True)
rate_limit_max = config.getint("security", "login_rate_limit_max", fallback=5)
rate_limit_window = config.getint("security", "login_rate_limit_window_seconds", fallback=300)
trusted_host = config.get("security", "trusted_host", fallback="").strip()
hsts_max_age = config.getint("security", "hsts_max_age", fallback=31536000)

# ── Patch database ──
import database as db_module
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./elettroquadri.db")

if "sqlite" in DATABASE_URL:
    db_module.engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    db_module.engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)

db_module.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db_module.engine)

# ── Importa app FastAPI ──
from main import app  # noqa: E402
from models import Base

Base.metadata.create_all(bind=db_module.engine)

# ══════════════════════════════════════════════════════════════
#  SICUREZZA
# ══════════════════════════════════════════════════════════════

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

# ── 1. Disabilita Swagger/ReDoc in produzione ──
if disable_swagger and not debug_mode:
    app.openapi_url = None      # Disabilita /openapi.json
    app.docs_url = None          # Disabilita /docs
    app.redoc_url = None         # Disabilita /redoc
    logger.info("Swagger/ReDoc DISABILITATI (produzione)")

# ── 2. Rate Limiting sul login ──
class LoginRateLimiter:
    """Limita i tentativi di login per IP"""
    def __init__(self, max_attempts: int = 5, window_seconds: int = 300):
        self.max_attempts = max_attempts
        self.window = window_seconds
        # {ip: [(timestamp, success), ...]}
        self.attempts = defaultdict(list)

    def _cleanup(self, ip: str):
        """Rimuove tentativi scaduti"""
        cutoff = time.time() - self.window
        self.attempts[ip] = [a for a in self.attempts[ip] if a[0] > cutoff]

    def is_blocked(self, ip: str) -> bool:
        self._cleanup(ip)
        failed = [a for a in self.attempts[ip] if not a[1]]
        return len(failed) >= self.max_attempts

    def record_attempt(self, ip: str, success: bool):
        self._cleanup(ip)
        self.attempts[ip].append((time.time(), success))
        if not success:
            failed_count = len([a for a in self.attempts[ip] if not a[1]])
            if failed_count >= self.max_attempts:
                logger.warning(f"[SECURITY] IP {ip} bloccato dopo {failed_count} tentativi login falliti")

    def get_remaining(self, ip: str) -> int:
        self._cleanup(ip)
        failed = [a for a in self.attempts[ip] if not a[1]]
        return max(0, self.max_attempts - len(failed))

    def get_retry_after(self, ip: str) -> int:
        """Secondi rimanenti prima che il blocco scada"""
        self._cleanup(ip)
        if not self.attempts[ip]:
            return 0
        oldest_failed = min((a[0] for a in self.attempts[ip] if not a[1]), default=0)
        return max(0, int(self.window - (time.time() - oldest_failed)))


login_limiter = LoginRateLimiter(max_attempts=rate_limit_max, window_seconds=rate_limit_window)


# ── 3. Security Headers Middleware ──
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Estrai IP reale (dietro IIS reverse proxy)
        client_ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        if not client_ip:
            client_ip = request.client.host if request.client else "unknown"

        # ── Rate limiting su endpoint login ──
        if request.url.path in ("/token", "/login", "/api/token", "/api/login"):
            if request.method == "POST":
                if login_limiter.is_blocked(client_ip):
                    retry_after = login_limiter.get_retry_after(client_ip)
                    logger.warning(f"[RATE-LIMIT] Richiesta login bloccata da IP {client_ip}")
                    return JSONResponse(
                        status_code=429,
                        content={
                            "detail": f"Troppi tentativi di login. Riprova tra {retry_after} secondi."
                        },
                        headers={"Retry-After": str(retry_after)}
                    )

        # ── Processa la richiesta ──
        response = await call_next(request)

        # ── Registra risultato login ──
        if request.url.path in ("/token", "/login", "/api/token", "/api/login"):
            if request.method == "POST":
                success = 200 <= response.status_code < 300
                login_limiter.record_attempt(client_ip, success)
                if not success:
                    remaining = login_limiter.get_remaining(client_ip)
                    response.headers["X-RateLimit-Remaining"] = str(remaining)

        # ── Security Headers ──
        # Previene clickjacking
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        # Previene MIME-type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        # Controlla referrer
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Previene XSS (legacy, ma non costa nulla)
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # Permissions policy
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        # HSTS - dice al browser di usare SEMPRE https
        if hsts_max_age > 0:
            response.headers["Strict-Transport-Security"] = f"max-age={hsts_max_age}; includeSubDomains"
        # Nasconde tecnologia server
        response.headers["X-Powered-By"] = ""
        response.headers["Server"] = "Elettroquadri"

        return response

app.add_middleware(SecurityHeadersMiddleware)

# ── 4. Trusted Host Middleware (opzionale) ──
if trusted_host:
    from starlette.middleware.trustedhost import TrustedHostMiddleware
    hosts = [h.strip() for h in trusted_host.split(",")]
    # Aggiungi localhost per accesso locale
    hosts.extend(["localhost", "127.0.0.1"])
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts)
    logger.info(f"Trusted hosts: {hosts}")

# ── 5. Aggiorna CORS per produzione ──
from fastapi.middleware.cors import CORSMiddleware

allowed_origins_str = config.get("app", "allowed_origins", fallback="*")
if allowed_origins_str.strip() == "*":
    allowed_origins = ["*"]
else:
    allowed_origins = [o.strip() for o in allowed_origins_str.split(",")]

new_middleware = []
for m in app.user_middleware:
    if m.cls != CORSMiddleware:
        new_middleware.append(m)
app.user_middleware = new_middleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 6. Endpoint health check (utile per IIS health probe) ──
@app.get("/health", include_in_schema=False, tags=["system"])
async def health_check():
    return {"status": "ok", "timestamp": time.time()}

# ── Serve frontend React (build statico) ──
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

WEB_DIR = BASE_DIR / "web"

if WEB_DIR.exists() and (WEB_DIR / "index.html").exists():
    assets_dir = WEB_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="static-assets")

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon():
        fav = WEB_DIR / "favicon.ico"
        if fav.exists():
            return FileResponse(str(fav))
        return FileResponse(str(WEB_DIR / "index.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        file_path = WEB_DIR / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(WEB_DIR / "index.html"))

    logger.info(f"Frontend servito da {WEB_DIR}")
else:
    logger.warning(f"Cartella web/ non trovata in {WEB_DIR} - solo API disponibile")

# ── Avvio server ──
def main():
    import uvicorn

    host = config.get("server", "host", fallback="127.0.0.1")
    port = config.getint("server", "port", fallback=8080)
    workers = config.getint("server", "workers", fallback=1)

    logger.info("=" * 60)
    logger.info("  Configuratore Elettroquadri - Server di Produzione")
    logger.info(f"  Database: {db_type}")
    logger.info(f"  Bind: {host}:{port}")
    logger.info(f"  Frontend: {'web/' if WEB_DIR.exists() else 'NON DISPONIBILE'}")
    logger.info(f"  Swagger: {'ABILITATO' if debug_mode or not disable_swagger else 'DISABILITATO'}")
    logger.info(f"  Rate limit login: {rate_limit_max} tentativi / {rate_limit_window}s")
    if trusted_host:
        logger.info(f"  Trusted hosts: {trusted_host}")
    logger.info("=" * 60)

    uvicorn.run(
        app,
        host=host,
        port=port,
        workers=workers if not debug_mode else 1,
        log_level="info" if debug_mode else "warning",
        access_log=debug_mode,
        # Non servire header Server di uvicorn
        server_header=False,
        # Trusted proxy headers (IIS manda X-Forwarded-*)
        forwarded_allow_ips="127.0.0.1",
        proxy_headers=True,
    )

if __name__ == "__main__":
    main()
