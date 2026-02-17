"""
genera_regole_contattori_oleo.py
Genera i file JSON delle regole per la selezione automatica dei contattori
su impianti oleodinamici.

INPUT (campi del configuratore):
  - argano.trazione              = "oleodinamica"  (condizione base)
  - argano.potenza_motore_kw     = valore numerico
  - argano.tipo_avviamento_motore = "diretto" | "stella_triangolo" | "soft_starter"
  - tensioni.frequenza_rete      = "50" | "60"

OUTPUT (materiali aggiunti automaticamente):
  - Contattore KM (principale)       → per diretto e soft starter
  - Contattore KS (stella)           → solo stella-triangolo
  - Contattore KM (triangolo)        → solo stella-triangolo
  - Morsetti linea                   → sezione morsetti R-S-T
  - Morsetti motore                  → sezione morsetti U-V-W (stella-tri)
  - Filo linea                       → sezione filo R-S-T
  - Filo motore                      → sezione filo U-V-W (stella-tri)
  - Soft Starter                     → solo avviamento soft starter

ESECUZIONE:
  cd backend/
  python genera_regole_contattori_oleo.py

Genera file nella directory ./rules/ (sovrascrive quelli con prefisso CONT_OLEO_).
"""

import json
import os

RULES_DIR = "./rules"

# ============================================================================
# DATI TABELLA 400V / 50 Hz
# ============================================================================
# Formato: (kW, IN, {diretto}, {stella_triangolo}, {soft_starter})
# Ogni dict: contattore/i, morsetti, filo, soft_starter_model
# None = combinazione non disponibile

TABELLA_50HZ = [
    # kW    IN    DIRETTO                        STELLA-TRIANGOLO                          SOFT STARTER
    (4.4,   10.4, {"cont": "D18", "mors": 10, "filo": 2.5},
                  {"ks": "D18", "km": "D12", "mors_rst": 10, "mors_uvw": 10, "filo_rst": 2.5, "filo_uvw": 2.5},
                  {"cont": "D18", "mors": 10, "filo": 2.5, "ss": "V40"}),

    (5.9,   14.6, {"cont": "D18", "mors": 10, "filo": 4},
                  {"ks": "D18", "km": "D12", "mors_rst": 10, "mors_uvw": 10, "filo_rst": 2.5, "filo_uvw": 2.5},
                  {"cont": "D18", "mors": 10, "filo": 2.5, "ss": "V40"}),

    (7.7,   18.5, {"cont": "D25", "mors": 10, "filo": 4},
                  {"ks": "D18", "km": "D12", "mors_rst": 10, "mors_uvw": 10, "filo_rst": 2.5, "filo_uvw": 2.5},
                  {"cont": "D18", "mors": 10, "filo": 2.5, "ss": "V40"}),

    (9.6,   23.4, {"cont": "D25", "mors": 10, "filo": 4},
                  {"ks": "D18", "km": "D12", "mors_rst": 10, "mors_uvw": 10, "filo_rst": 2.5, "filo_uvw": 2.5},
                  {"cont": "D18", "mors": 10, "filo": 2.5, "ss": "V40"}),

    (11.8,  27.8, {"cont": "D32", "mors": 10, "filo": 6},
                  {"ks": "D25", "km": "D18", "mors_rst": 10, "mors_uvw": 10, "filo_rst": 4, "filo_uvw": 4},
                  {"cont": "D25", "mors": 10, "filo": 4, "ss": "V40"}),

    (14.7,  32,   {"cont": "D50", "mors": 16, "filo": 10},
                  {"ks": "D32", "km": "D25", "mors_rst": 10, "mors_uvw": 10, "filo_rst": 6, "filo_uvw": 6},
                  {"cont": "D25", "mors": 10, "filo": 4, "ss": "V40"}),

    (18.4,  40,   {"cont": "D80", "mors": 35, "filo": 16},
                  {"ks": "D50", "km": "D32", "mors_rst": 16, "mors_uvw": 16, "filo_rst": 10, "filo_uvw": 10},
                  {"cont": "D32", "mors": 10, "filo": 6, "ss": "V40"}),

    (22.1,  47,   {"cont": "D80", "mors": 35, "filo": 16},
                  {"ks": "D50", "km": "D32", "mors_rst": 16, "mors_uvw": 16, "filo_rst": 10, "filo_uvw": 10},
                  {"cont": "D50", "mors": 16, "filo": 10, "ss": "V70"}),

    (29.4,  63,   None,  # Diretto NON disponibile
                  {"ks": "D80", "km": "D50", "mors_rst": 35, "mors_uvw": 35, "filo_rst": 16, "filo_uvw": 16},
                  {"cont": "D50", "mors": 16, "filo": 10, "ss": "V70"}),

    (36.8,  77.3, None,  # Diretto NON disponibile
                  {"ks": "D80", "km": "D50", "mors_rst": 35, "mors_uvw": 35, "filo_rst": 16, "filo_uvw": 16},
                  {"cont": "D80", "mors": 35, "filo": 16, "ss": "V70"}),

    # Da 44.1 kW in su: solo soft starter (modello), no contattori
    (44.1,  91.4, None, None,
                  {"cont": None, "mors": None, "filo": None, "ss": "V105"}),

    (58.8, 119.1, None, None,
                  {"cont": None, "mors": None, "filo": None, "ss": "V105"}),

    (73.5, 146.3, None, None,
                  {"cont": None, "mors": None, "filo": None, "ss": "V150"}),
]


