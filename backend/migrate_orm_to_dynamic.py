"""
migrate_orm_to_dynamic.py
Migra 4 sezioni ORM (dati_principali, normative, argano, porte) a valori_configurazione.

1. Crea sezioni in sezioni_configuratore (se non esistono)
2. Crea campi in campi_configuratore per ogni colonna ORM
3. Copia valori esistenti da tabelle ORM → valori_configurazione
4. NON elimina le tabelle ORM (backward compat)

Eseguire UNA SOLA VOLTA prima di deployare il nuovo codice.
"""
import sqlite3
import json
import os
import shutil
from datetime import datetime

DB_PATH = "configuratore.db"
BACKUP_SUFFIX = f"_backup_migrate_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

# Definizione sezioni da migrare
SEZIONI_DA_MIGRARE = {
    "dati_principali": {
        "etichetta": "Dati Principali",
        "ordine": 20,
        "icona": "Settings",
        "campi": {
            "tipo_impianto":            {"etichetta": "Tipo Impianto",              "tipo": "dropdown", "ordine": 10},
            "nuovo_impianto":           {"etichetta": "Nuovo Impianto",             "tipo": "checkbox", "ordine": 20},
            "numero_fermate":           {"etichetta": "Numero Fermate",             "tipo": "numero",   "ordine": 30},
            "numero_servizi":           {"etichetta": "Numero Servizi",             "tipo": "numero",   "ordine": 40},
            "velocita":                 {"etichetta": "Velocità (m/s)",             "tipo": "numero",   "ordine": 50},
            "corsa":                    {"etichetta": "Corsa (m)",                  "tipo": "numero",   "ordine": 60},
            "con_locale_macchina":      {"etichetta": "Con Locale Macchina",        "tipo": "checkbox", "ordine": 70},
            "posizione_locale_macchina":{"etichetta": "Posizione Locale Macchina",  "tipo": "dropdown", "ordine": 80},
            "tipo_trazione":            {"etichetta": "Tipo Trazione",              "tipo": "dropdown", "ordine": 90},
            "forza_motrice":            {"etichetta": "Forza Motrice",              "tipo": "dropdown", "ordine": 100},
            "luce":                     {"etichetta": "Luce",                       "tipo": "dropdown", "ordine": 110},
            "tensione_manovra":         {"etichetta": "Tensione Manovra",           "tipo": "dropdown", "ordine": 120},
            "tensione_freno":           {"etichetta": "Tensione Freno",             "tipo": "dropdown", "ordine": 130},
        }
    },
    "normative": {
        "etichetta": "Normative",
        "ordine": 30,
        "icona": "Shield",
        "campi": {
            "en_81_1":          {"etichetta": "EN 81-1",            "tipo": "dropdown",  "ordine": 10},
            "en_81_20":         {"etichetta": "EN 81-20",           "tipo": "dropdown",  "ordine": 20},
            "en_81_21":         {"etichetta": "EN 81-21",           "tipo": "dropdown",  "ordine": 30},
            "en_81_28":         {"etichetta": "EN 81-28",           "tipo": "checkbox",  "ordine": 40},
            "en_81_70":         {"etichetta": "EN 81-70",           "tipo": "checkbox",  "ordine": 50},
            "en_81_72":         {"etichetta": "EN 81-72",           "tipo": "checkbox",  "ordine": 60},
            "en_81_73":         {"etichetta": "EN 81-73",           "tipo": "checkbox",  "ordine": 70},
            "a3_95_16":         {"etichetta": "A3 95/16",           "tipo": "checkbox",  "ordine": 80},
            "dm236_legge13":    {"etichetta": "DM236 Legge 13",     "tipo": "checkbox",  "ordine": 90},
            "emendamento_a3":   {"etichetta": "Emendamento A3",     "tipo": "checkbox",  "ordine": 100},
            "uni_10411_1":      {"etichetta": "UNI 10411-1",        "tipo": "checkbox",  "ordine": 110},
        }
    },
    "argano": {
        "etichetta": "Argano / Motore",
        "ordine": 50,
        "icona": "Cog",
        "campi": {
            "trazione":                 {"etichetta": "Trazione",               "tipo": "dropdown", "ordine": 10},
            "potenza_motore_kw":        {"etichetta": "Potenza Motore (kW)",    "tipo": "numero",   "ordine": 20},
            "corrente_nom_motore_amp":  {"etichetta": "Corrente Nom. (A)",      "tipo": "numero",   "ordine": 30},
            "tipo_vvvf":               {"etichetta": "Tipo VVVF",              "tipo": "dropdown", "ordine": 40},
            "vvvf_nel_vano":           {"etichetta": "VVVF nel Vano",          "tipo": "checkbox", "ordine": 50},
            "freno_tensione":          {"etichetta": "Tensione Freno",         "tipo": "dropdown", "ordine": 60},
            "ventilazione_forzata":    {"etichetta": "Ventilazione Forzata",   "tipo": "dropdown", "ordine": 70},
            "tipo_teleruttore":        {"etichetta": "Tipo Teleruttore",       "tipo": "dropdown", "ordine": 80},
        }
    },
    "porte": {
        "etichetta": "Porte",
        "ordine": 60,
        "icona": "DoorOpen",
        "campi": {
            "tipo_porte_piano":         {"etichetta": "Tipo Porte Piano",       "tipo": "dropdown", "ordine": 10},
            "tipo_porte_cabina":        {"etichetta": "Tipo Porte Cabina",      "tipo": "dropdown", "ordine": 20},
            "numero_accessi":           {"etichetta": "Numero Accessi",         "tipo": "numero",   "ordine": 30},
            "tipo_operatore":           {"etichetta": "Tipo Operatore",         "tipo": "dropdown", "ordine": 40},
            "marca_operatore":          {"etichetta": "Marca Operatore",        "tipo": "dropdown", "ordine": 50},
            "stazionamento_porte":      {"etichetta": "Stazionamento Porte",    "tipo": "dropdown", "ordine": 60},
            "tipo_apertura":            {"etichetta": "Tipo Apertura",          "tipo": "dropdown", "ordine": 70},
            "distanza_minima_accessi":  {"etichetta": "Distanza Min. Accessi",  "tipo": "numero",   "ordine": 80},
            "alimentazione_operatore":  {"etichetta": "Alimentazione Operatore","tipo": "dropdown", "ordine": 90},
            "con_scheda":               {"etichetta": "Con Scheda",             "tipo": "checkbox", "ordine": 100},
        }
    },
}

