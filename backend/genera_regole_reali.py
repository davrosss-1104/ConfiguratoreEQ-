"""
genera_regole_reali.py
======================
Genera il set completo di regole JSON per il configuratore Elettroquadri,
basate sui campi reali dei moduli d'ordine PDF.

ESECUZIONE:
  cd backend/
  python genera_regole_reali.py

Genera file nella directory ./rules/ (sovrascrive quelli esistenti).
I campi "field" corrispondono ai nomi usati nel configuratore
(tabelle dati_principali, normative, argano, porte, disposizione_vano, ecc.)
"""

import json
import os

RULES_DIR = "./rules"

RULES = [

    # ================================================================
    # QUADRO DI MANOVRA - GEARLESS MRL
    # ================================================================
    {
        "id": "QUADRO_GEARLESS_MRL",
        "name": "Quadro manovra Gearless MRL",
        "description": "Quadro completo per impianti Gearless senza locale macchina",
        "version": "1.0",
        "enabled": True,
        "priority": 10,
        "conditions": [
            {"field": "tipo_trazione", "operator": "equals", "value": "Gearless MRL",
             "description": "Trazione Gearless MRL"}
        ],
        "materials": [
            {"codice": "QUADRO_QM_GL_001", "descrizione": "Quadro manovra Gearless completo",
             "quantita": 1, "prezzo_unitario": 2850.00, "categoria": "Quadri Elettrici"},
            {"codice": "INVERTER_GL_400V", "descrizione": "Inverter Gearless 400V",
             "quantita": 1, "prezzo_unitario": 1650.00, "categoria": "Quadri Elettrici"},
            {"codice": "ENC-ABS-001", "descrizione": "Encoder assoluto per trazione MRL",
             "quantita": 1, "prezzo_unitario": 420.00, "categoria": "Componenti Trazione"},
        ]
    },

    # ================================================================
    # QUADRO DI MANOVRA - GEARED (con locale macchina)
    # ================================================================
    {
        "id": "QUADRO_GEARED",
        "name": "Quadro manovra Geared",
        "description": "Quadro completo per impianti Geared con locale macchina",
        "version": "1.0",
        "enabled": True,
        "priority": 10,
        "conditions": [
            {"field": "tipo_trazione", "operator": "equals", "value": "Geared",
             "description": "Trazione Geared"}
        ],
        "materials": [
            {"codice": "QUADRO_QM_GE_001", "descrizione": "Quadro manovra Geared completo",
             "quantita": 1, "prezzo_unitario": 2400.00, "categoria": "Quadri Elettrici"},
            {"codice": "CONT-STELLA-TRI", "descrizione": "Contattori avviamento stella-triangolo",
             "quantita": 1, "prezzo_unitario": 185.00, "categoria": "Quadri Elettrici"},
        ]
    },

    # ================================================================
    # LOGICA SCHEDA MP2/MP3
    # ================================================================
    {
        "id": "LOGICA_MP2_PARALLELO",
        "name": "Logica scheda MP2 Parallelo",
        "description": "Scheda logica MP2 parallelo - precablato solo cabina",
        "version": "1.0",
        "enabled": True,
        "priority": 20,
        "conditions": [
            {"field": "logica_scheda", "operator": "equals", "value": "MP2 Parallelo",
             "description": "Logica scheda parallelo MP2"}
        ],
        "materials": [
            {"codice": "PCB-MP2-PAR", "descrizione": "Scheda logica MP2 Parallelo",
             "quantita": 1, "prezzo_unitario": 320.00, "categoria": "Elettronica"},
        ]
    },
    {
        "id": "LOGICA_MP3_SERIALE",
        "name": "Logica scheda MP3 Seriale completo",
        "description": "Scheda logica MP3 seriale cabina + piano con schede chiamata",
        "version": "1.0",
        "enabled": True,
        "priority": 20,
        "conditions": [
            {"field": "logica_scheda", "operator": "equals", "value": "MP3 Seriale",
             "description": "Logica scheda seriale MP3"}
        ],
        "materials": [
            {"codice": "PCB-MP3-SER", "descrizione": "Scheda logica MP3 Seriale completo",
             "quantita": 1, "prezzo_unitario": 480.00, "categoria": "Elettronica"},
            {"codice": "PCB-CALL-SER", "descrizione": "Scheda chiamata seriale per piano",
             "quantita": 1, "prezzo_unitario": 28.00, "categoria": "Elettronica",
             "note": "Quantità = numero fermate (da calcolare)"},
        ]
    },

    # ================================================================
    # PRECABLAGGIO ASCENSORE FUNE NUOVO
    # ================================================================
    {
        "id": "PRECAB_FUNE_NUOVO",
        "name": "Precablaggio ascensore fune nuovo",
        "description": "Kit precablaggio standard per ascensore a fune nuovo",
        "version": "1.0",
        "enabled": True,
        "priority": 30,
        "conditions": [
            {"field": "tipo_impianto", "operator": "equals", "value": "ascensore",
             "description": "Tipo impianto ascensore"},
            {"field": "nuovo_impianto", "operator": "equals", "value": "true",
             "description": "Nuovo impianto"}
        ],
        "materials": [
            {"codice": "KIT_PRECAB_FUNE", "descrizione": "Kit precablaggio ascensore fune",
             "quantita": 1, "prezzo_unitario": 950.00, "categoria": "Precablaggio"},
            {"codice": "MORS-TETTO-CAB", "descrizione": "Morsettiera tetto cabina",
             "quantita": 1, "prezzo_unitario": 45.00, "categoria": "Precablaggio"},
            {"codice": "BOTT-MANUT", "descrizione": "Bottoniera di manutenzione",
             "quantita": 1, "prezzo_unitario": 65.00, "categoria": "Precablaggio"},
            {"codice": "CONT-MAGN-REED", "descrizione": "Contatti magnetici Reed con staffe",
             "quantita": 1, "prezzo_unitario": 18.00, "categoria": "Precablaggio",
             "note": "Quantità = numero fermate"},
            {"codice": "STOP-FOSSA", "descrizione": "Stop in fossa",
             "quantita": 1, "prezzo_unitario": 22.00, "categoria": "Sicurezza"},
            {"codice": "SIRENA-ALL", "descrizione": "Sirena allarme",
             "quantita": 1, "prezzo_unitario": 15.00, "categoria": "Segnalazione"},
            {"codice": "CAVO-TERRA-GUIDE", "descrizione": "Cavo di terra per guide (10m)",
             "quantita": 1, "prezzo_unitario": 12.00, "categoria": "Precablaggio"},
        ]
    },

    # ================================================================
    # PRECABLAGGIO RISTRUTTURAZIONE
    # ================================================================
    {
        "id": "PRECAB_FUNE_RISTRUTTURAZIONE",
        "name": "Precablaggio ristrutturazione ascensore fune",
        "description": "Kit precablaggio per ristrutturazione ascensore a fune",
        "version": "1.0",
        "enabled": True,
        "priority": 30,
        "conditions": [
            {"field": "tipo_impianto", "operator": "equals", "value": "ascensore",
             "description": "Tipo impianto ascensore"},
            {"field": "nuovo_impianto", "operator": "equals", "value": "false",
             "description": "Impianto ristrutturazione (non nuovo)"}
        ],
        "materials": [
            {"codice": "KIT-PRECAB-RISTR", "descrizione": "Kit precablaggio ristrutturazione fune",
             "quantita": 1, "prezzo_unitario": 780.00, "categoria": "Precablaggio"},
            {"codice": "MORS-TETTO-CAB", "descrizione": "Morsettiera tetto cabina",
             "quantita": 1, "prezzo_unitario": 45.00, "categoria": "Precablaggio"},
            {"codice": "BOTT-MANUT", "descrizione": "Bottoniera di manutenzione",
             "quantita": 1, "prezzo_unitario": 65.00, "categoria": "Precablaggio"},
        ]
    },

    # ================================================================
    # BOTTONIERA DI CABINA
    # ================================================================
    {
        "id": "BOTT_CABINA_STANDARD",
        "name": "Bottoniera cabina standard",
        "description": "Bottoniera di cabina BAM/BFP con pulsanti e display",
        "version": "1.0",
        "enabled": True,
        "priority": 40,
        "conditions": [
            {"field": "tipo_impianto", "operator": "equals", "value": "ascensore",
             "description": "Tipo impianto ascensore"}
        ],
        "materials": [
            {"codice": "BOTT_CABINA_STD", "descrizione": "Bottoniera cabina standard",
             "quantita": 1, "prezzo_unitario": 420.00, "categoria": "Bottoniere"},
            {"codice": "TARGA-DATI", "descrizione": "Targa dati cabina (matricola, portata, anno)",
             "quantita": 1, "prezzo_unitario": 18.00, "categoria": "Bottoniere"},
        ]
    },

    # ================================================================
    # BOTTONIERE DI PIANO
    # ================================================================
    {
        "id": "BOTT_PIANO_STANDARD",
        "name": "Bottoniere di piano standard",
        "description": "Bottoniere di piano - quantità pari al numero fermate",
        "version": "1.0",
        "enabled": True,
        "priority": 40,
        "conditions": [
            {"field": "tipo_impianto", "operator": "equals", "value": "ascensore",
             "description": "Tipo impianto ascensore"}
        ],
        "materials": [
            {"codice": "BOTT_PIANO_STD", "descrizione": "Bottoniera di piano standard",
             "quantita": 1, "prezzo_unitario": 95.00, "categoria": "Bottoniere",
             "note": "Quantità = numero fermate (da moltiplicare)"},
        ]
    },

    # ================================================================
    # NORMATIVA EN 81-20:2020 (NUOVA)
    # ================================================================
    {
        "id": "NORM_EN81_20_2020",
        "name": "Normativa EN 81-20:2020",
        "description": "Componenti aggiuntivi richiesti dalla EN 81-20 edizione 2020",
        "version": "1.0",
        "enabled": True,
        "priority": 50,
        "conditions": [
            {"field": "en_81_20", "operator": "equals", "value": "2020",
             "description": "EN 81-20 edizione 2020"}
        ],
        "materials": [
            {"codice": "UCM-EN81-20", "descrizione": "Dispositivo UCM (Unintended Car Movement)",
             "quantita": 1, "prezzo_unitario": 580.00, "categoria": "Sicurezza"},
            {"codice": "BOTT-LIS-LID", "descrizione": "Bottoniera tetto cabina LIS/LID (EN81-20)",
             "quantita": 1, "prezzo_unitario": 85.00, "categoria": "Sicurezza"},
            {"codice": "LUCE-EMERG-81-20", "descrizione": "Luce emergenza cabina EN81-20",
             "quantita": 1, "prezzo_unitario": 42.00, "categoria": "Illuminazione"},
        ]
    },

    # ================================================================
    # NORMATIVA EN 81-28 (ALLARME)
    # ================================================================
    {
        "id": "NORM_EN81_28",
        "name": "Normativa EN 81-28 Allarme",
        "description": "Sistema di allarme bidirezionale conforme EN 81-28",
        "version": "1.0",
        "enabled": True,
        "priority": 50,
        "conditions": [
            {"field": "en_81_28", "operator": "equals", "value": "true",
             "description": "EN 81-28 attiva"}
        ],
        "materials": [
            {"codice": "FILTRO-ATT-ALL", "descrizione": "Filtro attivazione allarme (EN81-28)",
             "quantita": 1, "prezzo_unitario": 35.00, "categoria": "Sicurezza"},
            {"codice": "COMB-TEL-GSM", "descrizione": "Combinatore telefonico GSM per allarme",
             "quantita": 1, "prezzo_unitario": 165.00, "categoria": "Comunicazione"},
        ]
    },

    # ================================================================
    # NORMATIVA EN 81-70 (ACCESSIBILITÀ)
    # ================================================================
    {
        "id": "NORM_EN81_70",
        "name": "Normativa EN 81-70 Accessibilità",
        "description": "Componenti per accessibilità disabili EN 81-70",
        "version": "1.0",
        "enabled": True,
        "priority": 50,
        "conditions": [
            {"field": "en_81_70", "operator": "equals", "value": "true",
             "description": "EN 81-70 attiva"}
        ],
        "materials": [
            {"codice": "GONG-CAB-70", "descrizione": "Gong in cabina inizio apertura porte (EN81-70)",
             "quantita": 1, "prezzo_unitario": 28.00, "categoria": "Segnalazione"},
            {"codice": "CONF-ACUST-70", "descrizione": "Conferma acustica e luminosa pulsanti (EN81-70)",
             "quantita": 1, "prezzo_unitario": 35.00, "categoria": "Segnalazione"},
            {"codice": "SINTETIZ-VOCALE", "descrizione": "Sintetizzatore vocale annuncio piano",
             "quantita": 1, "prezzo_unitario": 120.00, "categoria": "Segnalazione"},
        ]
    },

    # ================================================================
    # NORMATIVA EN 81-72 (POMPIERI)
    # ================================================================
    {
        "id": "NORM_EN81_72",
        "name": "Normativa EN 81-72 Pompieri",
        "description": "Predisposizione manovra pompieri EN 81-72",
        "version": "1.0",
        "enabled": True,
        "priority": 50,
        "conditions": [
            {"field": "en_81_72", "operator": "equals", "value": "true",
             "description": "EN 81-72 attiva"}
        ],
        "materials": [
            {"codice": "KIT-POMP-72", "descrizione": "Kit manovra pompieri EN81-72",
             "quantita": 1, "prezzo_unitario": 380.00, "categoria": "Sicurezza"},
            {"codice": "COPERT-IPX3", "descrizione": "Coperchio morsettiera tetto cabina IPX3",
             "quantita": 1, "prezzo_unitario": 45.00, "categoria": "Sicurezza"},
            {"codice": "SIRENA-IPX3", "descrizione": "Sirena allarme IPX3",
             "quantita": 1, "prezzo_unitario": 32.00, "categoria": "Sicurezza"},
            {"codice": "SCATOLE-IPX3", "descrizione": "Scatole interconnessione vano IPX3",
             "quantita": 1, "prezzo_unitario": 55.00, "categoria": "Sicurezza"},
            {"codice": "CITOF-POMP", "descrizione": "Predisposizione citofonia cabina-piano pompieri",
             "quantita": 1, "prezzo_unitario": 95.00, "categoria": "Comunicazione"},
        ]
    },

    # ================================================================
    # NORMATIVA EN 81-73 (INCENDIO)
    # ================================================================
    {
        "id": "NORM_EN81_73",
        "name": "Normativa EN 81-73 Incendio",
        "description": "Comportamento ascensore in caso di incendio EN 81-73",
        "version": "1.0",
        "enabled": True,
        "priority": 50,
        "conditions": [
            {"field": "en_81_73", "operator": "equals", "value": "true",
             "description": "EN 81-73 attiva"}
        ],
        "materials": [
            {"codice": "KIT-INC-73", "descrizione": "Kit gestione incendio EN81-73",
             "quantita": 1, "prezzo_unitario": 220.00, "categoria": "Sicurezza"},
        ]
    },

    # ================================================================
    # A3 95/16 - SOVRACCARICO
    # ================================================================
    {
        "id": "NORM_A3_95_16",
        "name": "A3 95/16 Sovraccarico",
        "description": "Dispositivo sovraccarico secondo A3 95/16",
        "version": "1.0",
        "enabled": True,
        "priority": 50,
        "conditions": [
            {"field": "a3_95_16", "operator": "equals", "value": "true",
             "description": "A3 95/16 attiva"}
        ],
        "materials": [
            {"codice": "SOVR-CAB-A3", "descrizione": "Sovraccarico cabina (A3 95/16)",
             "quantita": 1, "prezzo_unitario": 145.00, "categoria": "Sicurezza"},
        ]
    },

    # ================================================================
    # DM 236 LEGGE 13 - ACCESSIBILITÀ
    # ================================================================
    {
        "id": "NORM_DM236_L13",
        "name": "DM 236 Legge 13",
        "description": "Segnalazioni acustiche Legge 13 accessibilità",
        "version": "1.0",
        "enabled": True,
        "priority": 50,
        "conditions": [
            {"field": "dm236_legge13", "operator": "equals", "value": "true",
             "description": "DM 236 Legge 13 attiva"}
        ],
        "materials": [
            {"codice": "GONG-RALL-L13", "descrizione": "Gong in rallentamento cabina (L.13)",
             "quantita": 1, "prezzo_unitario": 28.00, "categoria": "Segnalazione"},
            {"codice": "CAMP-PIANO-L13", "descrizione": "Segnalazione campana al piano principale (L.13)",
             "quantita": 1, "prezzo_unitario": 22.00, "categoria": "Segnalazione"},
        ]
    },

    # ================================================================
    # EMENDAMENTO A3 - CON RILIVELLAMENTO
    # ================================================================
    {
        "id": "EMEND_A3_RILIV",
        "name": "Emendamento A3 con rilivellamento",
        "description": "Dispositivo rilivellamento secondo Emendamento A3",
        "version": "1.0",
        "enabled": True,
        "priority": 55,
        "conditions": [
            {"field": "emendamento_a3", "operator": "equals", "value": "Con rilivellamento",
             "description": "Emendamento A3 con rilivellamento"}
        ],
        "materials": [
            {"codice": "RILIV-A3", "descrizione": "Dispositivo rilivellamento (Emendamento A3)",
             "quantita": 1, "prezzo_unitario": 195.00, "categoria": "Sicurezza"},
            {"codice": "CONT-FRENO-A3", "descrizione": "Contatti freno per Emendamento A3",
             "quantita": 1, "prezzo_unitario": 65.00, "categoria": "Sicurezza"},
        ]
    },

    # ================================================================
    # EMERGENZA - UPS RIPORTO AL PIANO
    # ================================================================
    {
        "id": "EMERG_UPS_RIPORTO",
        "name": "Emergenza UPS riporto al piano",
        "description": "UPS Buster per sblocco freno + riporto al piano + apertura porte",
        "version": "1.0",
        "enabled": True,
        "priority": 60,
        "conditions": [
            {"field": "emergenza_ups", "operator": "equals", "value": "true",
             "description": "Emergenza con UPS riporto al piano"}
        ],
        "materials": [
            {"codice": "UPS-BUSTER", "descrizione": "UPS Buster riporto al piano con apertura porte",
             "quantita": 1, "prezzo_unitario": 520.00, "categoria": "Emergenza"},
        ]
    },

    # ================================================================
    # PORTE AUTOMATICHE
    # ================================================================
    {
        "id": "PORTE_AUTOMATICHE",
        "name": "Porte automatiche",
        "description": "Operatore porte automatiche con fotocellula/barriera",
        "version": "1.0",
        "enabled": True,
        "priority": 40,
        "conditions": [
            {"field": "tipo_porte_cabina", "operator": "equals", "value": "Automatiche",
             "description": "Porte cabina automatiche"}
        ],
        "materials": [
            {"codice": "OPER-PORTE-AUTO", "descrizione": "Operatore porte automatiche cabina",
             "quantita": 1, "prezzo_unitario": 340.00, "categoria": "Porte"},
            {"codice": "BARR-FOTOCEL", "descrizione": "Barriera fotocellula porte",
             "quantita": 1, "prezzo_unitario": 85.00, "categoria": "Porte"},
        ]
    },

    # ================================================================
    # DOPPIO/TRIPLO ACCESSO
    # ================================================================
    {
        "id": "DOPPIO_ACCESSO",
        "name": "Doppio accesso in cabina",
        "description": "Componenti aggiuntivi per cabina con 2 accessi",
        "version": "1.0",
        "enabled": True,
        "priority": 45,
        "conditions": [
            {"field": "numero_accessi", "operator": "equals", "value": "2",
             "description": "Cabina con 2 accessi"}
        ],
        "materials": [
            {"codice": "OPER-ACC-B", "descrizione": "Operatore porte accesso B",
             "quantita": 1, "prezzo_unitario": 340.00, "categoria": "Porte"},
            {"codice": "BARR-ACC-B", "descrizione": "Barriera fotocellula accesso B",
             "quantita": 1, "prezzo_unitario": 85.00, "categoria": "Porte"},
            {"codice": "CAVO-OPER-B", "descrizione": "Cavo operatore porte accesso B (3.5m)",
             "quantita": 1, "prezzo_unitario": 18.00, "categoria": "Precablaggio"},
        ]
    },

    # ================================================================
    # DISPLAY - 1 FILO PER PIANO (vs segmento/gray/binario)
    # ================================================================
    {
        "id": "DISPLAY_1FILO_PIANO",
        "name": "Display 1 filo per piano",
        "description": "Collegamento display con 1 filo per piano",
        "version": "1.0",
        "enabled": True,
        "priority": 35,
        "conditions": [
            {"field": "collegamento_display", "operator": "equals", "value": "1 filo per piano",
             "description": "Collegamento display 1 filo per piano"}
        ],
        "materials": [
            {"codice": "DISP-1FILO", "descrizione": "Kit collegamento display 1 filo per piano",
             "quantita": 1, "prezzo_unitario": 35.00, "categoria": "Segnalazione",
             "note": "Prezzo base, aggiungere costo per fermata"},
        ]
    },

    # ================================================================
    # MANOVRA COLLETTIVA COMPLETA
    # ================================================================
    {
        "id": "MANOVRA_COLL_COMPLETA",
        "name": "Manovra collettiva completa",
        "description": "Manovra collettiva completa (salita + discesa)",
        "version": "1.0",
        "enabled": True,
        "priority": 25,
        "conditions": [
            {"field": "tipo_manovra", "operator": "equals", "value": "Collettiva Completa",
             "description": "Manovra collettiva completa"}
        ],
        "materials": [
            {"codice": "MOD-COLL-COMPL", "descrizione": "Modulo manovra collettiva completa",
             "quantita": 1, "prezzo_unitario": 180.00, "categoria": "Quadri Elettrici"},
        ]
    },

    # ================================================================
    # MANOVRA DUPLEX
    # ================================================================
    {
        "id": "MANOVRA_DUPLEX",
        "name": "Manovra Duplex",
        "description": "Gestione duplex per 2 ascensori collegati",
        "version": "1.0",
        "enabled": True,
        "priority": 25,
        "conditions": [
            {"field": "tipo_manovra", "operator": "equals", "value": "Duplex",
             "description": "Manovra Duplex"}
        ],
        "materials": [
            {"codice": "MOD-DUPLEX", "descrizione": "Modulo gestione Duplex",
             "quantita": 1, "prezzo_unitario": 320.00, "categoria": "Quadri Elettrici"},
            {"codice": "CAVO-INTERCON-DPX", "descrizione": "Cavo interconnessione Duplex",
             "quantita": 1, "prezzo_unitario": 45.00, "categoria": "Cavi"},
        ]
    },

    # ================================================================
    # ILLUMINAZIONE VANO
    # ================================================================
    {
        "id": "ILLUMINAZIONE_VANO",
        "name": "Illuminazione vano",
        "description": "Kit illuminazione vano con strisce LED e prese",
        "version": "1.0",
        "enabled": True,
        "priority": 70,
        "conditions": [
            {"field": "illuminazione_vano", "operator": "equals", "value": "true",
             "description": "Illuminazione vano richiesta"}
        ],
        "materials": [
            {"codice": "KIT-ILL-VANO", "descrizione": "Kit illuminazione vano LED con prese e deviatori",
             "quantita": 1, "prezzo_unitario": 280.00, "categoria": "Illuminazione"},
        ]
    },

    # ================================================================
    # MODULO GSM
    # ================================================================
    {
        "id": "MODULO_GSM",
        "name": "Modulo GSM con antenna",
        "description": "Modulo GSM per combinatore telefonico con prolunga antenna",
        "version": "1.0",
        "enabled": True,
        "priority": 65,
        "conditions": [
            {"field": "modulo_gsm", "operator": "equals", "value": "true",
             "description": "Modulo GSM richiesto"}
        ],
        "materials": [
            {"codice": "MOD-GSM-5M", "descrizione": "Modulo GSM con cavo da 5m",
             "quantita": 1, "prezzo_unitario": 135.00, "categoria": "Comunicazione"},
            {"codice": "PROLUNGA-ANT-20M", "descrizione": "Prolunga antenna GSM 20m",
             "quantita": 1, "prezzo_unitario": 45.00, "categoria": "Comunicazione"},
        ]
    },

    # ================================================================
    # SEGNALAZIONI AL PIANO - OCCUPATO/DIREZIONE/POSIZIONE
    # ================================================================
    {
        "id": "SEGN_TUTTI_PIANI",
        "name": "Segnalazioni a tutti i piani",
        "description": "Posizione e direzione visibili a tutti i piani",
        "version": "1.0",
        "enabled": True,
        "priority": 35,
        "conditions": [
            {"field": "segnalazioni_posizione", "operator": "equals", "value": "Tutti i piani",
             "description": "Segnalazione posizione a tutti i piani"}
        ],
        "materials": [
            {"codice": "DISP-POS-PIANO", "descrizione": "Display posizione al piano",
             "quantita": 1, "prezzo_unitario": 55.00, "categoria": "Segnalazione",
             "note": "Quantità = numero fermate"},
        ]
    },

    # ================================================================
    # LANTERNE
    # ================================================================
    {
        "id": "LANTERNE",
        "name": "Lanterne di piano",
        "description": "Lanterne segnalazione direzione ai piani",
        "version": "1.0",
        "enabled": True,
        "priority": 45,
        "conditions": [
            {"field": "lanterne", "operator": "equals", "value": "true",
             "description": "Lanterne richieste"}
        ],
        "materials": [
            {"codice": "LANT-PIANO-DMG", "descrizione": "Lanterna di piano DMG segnalazione rotonda",
             "quantita": 1, "prezzo_unitario": 42.00, "categoria": "Segnalazione",
             "note": "Quantità = numero fermate"},
        ]
    },

    # ================================================================
    # DISPOSITIVI POSIZIONE CABINA (CPE)
    # ================================================================
    {
        "id": "CPE_POSIZIONE",
        "name": "CPE Posizione cabina in locale macchina",
        "description": "Dispositivo CPE per indicazione posizione cabina nel locale macchina",
        "version": "1.0",
        "enabled": True,
        "priority": 60,
        "conditions": [
            {"field": "con_locale_macchina", "operator": "equals", "value": "true",
             "description": "Con locale macchina"}
        ],
        "materials": [
            {"codice": "CPE-LOC-MACCH", "descrizione": "CPE posizione cabina in locale macchina",
             "quantita": 1, "prezzo_unitario": 95.00, "categoria": "Segnalazione"},
        ]
    },

    # ================================================================
    # QUADRO DISPOSIZIONE - NELL'ARMADIO
    # ================================================================
    {
        "id": "DISP_QUADRO_ARMADIO",
        "name": "Quadro disposizione nell'armadio",
        "description": "Supporto armadio per installazione quadro nel vano",
        "version": "1.0",
        "enabled": True,
        "priority": 35,
        "conditions": [
            {"field": "disposizione_quadro", "operator": "equals", "value": "Nell'armadio",
             "description": "Quadro installato nell'armadio nel vano"}
        ],
        "materials": [
            {"codice": "SUPP-ARMADIO", "descrizione": "Supporto armadio per quadro nel vano",
             "quantita": 1, "prezzo_unitario": 220.00, "categoria": "Carpenteria"},
        ]
    },

    # ================================================================
    # SCALA MOBILE - QUADRO FORZA MOTRICE
    # ================================================================
    {
        "id": "SCALA_MOBILE_QFM",
        "name": "Scala mobile - Quadro forza motrice",
        "description": "Quadro forza motrice e cassette per scala mobile",
        "version": "1.0",
        "enabled": True,
        "priority": 10,
        "conditions": [
            {"field": "tipo_impianto", "operator": "equals", "value": "scala_mobile",
             "description": "Tipo impianto scala mobile"}
        ],
        "materials": [
            {"codice": "QFM-SCALA", "descrizione": "Quadro forza motrice scala mobile",
             "quantita": 1, "prezzo_unitario": 1850.00, "categoria": "Quadri Elettrici"},
            {"codice": "CASS-DERIV-INF", "descrizione": "Cassetta derivazione fossa inferiore",
             "quantita": 1, "prezzo_unitario": 120.00, "categoria": "Cassette"},
            {"codice": "CASS-DERIV-SUP", "descrizione": "Cassetta derivazione fossa superiore",
             "quantita": 1, "prezzo_unitario": 120.00, "categoria": "Cassette"},
            {"codice": "BOTT-ISP-SCALA", "descrizione": "Bottoniera ispezione con 5.5m cavo",
             "quantita": 1, "prezzo_unitario": 75.00, "categoria": "Bottoniere"},
            {"codice": "SENS-CORRIM-2X", "descrizione": "Sensori controllo corrimano SX/DX",
             "quantita": 2, "prezzo_unitario": 45.00, "categoria": "Sicurezza"},
            {"codice": "SENS-GRAD-VEL", "descrizione": "Sensori presenza gradini + direzione + velocità",
             "quantita": 2, "prezzo_unitario": 55.00, "categoria": "Sicurezza"},
            {"codice": "DISP-ERR-SCALA", "descrizione": "Display segnalazione codici errori con 10m cavo",
             "quantita": 1, "prezzo_unitario": 85.00, "categoria": "Segnalazione"},
        ]
    },

    # ================================================================
    # SCALA MOBILE - AVVIAMENTO VVVF
    # ================================================================
    {
        "id": "SCALA_MOBILE_VVVF",
        "name": "Scala mobile - Avviamento VVVF",
        "description": "Quadro VVVF per scala mobile con avviamento inverter",
        "version": "1.0",
        "enabled": True,
        "priority": 15,
        "conditions": [
            {"field": "tipo_impianto", "operator": "equals", "value": "scala_mobile",
             "description": "Tipo impianto scala mobile"},
            {"field": "avviamento", "operator": "equals", "value": "VVVF",
             "description": "Avviamento VVVF"}
        ],
        "materials": [
            {"codice": "QDR-VVVF-SCALA", "descrizione": "Quadro VVVF per scala mobile",
             "quantita": 1, "prezzo_unitario": 980.00, "categoria": "Quadri Elettrici"},
        ]
    },

    # ================================================================
    # MATERIALE A COMPLETAMENTO
    # ================================================================
    {
        "id": "MAT_COMPLETAMENTO",
        "name": "Materiale a completamento",
        "description": "Kit materiale standard di completamento (fascette, nastro, schemi, certificazioni)",
        "version": "1.0",
        "enabled": True,
        "priority": 90,
        "conditions": [
            {"field": "tipo_impianto", "operator": "in", "value": ["ascensore", "scala_mobile", "tappeto_mobile"],
             "description": "Qualsiasi tipo impianto"}
        ],
        "materials": [
            {"codice": "KIT-COMPL-STD", "descrizione": "Kit completamento (fascette, nastro, accessori)",
             "quantita": 1, "prezzo_unitario": 45.00, "categoria": "Accessori"},
            {"codice": "DOC-SCHEMI-CERT", "descrizione": "Schemi elettrici, manuale, certificazioni",
             "quantita": 1, "prezzo_unitario": 35.00, "categoria": "Documentazione"},
        ]
    },

    # ================================================================
    # FOSSA/TESTATA RIDOTTA
    # ================================================================
    {
        "id": "FOSSA_TESTATA_RIDOTTA",
        "name": "Opzioni fossa/testata ridotta",
        "description": "Componenti aggiuntivi per fossa e/o testata ridotta",
        "version": "1.0",
        "enabled": True,
        "priority": 60,
        "conditions": [
            {"field": "fossa_ridotta", "operator": "equals", "value": "true",
             "description": "Fossa ridotta"}
        ],
        "materials": [
            {"codice": "SEMAF-FOSSA-RID", "descrizione": "Semaforo ingresso vano per fossa ridotta",
             "quantita": 1, "prezzo_unitario": 55.00, "categoria": "Sicurezza"},
            {"codice": "STOP-TETTO-2", "descrizione": "2° Stop tetto cabina",
             "quantita": 1, "prezzo_unitario": 22.00, "categoria": "Sicurezza"},
        ]
    },

]