# ============================================================================
# DATI TABELLA 440V / 60 Hz
# ============================================================================
TABELLA_60HZ = [
    (3.6,   7.9,  {"cont": "D18", "mors": 10, "filo": 2.5},
                  {"ks": "D18", "km": None, "mors_rst": 10, "mors_uvw": 10, "filo_rst": 10, "filo_uvw": 10},
                  {"cont": "D18", "mors": 10, "filo": 4, "ss": "V40"}),

    (5.3,  11.4,  {"cont": "D18", "mors": 10, "filo": 2.5},
                  {"ks": "D18", "km": None, "mors_rst": 10, "mors_uvw": 10, "filo_rst": 10, "filo_uvw": 10},
                  {"cont": "D18", "mors": 10, "filo": 4, "ss": "V40"}),

    (7.3,   15,   {"cont": "D25", "mors": 16, "filo": 4},
                  {"ks": "D18", "km": None, "mors_rst": 10, "mors_uvw": 10, "filo_rst": 10, "filo_uvw": 10},
                  {"cont": "D18", "mors": 10, "filo": 4, "ss": "V40"}),

    (9.2,  18.9,  {"cont": "D25", "mors": 16, "filo": 4},
                  {"ks": "D18", "km": None, "mors_rst": 10, "mors_uvw": 10, "filo_rst": 10, "filo_uvw": 10},
                  {"cont": "D18", "mors": 10, "filo": 4, "ss": "V40"}),

    (11,   23.1,  {"cont": "D32", "mors": 16, "filo": 6},
                  {"ks": "D25", "km": None, "mors_rst": 16, "mors_uvw": 16, "filo_rst": 16, "filo_uvw": 16},
                  {"cont": "D25", "mors": 10, "filo": 6, "ss": "V40"}),

    (15,     31,  {"cont": "D50", "mors": 16, "filo": 10},
                  {"ks": "D32", "km": None, "mors_rst": 16, "mors_uvw": 16, "filo_rst": 16, "filo_uvw": 16},
                  {"cont": "D25", "mors": 10, "filo": 6, "ss": "V40"}),

    (18.5,   36,  {"cont": "D50", "mors": 35, "filo": 10},
                  {"ks": "D50", "km": None, "mors_rst": 35, "mors_uvw": 35, "filo_rst": 35, "filo_uvw": 35},
                  {"cont": "D32", "mors": 16, "filo": 6, "ss": "V40"}),

    (24,     46,  {"cont": "D80", "mors": 35, "filo": 16},
                  {"ks": "D80", "km": None, "mors_rst": 35, "mors_uvw": 35, "filo_rst": 35, "filo_uvw": 35},
                  {"cont": "D50", "mors": 16, "filo": 10, "ss": "V40"}),

    (29,     54,  {"cont": "D80", "mors": 35, "filo": 16},
                  {"ks": "D80", "km": None, "mors_rst": 35, "mors_uvw": 35, "filo_rst": 35, "filo_uvw": 35},
                  {"cont": "D50", "mors": 16, "filo": 10, "ss": "V70"}),

    (37,     70,  None,  # Diretto NON disponibile
                  {"ks": "D80", "km": None, "mors_rst": 35, "mors_uvw": 35, "filo_rst": 35, "filo_uvw": 35},
                  {"cont": "D80", "mors": 35, "filo": 16, "ss": "V70"}),

    (48,     90,  None, None,
                  {"cont": None, "mors": None, "filo": None, "ss": "V105"}),

    (57,    105,  None, None,
                  {"cont": None, "mors": None, "filo": None, "ss": "V105"}),

    (72,    131,  None, None,
                  {"cont": None, "mors": None, "filo": None, "ss": "V150"}),
]


