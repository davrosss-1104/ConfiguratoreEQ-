"""
database.py - Database configuration
Supporta SQLite e SQL Server via variabile d'ambiente DATABASE_URL
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Legge URL da env (impostato da server_prod.py) o usa SQLite di default
SQLALCHEMY_DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "sqlite:///./elettroquadri_demo.db"
)

if "sqlite" in SQLALCHEMY_DATABASE_URL:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency per ottenere sessione database"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Inizializza database creando tutte le tabelle"""
    from models import User, Cliente, Preventivo, Materiale, Regola
    Base.metadata.create_all(bind=engine)