def genera_regole():
    """Genera tutti i file JSON delle regole"""
    os.makedirs(RULES_DIR, exist_ok=True)

    # Backup regole esistenti
    existing = [f for f in os.listdir(RULES_DIR) if f.endswith(".json")]
    if existing:
        backup_dir = os.path.join(RULES_DIR, "backup_precedenti")
        os.makedirs(backup_dir, exist_ok=True)
        import shutil
        for f in existing:
            shutil.copy2(os.path.join(RULES_DIR, f), os.path.join(backup_dir, f))
        print(f"📁 Backup di {len(existing)} regole esistenti in {backup_dir}/")

    # Genera nuove regole
    count = 0
    for rule in RULES:
        filename = f"rule_{rule['id']}.json"
        filepath = os.path.join(RULES_DIR, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(rule, f, indent=2, ensure_ascii=False)
        count += 1

    print(f"\n{'='*60}")
    print(f"  ✅ GENERATE {count} REGOLE IN {RULES_DIR}/")
    print(f"{'='*60}")

    # Riepilogo per categoria
    categorie = {}
    for rule in RULES:
        cat = rule["id"].split("_")[0]
        categorie[cat] = categorie.get(cat, 0) + 1

    print(f"\n  Riepilogo:")
    for cat, n in sorted(categorie.items()):
        print(f"    {cat:30s} {n} regole")

    tot_mat = sum(len(r["materials"]) for r in RULES)
    print(f"\n  Totale materiali generabili: {tot_mat}")
    print(f"  Priorità range: {min(r['priority'] for r in RULES)} - {max(r['priority'] for r in RULES)}")

    print(f"\n  📌 Campi configuratore usati nelle condizioni:")
    campi_usati = set()
    for r in RULES:
        for c in r["conditions"]:
            campi_usati.add(c["field"])
    for campo in sorted(campi_usati):
        print(f"     • {campo}")

    print(f"\n  ▶️  Riavvia il backend per caricare le nuove regole")


if __name__ == "__main__":
    genera_regole()