def calcola_range_kw(tabella):
    """
    Calcola i range kW per ogni riga della tabella.
    Usa il punto medio tra valori consecutivi come soglia.
    La prima riga parte da 0, l'ultima arriva a 999.
    """
    kw_values = [row[0] for row in tabella]
    ranges = []
    for i, kw in enumerate(kw_values):
        if i == 0:
            kw_min = 0
        else:
            kw_min = round((kw_values[i - 1] + kw) / 2, 1)

        if i == len(kw_values) - 1:
            kw_max = 999
        else:
            kw_max = round((kw + kw_values[i + 1]) / 2, 1)

        ranges.append((kw_min, kw_max))
    return ranges


def genera_materiali_diretto(dati, kw):
    """Genera lista materiali per avviamento diretto."""
    if dati is None:
        return []
    materials = []
    materials.append({
        "codice": f"CONT-{dati['cont']}-KM",
        "descrizione": f"Contattore {dati['cont']} marcia (KM) - motore {kw}kW",
        "quantita": 1,
        "prezzo_unitario": 0,
        "categoria": "Contattori",
        "note": "Avviamento diretto"
    })
    materials.append({
        "codice": f"MORS-{dati['mors']}MM2-RST",
        "descrizione": f"Morsetti {dati['mors']}mm² linea R-S-T",
        "quantita": 3,
        "prezzo_unitario": 0,
        "categoria": "Morsetteria",
    })
    materials.append({
        "codice": f"MORS-{dati['mors']}MM2-UVW",
        "descrizione": f"Morsetti {dati['mors']}mm² motore U-V-W",
        "quantita": 3,
        "prezzo_unitario": 0,
        "categoria": "Morsetteria",
    })
    materials.append({
        "codice": f"FILO-{dati['filo']}MM2-RST",
        "descrizione": f"Filo {dati['filo']}mm² linea R-S-T",
        "quantita": 1,
        "prezzo_unitario": 0,
        "unita_misura": "mt",
        "categoria": "Cablaggio",
    })
    materials.append({
        "codice": f"FILO-{dati['filo']}MM2-UVW",
        "descrizione": f"Filo {dati['filo']}mm² motore U-V-W",
        "quantita": 1,
        "prezzo_unitario": 0,
        "unita_misura": "mt",
        "categoria": "Cablaggio",
    })
    return materials


def genera_materiali_stella_triangolo(dati, kw):
    """Genera lista materiali per avviamento stella-triangolo."""
    if dati is None:
        return []
    materials = []
    # Contattore KS (stella / linea)
    materials.append({
        "codice": f"CONT-{dati['ks']}-KS",
        "descrizione": f"Contattore {dati['ks']} stella (KS) - motore {kw}kW",
        "quantita": 1,
        "prezzo_unitario": 0,
        "categoria": "Contattori",
        "note": "Avviamento stella-triangolo, contattore stella"
    })
    # Contattore KM (triangolo / marcia)
    if dati.get("km"):
        materials.append({
            "codice": f"CONT-{dati['km']}-KM",
            "descrizione": f"Contattore {dati['km']} triangolo (KM) - motore {kw}kW",
            "quantita": 1,
            "prezzo_unitario": 0,
            "categoria": "Contattori",
            "note": "Avviamento stella-triangolo, contattore triangolo"
        })
    # Morsetti linea R-S-T
    materials.append({
        "codice": f"MORS-{dati['mors_rst']}MM2-RST",
        "descrizione": f"Morsetti {dati['mors_rst']}mm² linea R-S-T",
        "quantita": 3,
        "prezzo_unitario": 0,
        "categoria": "Morsetteria",
    })
    # Morsetti motore U-V-W
    materials.append({
        "codice": f"MORS-{dati['mors_uvw']}MM2-UVW",
        "descrizione": f"Morsetti {dati['mors_uvw']}mm² motore U-V-W",
        "quantita": 3,
        "prezzo_unitario": 0,
        "categoria": "Morsetteria",
    })
    # Filo linea
    materials.append({
        "codice": f"FILO-{dati['filo_rst']}MM2-RST",
        "descrizione": f"Filo {dati['filo_rst']}mm² linea R-S-T",
        "quantita": 1,
        "prezzo_unitario": 0,
        "unita_misura": "mt",
        "categoria": "Cablaggio",
    })
    # Filo motore
    materials.append({
        "codice": f"FILO-{dati['filo_uvw']}MM2-UVW",
        "descrizione": f"Filo {dati['filo_uvw']}mm² motore U-V-W",
        "quantita": 1,
        "prezzo_unitario": 0,
        "unita_misura": "mt",
        "categoria": "Cablaggio",
    })
    return materials