SKIP_COLS = {"id", "preventivo_id", "created_at", "updated_at"}


def main():
    if not os.path.exists(DB_PATH):
        print(f"ERRORE: Database {DB_PATH} non trovato!")
        return

    # Backup
    backup_path = DB_PATH.replace(".db", f"{BACKUP_SUFFIX}.db")
    shutil.copy2(DB_PATH, backup_path)
    print(f"✅ Backup creato: {backup_path}")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Assicurati che le tabelle target esistano
    cursor.execute("""CREATE TABLE IF NOT EXISTS sezioni_configuratore (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codice TEXT UNIQUE NOT NULL,
        etichetta TEXT NOT NULL,
        ordine INTEGER DEFAULT 0,
        icona TEXT DEFAULT '',
        attivo INTEGER DEFAULT 1,
        visibile_cliente INTEGER DEFAULT 0,
        descrizione TEXT DEFAULT ''
    )""")

    totale_sezioni = 0
    totale_campi = 0
    totale_valori = 0
    campi_gia_esistenti = 0

    for sez_codice, sez_info in SEZIONI_DA_MIGRARE.items():
        print(f"\n{'='*60}")
        print(f"SEZIONE: {sez_codice} ({sez_info['etichetta']})")
        print(f"{'='*60}")

        # 1. Crea sezione se non esiste
        exists = cursor.execute(
            "SELECT id FROM sezioni_configuratore WHERE codice = ?",
            (sez_codice,)
        ).fetchone()
        if not exists:
            cursor.execute(
                "INSERT INTO sezioni_configuratore (codice, etichetta, ordine, icona, attivo) "
                "VALUES (?, ?, ?, ?, 1)",
                (sez_codice, sez_info["etichetta"], sez_info["ordine"], sez_info.get("icona", ""))
            )
            print(f"  ✅ Sezione creata: {sez_codice}")
            totale_sezioni += 1
        else:
            print(f"  ⏭️  Sezione già esiste: {sez_codice}")

        # 2. Crea campi se non esistono
        for campo_codice, campo_info in sez_info["campi"].items():
            exists = cursor.execute(
                "SELECT id FROM campi_configuratore WHERE codice = ? AND sezione = ?",
                (campo_codice, sez_codice)
            ).fetchone()
            if not exists:
                cursor.execute(
                    "INSERT INTO campi_configuratore "
                    "(codice, etichetta, sezione, tipo, ordine, attivo, obbligatorio, gruppo_dropdown, valore_default) "
                    "VALUES (?, ?, ?, ?, ?, 1, 0, '', '')",
                    (campo_codice, campo_info["etichetta"], sez_codice,
                     campo_info["tipo"], campo_info["ordine"])
                )
                totale_campi += 1
                print(f"  ✅ Campo creato: {campo_codice} ({campo_info['tipo']})")
            else:
                campi_gia_esistenti += 1

        # 3. Migra dati: tabella ORM → valori_configurazione
        try:
            # Leggi colonne della tabella ORM
            cols_info = cursor.execute(f"PRAGMA table_info({sez_codice})").fetchall()
            cols = [c[1] for c in cols_info if c[1] not in SKIP_COLS]
            if not cols:
                print(f"  ⚠️  Tabella ORM {sez_codice} non trovata o vuota")
                continue

            # Leggi tutti i record ORM
            rows = cursor.execute(
                f"SELECT preventivo_id, {', '.join(cols)} FROM {sez_codice}"
            ).fetchall()
            print(f"  📊 Trovati {len(rows)} preventivi da migrare")

            for row in rows:
                pid = row[0]
                for i, col in enumerate(cols):
                    val = row[i + 1]
                    if val is None:
                        continue

                    # Converti boolean Python → stringa
                    if isinstance(val, bool) or (isinstance(val, int) and col in 
                        {c for c, info in sez_info["campi"].items() if info["tipo"] == "checkbox"}):
                        val = "true" if val else "false"
                    else:
                        val = str(val)

                    if not val or val == "None":
                        continue

                    # Controlla se già esiste in valori_configurazione
                    existing = cursor.execute(
                        "SELECT id FROM valori_configurazione "
                        "WHERE preventivo_id = ? AND codice_campo = ? AND sezione = ?",
                        (pid, col, sez_codice)
                    ).fetchone()

                    if existing:
                        # Non sovrascrivere — il valore dinamico ha priorità
                        continue
                    else:
                        cursor.execute(
                            "INSERT INTO valori_configurazione "
                            "(preventivo_id, sezione, codice_campo, valore) "
                            "VALUES (?, ?, ?, ?)",
                            (pid, sez_codice, col, val)
                        )
                        totale_valori += 1

        except Exception as e:
            print(f"  ❌ Errore migrazione dati {sez_codice}: {e}")

    conn.commit()
    conn.close()

    print(f"\n{'='*60}")
    print(f"MIGRAZIONE COMPLETATA")
    print(f"{'='*60}")
    print(f"  Sezioni create:           {totale_sezioni}")
    print(f"  Campi creati:             {totale_campi}")
    print(f"  Campi già esistenti:      {campi_gia_esistenti}")
    print(f"  Valori migrati:           {totale_valori}")
    print(f"  Backup:                   {backup_path}")
    print(f"\n⚠️  Le tabelle ORM originali NON sono state eliminate.")
    print(f"  Puoi rimuoverle manualmente dopo aver verificato il funzionamento.")


if __name__ == "__main__":
    main()
