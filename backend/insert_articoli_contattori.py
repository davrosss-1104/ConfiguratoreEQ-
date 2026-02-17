"""
insert_articoli_contattori.py
Inserisce nel database gli articoli (componenti) usati dalle regole
di selezione contattori oleodinamici.

Schema tabella articoli:
  id, codice, descrizione, descrizione_estesa, tipo_articolo, categoria_id,
  costo_fisso, costo_variabile_1..4, unita_misura, fornitore, is_active, ...

CATEGORIE USATE (esistenti o da creare):
  - COMPONENTI (id=2) → Contattori
  - CAVI (id=1)       → Cablaggio (filo)
  - MOTORI (id=4)     → Soft Starter
  + MORSETTERIA (new) → Morsetti

ESECUZIONE:
  cd backend/
  python insert_articoli_contattori.py
"""

import sqlite3
import os
from datetime import datetime

DB_PATH = os.environ.get("DB_PATH", "./configuratore.db")


def run_insert():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print("=" * 60)
    print("INSERIMENTO ARTICOLI CONTATTORI OLEODINAMICI")
    print("=" * 60)

    # ================================================================
    # 1. VERIFICA/CREA CATEGORIA MORSETTERIA
    # ================================================================
    c.execute("SELECT id FROM categorie_articoli WHERE codice = 'MORSETTERIA'")
    row = c.fetchone()
    if row:
        cat_morsetteria = row[0]
        print(f"  ⏭️  Categoria MORSETTERIA già esistente (id={cat_morsetteria})")
    else:
        c.execute(
            "INSERT INTO categorie_articoli (codice, nome, ordine) VALUES (?, ?, ?)",
            ("MORSETTERIA", "Morsetteria", 8),
        )
        cat_morsetteria = c.lastrowid
        print(f"  ✅ Categoria creata: MORSETTERIA (id={cat_morsetteria})")

    # Mappa categorie esistenti
    CAT = {
        "COMPONENTI": 2,     # Contattori
        "CAVI": 1,           # Filo
        "MOTORI": 4,         # Soft Starter
        "MORSETTERIA": cat_morsetteria,
    }

    # ================================================================
    # 2. DEFINIZIONE ARTICOLI
    # ================================================================
    # Formato: (codice, descrizione, descrizione_estesa, tipo_articolo,
    #           categoria_codice, costo_fisso, unita_misura, fornitore)

    articoli = [
        # --- CONTATTORI SCHNEIDER (serie TeSys D) ---
        ("CONT-D12-KM",  "Contattore D12 marcia (KM)",   "Contattore Schneider LC1D12 12A 3P, bobina 230Vac",  "contattore", "COMPONENTI", 25.00, "pz", "Schneider Electric"),
        ("CONT-D12-KS",  "Contattore D12 stella (KS)",   "Contattore Schneider LC1D12 12A 3P, bobina 230Vac",  "contattore", "COMPONENTI", 25.00, "pz", "Schneider Electric"),
        ("CONT-D18-KM",  "Contattore D18 marcia (KM)",   "Contattore Schneider LC1D18 18A 3P, bobina 230Vac",  "contattore", "COMPONENTI", 28.00, "pz", "Schneider Electric"),
        ("CONT-D18-KS",  "Contattore D18 stella (KS)",   "Contattore Schneider LC1D18 18A 3P, bobina 230Vac",  "contattore", "COMPONENTI", 28.00, "pz", "Schneider Electric"),
        ("CONT-D25-KM",  "Contattore D25 marcia (KM)",   "Contattore Schneider LC1D25 25A 3P, bobina 230Vac",  "contattore", "COMPONENTI", 35.00, "pz", "Schneider Electric"),
        ("CONT-D25-KS",  "Contattore D25 stella (KS)",   "Contattore Schneider LC1D25 25A 3P, bobina 230Vac",  "contattore", "COMPONENTI", 35.00, "pz", "Schneider Electric"),
        ("CONT-D32-KM",  "Contattore D32 marcia (KM)",   "Contattore Schneider LC1D32 32A 3P, bobina 230Vac",  "contattore", "COMPONENTI", 42.00, "pz", "Schneider Electric"),
        ("CONT-D32-KS",  "Contattore D32 stella (KS)",   "Contattore Schneider LC1D32 32A 3P, bobina 230Vac",  "contattore", "COMPONENTI", 42.00, "pz", "Schneider Electric"),
        ("CONT-D50-KM",  "Contattore D50 marcia (KM)",   "Contattore Schneider LC1D50 50A 3P, bobina 230Vac",  "contattore", "COMPONENTI", 78.00, "pz", "Schneider Electric"),
        ("CONT-D50-KS",  "Contattore D50 stella (KS)",   "Contattore Schneider LC1D50 50A 3P, bobina 230Vac",  "contattore", "COMPONENTI", 78.00, "pz", "Schneider Electric"),
        ("CONT-D80-KM",  "Contattore D80 marcia (KM)",   "Contattore Schneider LC1D80 80A 3P, bobina 230Vac",  "contattore", "COMPONENTI", 135.00, "pz", "Schneider Electric"),
        ("CONT-D80-KS",  "Contattore D80 stella (KS)",   "Contattore Schneider LC1D80 80A 3P, bobina 230Vac",  "contattore", "COMPONENTI", 135.00, "pz", "Schneider Electric"),
        ("CONT-D95-KM",  "Contattore D95 marcia (KM)",   "Contattore Schneider LC1D95 95A 3P, bobina 230Vac",  "contattore", "COMPONENTI", 165.00, "pz", "Schneider Electric"),
        ("CONT-D95-KS",  "Contattore D95 stella (KS)",   "Contattore Schneider LC1D95 95A 3P, bobina 230Vac",  "contattore", "COMPONENTI", 165.00, "pz", "Schneider Electric"),
        ("CONT-D115-KM", "Contattore D115 marcia (KM)",  "Contattore Schneider LC1D115 115A 3P, bobina 230Vac", "contattore", "COMPONENTI", 210.00, "pz", "Schneider Electric"),
        ("CONT-D115-KS", "Contattore D115 stella (KS)",  "Contattore Schneider LC1D115 115A 3P, bobina 230Vac", "contattore", "COMPONENTI", 210.00, "pz", "Schneider Electric"),
        ("CONT-D150-KM", "Contattore D150 marcia (KM)",  "Contattore Schneider LC1D150 150A 3P, bobina 230Vac", "contattore", "COMPONENTI", 280.00, "pz", "Schneider Electric"),
        ("CONT-D150-KS", "Contattore D150 stella (KS)",  "Contattore Schneider LC1D150 150A 3P, bobina 230Vac", "contattore", "COMPONENTI", 280.00, "pz", "Schneider Electric"),

        # --- SOFT STARTER ---
        ("SS-V40",  "Soft Starter 40A",   "Soft Starter Schneider ATS22 40A 400V trifase",  "soft_starter", "MOTORI", 450.00, "pz", "Schneider Electric"),
        ("SS-V70",  "Soft Starter 70A",   "Soft Starter Schneider ATS22 70A 400V trifase",  "soft_starter", "MOTORI", 680.00, "pz", "Schneider Electric"),
        ("SS-V105", "Soft Starter 105A",  "Soft Starter Schneider ATS22 105A 400V trifase", "soft_starter", "MOTORI", 950.00, "pz", "Schneider Electric"),
        ("SS-V150", "Soft Starter 150A",  "Soft Starter Schneider ATS22 150A 400V trifase", "soft_starter", "MOTORI", 1350.00, "pz", "Schneider Electric"),

        # --- MORSETTERIA ---
        ("MORS-10MM2-RST", "Morsetti 10mm² linea R-S-T",   "Morsetti componibili 10mm² per linea alimentazione R-S-T", "morsetto", "MORSETTERIA", 2.50, "pz", None),
        ("MORS-10MM2-UVW", "Morsetti 10mm² motore U-V-W",  "Morsetti componibili 10mm² per uscita motore U-V-W",       "morsetto", "MORSETTERIA", 2.50, "pz", None),
        ("MORS-16MM2-RST", "Morsetti 16mm² linea R-S-T",   "Morsetti componibili 16mm² per linea alimentazione R-S-T", "morsetto", "MORSETTERIA", 3.50, "pz", None),
        ("MORS-16MM2-UVW", "Morsetti 16mm² motore U-V-W",  "Morsetti componibili 16mm² per uscita motore U-V-W",       "morsetto", "MORSETTERIA", 3.50, "pz", None),
        ("MORS-35MM2-RST", "Morsetti 35mm² linea R-S-T",   "Morsetti componibili 35mm² per linea alimentazione R-S-T", "morsetto", "MORSETTERIA", 5.80, "pz", None),
        ("MORS-35MM2-UVW", "Morsetti 35mm² motore U-V-W",  "Morsetti componibili 35mm² per uscita motore U-V-W",       "morsetto", "MORSETTERIA", 5.80, "pz", None),

        # --- CABLAGGIO (Filo) ---
        ("FILO-2.5MM2-RST", "Filo 2.5mm² linea R-S-T",  "Filo unipolare 2.5mm² per linea alimentazione R-S-T", "filo", "CAVI", 0.85, "mt", None),
        ("FILO-2.5MM2-UVW", "Filo 2.5mm² motore U-V-W", "Filo unipolare 2.5mm² per uscita motore U-V-W",       "filo", "CAVI", 0.85, "mt", None),
        ("FILO-4MM2-RST",   "Filo 4mm² linea R-S-T",    "Filo unipolare 4mm² per linea alimentazione R-S-T",   "filo", "CAVI", 1.20, "mt", None),
        ("FILO-4MM2-UVW",   "Filo 4mm² motore U-V-W",   "Filo unipolare 4mm² per uscita motore U-V-W",         "filo", "CAVI", 1.20, "mt", None),
        ("FILO-6MM2-RST",   "Filo 6mm² linea R-S-T",    "Filo unipolare 6mm² per linea alimentazione R-S-T",   "filo", "CAVI", 1.80, "mt", None),
        ("FILO-6MM2-UVW",   "Filo 6mm² motore U-V-W",   "Filo unipolare 6mm² per uscita motore U-V-W",         "filo", "CAVI", 1.80, "mt", None),
        ("FILO-10MM2-RST",  "Filo 10mm² linea R-S-T",   "Filo unipolare 10mm² per linea alimentazione R-S-T",  "filo", "CAVI", 3.20, "mt", None),
        ("FILO-10MM2-UVW",  "Filo 10mm² motore U-V-W",  "Filo unipolare 10mm² per uscita motore U-V-W",        "filo", "CAVI", 3.20, "mt", None),
        ("FILO-16MM2-RST",  "Filo 16mm² linea R-S-T",   "Filo unipolare 16mm² per linea alimentazione R-S-T",  "filo", "CAVI", 4.50, "mt", None),
        ("FILO-16MM2-UVW",  "Filo 16mm² motore U-V-W",  "Filo unipolare 16mm² per uscita motore U-V-W",        "filo", "CAVI", 4.50, "mt", None),
    ]

    # ================================================================
    # 3. INSERIMENTO
    # ================================================================
    inseriti = 0
    esistenti = 0

    for codice, desc, desc_ext, tipo, cat_codice, costo, um, fornitore in articoli:
        c.execute("SELECT id FROM articoli WHERE codice = ?", (codice,))
        if c.fetchone():
            esistenti += 1
            continue

        cat_id = CAT[cat_codice]

        c.execute(
            """INSERT INTO articoli
               (codice, descrizione, descrizione_estesa, tipo_articolo,
                categoria_id, costo_fisso, unita_misura, fornitore,
                is_active, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)""",
            (codice, desc, desc_ext, tipo, cat_id, costo, um, fornitore, now, now),
        )
        inseriti += 1

    conn.commit()
    conn.close()

    print(f"\n✅ Articoli inseriti: {inseriti}")
    if esistenti:
        print(f"⏭️  Articoli già esistenti: {esistenti}")
    print(f"\nRiepilogo:")
    print(f"  Contattori:   18 (D12→D150, varianti KM/KS) → cat COMPONENTI")
    print(f"  Soft Starter:  4 (V40, V70, V105, V150)      → cat MOTORI")
    print(f"  Morsetteria:   6 (10, 16, 35 mm²)            → cat MORSETTERIA")
    print(f"  Cablaggio:    10 (2.5→16 mm²)                → cat CAVI")
    print(f"\n⚠️  I prezzi (costo_fisso) sono indicativi. Aggiornare con listini reali!")


if __name__ == "__main__":
    run_insert()