def genera_materiali_soft_starter(dati, kw):
    """Genera lista materiali per avviamento con soft starter."""
    if dati is None:
        return []
    materials = []
    # Soft Starter (sempre presente)
    materials.append({
        "codice": f"SS-{dati['ss']}",
        "descrizione": f"Soft Starter modello {dati['ss']} - motore {kw}kW",
        "quantita": 1,
        "prezzo_unitario": 0,
        "categoria": "Soft Starter",
    })
    # Contattore (se disponibile per questa potenza)
    if dati.get("cont"):
        materials.append({
            "codice": f"CONT-{dati['cont']}-KM",
            "descrizione": f"Contattore {dati['cont']} by-pass (KM) - motore {kw}kW",
            "quantita": 1,
            "prezzo_unitario": 0,
            "categoria": "Contattori",
            "note": "Avviamento soft starter, contattore by-pass"
        })
    # Morsetti (se disponibili)
    if dati.get("mors"):
        materials.append({
            "codice": f"MORS-{dati['mors']}MM2-RST",
            "descrizione": f"Morsetti {dati['mors']}mm² linea R-S-T",
            "quantita": 3,
            "prezzo_unitario": 0,
            "categoria": "Morsetteria",
        })
        materials.append({
            "codice": f"MORS-{dati['mors']}MM2-UVW",
            "descrizione": f"Morsetti {dati['mors']}mm² motore U-V-W",
            "quantita": 3,
            "prezzo_unitario": 0,
            "categoria": "Morsetteria",
        })
    # Filo (se disponibile)
    if dati.get("filo"):
        materials.append({
            "codice": f"FILO-{dati['filo']}MM2-RST",
            "descrizione": f"Filo {dati['filo']}mm² linea R-S-T",
            "quantita": 1,
            "prezzo_unitario": 0,
            "unita_misura": "mt",
            "categoria": "Cablaggio",
        })
        materials.append({
            "codice": f"FILO-{dati['filo']}MM2-UVW",
            "descrizione": f"Filo {dati['filo']}mm² motore U-V-W",
            "quantita": 1,
            "prezzo_unitario": 0,
            "unita_misura": "mt",
            "categoria": "Cablaggio",
        })
    return materials


