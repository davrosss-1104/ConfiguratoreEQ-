"""
auto_mapping_preventivo.py
==========================
Popola automaticamente il mapping campi -> sezioni documento preventivo.

Per ogni campo attivo in campi_configuratore imposta:
  - includi_preventivo = 1/0
  - sezione_preventivo = codice sezione nel documento
  - ordine_preventivo = ordine dentro la sezione
  - mostra_default_preventivo = 1/0 (se mostrare in "Valori Standard" quando non modificato)

Eseguire: python auto_mapping_preventivo.py [path_db]
Idempotente: rieseguibile senza problemi (sovrascrive).
"""
import sqlite3
import sys
import os

# ═══════════════════════════════════════════════════════
# MAPPING SEZIONE CONFIG → SEZIONE DOCUMENTO
# ═══════════════════════════════════════════════════════
# Ogni sezione del configuratore viene mappata a una sezione del documento PDF

SECTION_MAP = {
    # sezione_config → sezione_preventivo
    "dati_commessa":   "dati_commessa",
    "dati_principali": "specifiche_tecniche",
    "normative":       "specifiche_tecniche",
    "tensioni":        "specifiche_tecniche",
    "argano":          "configurazione",
    "quadro":          "configurazione",
    "vano":            "configurazione",
    "cabina":          "configurazione",
    "porte_lato_a":    "configurazione",
    "porte_lato_b":    "configurazione",
    "operatore_a":     "configurazione",
    # Sezione col nome sbagliato (dati_commessa.trasporto in "Dati Principali")
    "Dati Principali": "dati_commessa",
}

# ═══════════════════════════════════════════════════════
# CAMPI DA ESCLUDERE DAL PREVENTIVO
# ═══════════════════════════════════════════════════════
# Campi interni/di sistema che non hanno senso nel documento cliente

ESCLUDI = {
    "dati_commessa.stato_preventivo",      # info interna
    "dati_commessa.validita_offerta",      # mostrato nell'intestazione
    "dati_commessa.numero_offerta",        # già nell'header
    "dati_principali.doppio_pulsante_piano_0",  # troppo tecnico
}

# ═══════════════════════════════════════════════════════
# CAMPI DA MOSTRARE IN "VALORI STANDARD" SE NON MODIFICATI
# ═══════════════════════════════════════════════════════
# Valori che l'utente dovrebbe confermare — se non li ha toccati,
# appariranno nella sezione "Valori Standard Applicati"

MOSTRA_DEFAULT = {
    # Dati principali — valori critici
    "dati_principali.numero_fermate",
    "dati_principali.numero_accessi",
    "dati_principali.numero_servizi",
    "dati_principali.velocita",
    "dati_principali.portata_kg",
    "dati_principali.portata_persone",
    "dati_principali.tipo_manovra",
    "dati_principali.logica_processore",
    # Tensioni — valori standard ma importanti
    "tensioni.forza_motrice",
    "tensioni.luce",
    "tensioni.tensione_manovra",
    "tensioni.tensione_freno",
    "tensioni.frequenza_rete",
    # Argano
    "argano.trazione",
    "argano.potenza_motore_kw",
    "argano.corrente_nominale",
    "argano.tipo_avviamento_motore",
    # Porte
    "porte_lato_a.porte_cabina",
    "porte_lato_a.porte_piano",
    # Vano
    "vano.larghezza",
    "vano.profondita",
    "vano.testata",
    "vano.fossa",
    # Cabina
    "cabina.larghezza",
    "cabina.profondita",
    "cabina.altezza",
    "cabina.apertura_porte",
}

# ═══════════════════════════════════════════════════════
# ORDINE DENTRO OGNI SEZIONE PREVENTIVO
# ═══════════════════════════════════════════════════════
# Ordine in cui i campi appaiono nella sezione del documento.
# I campi non elencati qui prendono ordine automatico 100+ordine_originale

