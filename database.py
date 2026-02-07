"""
database.py - Database configuration
"""
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# SQLite database (demo)
SQLALCHEMY_DATABASE_URL = "sqlite:///./elettroquadri_demo.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}  # Needed for SQLite
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