def genera_regole():
    """Genera tutti i file JSON delle regole contattori oleodinamici."""
    os.makedirs(RULES_DIR, exist_ok=True)

    stats = {"diretto": 0, "stella_triangolo": 0, "soft_starter": 0}

    for freq, tabella, freq_label in [
        ("50", TABELLA_50HZ, "50Hz/400V"),
        ("60", TABELLA_60HZ, "60Hz/440V"),
    ]:
        ranges = calcola_range_kw(tabella)

        for i, (kw, in_a, dati_dir, dati_st, dati_ss) in enumerate(tabella):
            kw_min, kw_max = ranges[i]

            # --- AVVIAMENTO DIRETTO ---
            if dati_dir is not None:
                rule_id = f"CONT_OLEO_DIR_{freq}HZ_{str(kw).replace('.', '_')}KW"
                rule = {
                    "id": rule_id,
                    "name": f"Contattori oleo diretto {kw}kW {freq_label}",
                    "description": f"Selezione contattori per centralina oleodinamica "
                                   f"{kw}kW, avviamento diretto, {freq_label}",
                    "version": "1.0",
                    "enabled": True,
                    "priority": 50,
                    "conditions": [
                        {"field": "argano.trazione", "operator": "equals",
                         "value": "oleodinamica",
                         "description": "Trazione oleodinamica"},
                        {"field": "argano.tipo_avviamento_motore", "operator": "equals",
                         "value": "diretto",
                         "description": "Avviamento diretto"},
                        {"field": "tensioni.frequenza_rete", "operator": "equals",
                         "value": freq,
                         "description": f"Rete {freq}Hz"},
                        {"field": "argano.potenza_motore_kw", "operator": "greater_equal",
                         "value": kw_min,
                         "description": f"Potenza >= {kw_min} kW"},
                        {"field": "argano.potenza_motore_kw", "operator": "less_than",
                         "value": kw_max,
                         "description": f"Potenza < {kw_max} kW"},
                    ],
                    "materials": genera_materiali_diretto(dati_dir, kw),
                }
                filepath = os.path.join(RULES_DIR, f"rule_{rule_id}.json")
                with open(filepath, "w", encoding="utf-8") as f:
                    json.dump(rule, f, indent=2, ensure_ascii=False)
                stats["diretto"] += 1

            # --- AVVIAMENTO STELLA-TRIANGOLO ---
            if dati_st is not None:
                rule_id = f"CONT_OLEO_ST_{freq}HZ_{str(kw).replace('.', '_')}KW"
                rule = {
                    "id": rule_id,
                    "name": f"Contattori oleo stella-triangolo {kw}kW {freq_label}",
                    "description": f"Selezione contattori per centralina oleodinamica "
                                   f"{kw}kW, avviamento stella-triangolo, {freq_label}",
                    "version": "1.0",
                    "enabled": True,
                    "priority": 50,
                    "conditions": [
                        {"field": "argano.trazione", "operator": "equals",
                         "value": "oleodinamica",
                         "description": "Trazione oleodinamica"},
                        {"field": "argano.tipo_avviamento_motore", "operator": "equals",
                         "value": "stella_triangolo",
                         "description": "Avviamento stella-triangolo"},
                        {"field": "tensioni.frequenza_rete", "operator": "equals",
                         "value": freq,
                         "description": f"Rete {freq}Hz"},
                        {"field": "argano.potenza_motore_kw", "operator": "greater_equal",
                         "value": kw_min,
                         "description": f"Potenza >= {kw_min} kW"},
                        {"field": "argano.potenza_motore_kw", "operator": "less_than",
                         "value": kw_max,
                         "description": f"Potenza < {kw_max} kW"},
                    ],
                    "materials": genera_materiali_stella_triangolo(dati_st, kw),
                }
                filepath = os.path.join(RULES_DIR, f"rule_{rule_id}.json")
                with open(filepath, "w", encoding="utf-8") as f:
                    json.dump(rule, f, indent=2, ensure_ascii=False)
                stats["stella_triangolo"] += 1

            # --- AVVIAMENTO SOFT STARTER ---
            if dati_ss is not None:
                rule_id = f"CONT_OLEO_SS_{freq}HZ_{str(kw).replace('.', '_')}KW"
                rule = {
                    "id": rule_id,
                    "name": f"Contattori oleo soft starter {kw}kW {freq_label}",
                    "description": f"Selezione contattori per centralina oleodinamica "
                                   f"{kw}kW, avviamento soft starter, {freq_label}",
                    "version": "1.0",
                    "enabled": True,
                    "priority": 50,
                    "conditions": [
                        {"field": "argano.trazione", "operator": "equals",
                         "value": "oleodinamica",
                         "description": "Trazione oleodinamica"},
                        {"field": "argano.tipo_avviamento_motore", "operator": "equals",
                         "value": "soft_starter",
                         "description": "Avviamento soft starter"},
                        {"field": "tensioni.frequenza_rete", "operator": "equals",
                         "value": freq,
                         "description": f"Rete {freq}Hz"},
                        {"field": "argano.potenza_motore_kw", "operator": "greater_equal",
                         "value": kw_min,
                         "description": f"Potenza >= {kw_min} kW"},
                        {"field": "argano.potenza_motore_kw", "operator": "less_than",
                         "value": kw_max,
                         "description": f"Potenza < {kw_max} kW"},
                    ],
                    "materials": genera_materiali_soft_starter(dati_ss, kw),
                }
                filepath = os.path.join(RULES_DIR, f"rule_{rule_id}.json")
                with open(filepath, "w", encoding="utf-8") as f:
                    json.dump(rule, f, indent=2, ensure_ascii=False)
                stats["soft_starter"] += 1

    return stats


if __name__ == "__main__":
    print("=" * 60)
    print("GENERAZIONE REGOLE CONTATTORI OLEODINAMICI")
    print("=" * 60)

    stats = genera_regole()

    totale = sum(stats.values())
    print(f"\n✅ Generate {totale} regole in {RULES_DIR}/:")
    print(f"   Avviamento diretto:         {stats['diretto']} regole")
    print(f"   Avviamento stella-triangolo: {stats['stella_triangolo']} regole")
    print(f"   Avviamento soft starter:     {stats['soft_starter']} regole")
    print(f"\nFile generati: rule_CONT_OLEO_*.json")

    # Mostra un esempio
    print("\n--- Esempio regola ---")
    example_file = os.path.join(RULES_DIR, "rule_CONT_OLEO_DIR_50HZ_5_9KW.json")
    if os.path.exists(example_file):
        with open(example_file) as f:
            print(json.dumps(json.load(f), indent=2, ensure_ascii=False))
