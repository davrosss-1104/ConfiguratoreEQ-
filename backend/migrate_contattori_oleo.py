"""
migrate_contattori_oleo.py
Migrazione per aggiungere i campi di input necessari alla selezione contattori
per impianti oleodinamici.

NUOVI CAMPI:
  1. argano.tipo_avviamento_motore  (dropdown) - Diretto / Stella-Triangolo / Soft Starter
  2. tensioni.frequenza_rete        (dropdown) - 50 Hz / 60 Hz

NUOVE OPZIONI DROPDOWN:
  - tipo_avviamento_motore: diretto, stella_triangolo, soft_starter
  - frequenza_rete: 50, 60

ESECUZIONE:
  cd backend/
  python migrate_contattori_oleo.py
"""

import sqlite3
import os
from datetime import datetime

DB_PATH = os.environ.get("DB_PATH", "./configuratore.db")


def run_migration():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print("=" * 60)
    print("MIGRAZIONE: Campi input selezione contattori oleodinamici")
    print("=" * 60)

    # ================================================================
    # 1. NUOVI CAMPI per campi_configuratore
    # ================================================================
    nuovi_campi = [
        {
            "codice": "argano.tipo_avviamento_motore",
            "etichetta": "Tipo Avviamento Motore",
            "tipo": "dropdown",
            "sezione": "argano",
            "gruppo_dropdown": "tipo_avviamento_motore",
            "unita_misura": None,
            "valore_min": None,
            "valore_max": None,
            "valore_default": "diretto",
            "descrizione": "Tipo di avviamento motore centralina oleodinamica",
            "obbligatorio": True,
            "ordine": 35,
            "attivo": True,
            "visibile_form": True,
            "usabile_regole": True,
        },
        {
            "codice": "tensioni.frequenza_rete",
            "etichetta": "Frequenza Rete",
            "tipo": "dropdown",
            "sezione": "tensioni",
            "gruppo_dropdown": "frequenza_rete",
            "unita_misura": "Hz",
            "valore_min": None,
            "valore_max": None,
            "valore_default": "50",
            "descrizione": "Frequenza di rete (50 Hz Italia/Europa, 60 Hz export)",
            "obbligatorio": True,
            "ordine": 5,
            "attivo": True,
            "visibile_form": True,
            "usabile_regole": True,
        },
    ]

    for campo in nuovi_campi:
        c.execute(
            "SELECT id FROM campi_configuratore WHERE codice = ?",
            (campo["codice"],),
        )
        if c.fetchone():
            print(f"  ⏭️  Campo già esistente: {campo['codice']}")
            continue

        c.execute(
            """
            INSERT INTO campi_configuratore 
            (codice, etichetta, tipo, sezione, gruppo_dropdown, unita_misura,
             valore_min, valore_max, valore_default, descrizione,
             obbligatorio, ordine, attivo, visibile_form, usabile_regole,
             created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                campo["codice"],
                campo["etichetta"],
                campo["tipo"],
                campo["sezione"],
                campo["gruppo_dropdown"],
                campo["unita_misura"],
                campo["valore_min"],
                campo["valore_max"],
                campo["valore_default"],
                campo["descrizione"],
                campo["obbligatorio"],
                campo["ordine"],
                campo["attivo"],
                campo["visibile_form"],
                campo["usabile_regole"],
                now,
                now,
            ),
        )
        print(f"  ✅ Campo aggiunto: {campo['codice']} ({campo['etichetta']})")

    # ================================================================
    # 2. OPZIONI DROPDOWN
    # ================================================================
    opzioni = [
        # Tipo Avviamento Motore
        ("tipo_avviamento_motore", "diretto", "Avviamento Diretto", 1),
        ("tipo_avviamento_motore", "stella_triangolo", "Avviamento Stella-Triangolo", 2),
        ("tipo_avviamento_motore", "soft_starter", "Avviamento Soft Starter", 3),
        # Frequenza Rete
        ("frequenza_rete", "50", "50 Hz (400V)", 1),
        ("frequenza_rete", "60", "60 Hz (440V)", 2),
    ]

    for gruppo, valore, etichetta, ordine in opzioni:
        c.execute(
            "SELECT id FROM opzioni_dropdown WHERE gruppo = ? AND valore = ?",
            (gruppo, valore),
        )
        if c.fetchone():
            print(f"  ⏭️  Opzione già esistente: {gruppo}.{valore}")
            continue

        c.execute(
            """
            INSERT INTO opzioni_dropdown
            (gruppo, valore, etichetta, ordine, attivo, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, ?)
        """,
            (gruppo, valore, etichetta, ordine, now, now),
        )
        print(f"  ✅ Opzione: {gruppo} → {etichetta}")

    # ================================================================
    # 3. COLONNA nella tabella argano (ORM dedicato)
    # ================================================================
    try:
        c.execute("PRAGMA table_info(argano)")
        colonne = [col[1] for col in c.fetchall()]

        if "tipo_avviamento_motore" not in colonne:
            c.execute(
                "ALTER TABLE argano ADD COLUMN tipo_avviamento_motore VARCHAR(100) DEFAULT 'diretto'"
            )
            print("  ✅ Colonna aggiunta: argano.tipo_avviamento_motore")
        else:
            print("  ⏭️  Colonna già esistente: argano.tipo_avviamento_motore")
    except Exception as e:
        print(f"  ⚠️  Tabella argano: {e}")
        print("     → Il campo sarà gestito via valori_configurazione")

    conn.commit()
    conn.close()

    print("\n" + "=" * 60)
    print("MIGRAZIONE COMPLETATA")
    print("=" * 60)
    print("\nCampi di input per selezione contattori oleodinamici:")
    print("  1. argano.tipo_avviamento_motore → Argano, dropdown")
    print("     Valori: diretto | stella_triangolo | soft_starter")
    print("  2. tensioni.frequenza_rete → Tensioni, dropdown")
    print("     Valori: 50 (400V) | 60 (440V)")
    print("\nCampi GIÀ ESISTENTI usati dalle regole:")
    print("  3. argano.potenza_motore_kw → Argano (numero)")
    print("  4. argano.trazione → Argano (dropdown, condizione: oleodinamica)")


if __name__ == "__main__":
    run_migration()