ORDINE_OVERRIDE = {
    # dati_commessa
    "dati_commessa.commessa":                10,
    "dati_commessa.riferimento_cliente":     20,
    "dati_commessa.tipo_ordine":             30,
    "dati_commessa.pagamento":               40,
    "dati_commessa.imballo":                 50,
    "dati_commessa.trasporto":               55,
    "dati_commessa.resa":                    60,
    "dati_commessa.destinazione":            70,
    "dati_commessa.data_consegna_richiesta": 80,
    # specifiche_tecniche (dati_principali + normative + tensioni)
    "dati_principali.tipo_impianto":         10,
    "dati_principali.nuovo_impianto":        15,
    "dati_principali.tipo_quadro_manovra":   20,
    "dati_principali.numero_fermate":        30,
    "dati_principali.numero_accessi":        35,
    "dati_principali.numero_servizi":        40,
    "dati_principali.velocita":              50,
    "dati_principali.corsa":                 55,
    "dati_principali.portata_kg":            60,
    "dati_principali.portata_persone":       65,
    "dati_principali.tipo_manovra":          70,
    "dati_principali.logica_processore":     75,
    "dati_principali.modulo_programmazione": 80,
    "dati_principali.operatori_uguali":      85,
    "dati_principali.distanza_minima_piani": 90,
    "normative.direttiva":                  100,
    "normative.en_81_20":                   110,
    "normative.en_81_20_anno":              115,
    "normative.en_81_21":                   120,
    "normative.en_81_28":                   130,
    "normative.en_81_50":                   135,
    "normative.en_81_70":                   140,
    "normative.en_81_72":                   145,
    "normative.en_81_73":                   150,
    "normative.en_81":                      155,
    "normative.en_95_16":                   160,
    "normative.dm_236":                     170,
    "normative.normativa_10411":            175,
    "normative.dm_15_9_2005":               180,
    "normative.emendamento_a3":             190,
    "tensioni.forza_motrice":               200,
    "tensioni.luce":                        210,
    "tensioni.tensione_manovra":            220,
    "tensioni.tensione_freno":              230,
    "tensioni.frequenza_rete":              240,
    # configurazione (argano + quadro + vano + cabina + porte + operatore)
    "argano.trazione":                       10,
    "argano.potenza_motore_kw":              20,
    "argano.corrente_nominale":              30,
    "argano.tipo_vvvf":                      40,
    "argano.vvvf_nel_vano":                  50,
    "argano.tipo_avviamento_motore":         55,
    "argano.freno_albero_lento":             60,
    "argano.microlivellazione":              65,
    "argano.marca_argano":                   70,
    "argano.modello_argano":                 75,
    "quadro.posizione":                     100,
    "quadro.distanza_da_vano":              110,
    "quadro.locale_macchina":               120,
    "vano.larghezza":                       200,
    "vano.profondita":                      210,
    "vano.testata":                         220,
    "vano.fossa":                           230,
    "cabina.larghezza":                     300,
    "cabina.profondita":                    310,
    "cabina.altezza":                       320,
    "cabina.apertura_porte":                330,
    "porte_lato_a.porte_cabina":            400,
    "porte_lato_a.porte_piano":             410,
    "porte_lato_a.elettroserrature":        420,
    "porte_lato_a.tensione_elettroserrature": 425,
    "porte_lato_a.pattino_retrattile":      430,
    "porte_lato_a.predisposizione_fotocellula": 440,
    "porte_lato_a.tensione_fotocellula":    445,
    "porte_lato_a.fotocellula_in_catena":   450,
    "porte_lato_b.presente":                500,
    "porte_lato_b.porte_cabina":            510,
    "porte_lato_b.porte_piano":             520,
    "operatore_a.fornitore_operatore":      600,
    "operatore_a.modello_operatore":        610,
    "operatore_a.fine_corsa_apertura":      620,
    "operatore_a.fine_corsa_chiusura":      630,
    "operatore_a.alimentato_in_marcia":     640,
    "operatore_a.mantenimento_apertura":    650,
    "operatore_a.costola_mobile":           660,
    "operatore_a.scheda":                   670,
    "operatore_a.rallentamento_operatore":  680,
}


def migrate(db_path):
    print(f"Database: {db_path}")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # Leggi tutti i campi attivi
    c.execute("""SELECT id, codice, sezione, etichetta, ordine
        FROM campi_configuratore WHERE attivo = 1""")
    campi = c.fetchall()
    print(f"  Campi attivi: {len(campi)}")

    count_inclusi = 0
    count_esclusi = 0
    count_mostra_def = 0

    for campo_id, codice, sezione, etichetta, ordine in campi:
        # Determina se includere
        if codice in ESCLUDI:
            includi = 0
        else:
            includi = 1

        # Determina sezione preventivo
        sez_prev = SECTION_MAP.get(sezione, "configurazione")

        # Determina ordine
        ord_prev = ORDINE_OVERRIDE.get(codice, 100 + (ordine or 0))

        # Determina mostra_default
        mostra_def = 1 if codice in MOSTRA_DEFAULT else 0

        # Aggiorna
        c.execute("""UPDATE campi_configuratore
            SET includi_preventivo = ?,
                sezione_preventivo = ?,
                ordine_preventivo = ?,
                mostra_default_preventivo = ?
            WHERE id = ?""",
            (includi, sez_prev, ord_prev, mostra_def, campo_id))

        if includi:
            count_inclusi += 1
        else:
            count_esclusi += 1
        if mostra_def:
            count_mostra_def += 1

    conn.commit()

    # Report
    print(f"\n  Risultato:")
    print(f"    Inclusi nel preventivo:  {count_inclusi}")
    print(f"    Esclusi:                 {count_esclusi}")
    print(f"    Mostra default:          {count_mostra_def}")

    # Verifica distribuzione per sezione
    c.execute("""SELECT sezione_preventivo, COUNT(*) as cnt
        FROM campi_configuratore WHERE attivo=1 AND includi_preventivo=1
        GROUP BY sezione_preventivo ORDER BY sezione_preventivo""")
    print(f"\n  Distribuzione per sezione documento:")
    for sez, cnt in c.fetchall():
        print(f"    {sez or '???':25s} → {cnt} campi")

    conn.close()
    print(f"\nMapping completato.")


if __name__ == "__main__":
    db_path = sys.argv[1] if len(sys.argv) > 1 else None

    if not db_path:
        candidates = ["./configuratore.db", "./elettroquadri_demo.db"]
        for p in candidates:
            if os.path.exists(p):
                db_path = p
                break

    if not db_path:
        print("Errore: specificare il path del database")
        print("Uso: python auto_mapping_preventivo.py <path_db>")
        sys.exit(1)

    migrate(db_path)
