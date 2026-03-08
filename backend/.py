import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import engine

print("DB URL:", engine.url)

import sqlite3
db_path = str(engine.url).replace("sqlite:///", "").replace("sqlite://", "")
print("DB path resolved:", db_path)
print("File exists:", os.path.exists(db_path))

conn = sqlite3.connect(db_path)
cols = [r[1] for r in conn.execute("PRAGMA table_info(preventivi)")]
print("Colonne preventivi:", cols)
conn.close()
