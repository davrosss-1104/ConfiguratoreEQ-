"""
init_demo_data.py - Popola database con dati demo per presentazione
"""
import sys
sys.path.insert(0, '.')

from database import SessionLocal, init_db
from models import User, Cliente, Preventivo, Materiale, Regola
from auth import get_password_hash
from datetime import datetime


def init_demo_database():
    """Inizializza database con dati demo"""
    
    print("🔧 Inizializzazione database demo...")
    
    # Crea tabelle
    init_db()
    
    db = SessionLocal()
    
    try:
        # 1. UTENTI
        print("\n👥 Creazione utenti...")
        
        if not db.query(User).filter(User.username == "admin").first():
            admin = User(
                username="admin",
                email="admin@elettroquadri.it",
                full_name="Amministratore",
                hashed_password=get_password_hash("admin123"),
                is_admin=True,
                is_active=True
            )
            db.add(admin)
            print("  ✅ Admin creato")
        
        if not db.query(User).filter(User.username == "mario.rossi").first():
            commerciale = User(
                username="mario.rossi",
                email="mario.rossi@elettroquadri.it",
                full_name="Mario Rossi",
                hashed_password=get_password_hash("password123"),
                is_admin=False,
                is_active=True
            )
            db.add(commerciale)
            print("  ✅ Commerciale Mario Rossi creato")
        
        db.commit()
        
        # 2. CLIENTI
        print("\n🏢 Creazione clienti demo...")
        
        if not db.query(Cliente).filter(Cliente.ragione_sociale == "Costruzioni Edilprogress S.r.l.").first():
            cliente1 = Cliente(
                ragione_sociale="Costruzioni Edilprogress S.r.l.",
                partita_iva="IT12345678901",
                indirizzo="Via Roma 123",
                citta="Milano",
                cap="20100",
                provincia="MI",
                telefono="02-12345678",
                email="info@edilprogress.it",
                referente="Ing. Giuseppe Verdi"
            )
            db.add(cliente1)
            print("  ✅ Cliente Edilprogress creato")
        
        if not db.query(Cliente).filter(Cliente.ragione_sociale == "Immobiliare Città Futura S.p.A.").first():
            cliente2 = Cliente(
                ragione_sociale="Immobiliare Città Futura S.p.A.",
                partita_iva="IT98765432109",
                indirizzo="Corso Italia 456",
                citta="Roma",
                cap="00100",
                provincia="RM",
                telefono="06-98765432",
                email="progetti@cittafutura.it",
                referente="Arch. Laura Bianchi"
            )
            db.add(cliente2)
            print("  ✅ Cliente Città Futura creato")
        
        db.commit()
        
        # 3. REGOLE DEMO
        print("\n📋 Creazione regole business...")
        
        regole_demo = [
            {
                "rule_id": "BOM_GEARLESS_MRL",
                "nome": "BOM Gearless MRL",
                "descrizione": "Aggiunge componenti per ascensore Gearless MRL",
                "categoria": "BOM",
                "priorita": 100,
                "rule_json": {
                    "conditions": {
                        "field": "trazione",
                        "operator": "equals",
                        "value": "Gearless MRL"
                    },
                    "actions": [
                        {
                            "action": "add_material",
                            "material": {
                                "codice": "QUADRO_QM_GL_001",
                                "descrizione": "Quadro manovra Gearless completo",
                                "categoria": "quadro_elettrico",
                                "quantita": 1,
                                "unita_misura": "pz",
                                "prezzo_unitario": 1200.00,
                                "ordine": 10
                            }
                        },
                        {
                            "action": "add_material",
                            "material": {
                                "codice": "INVERTER_GL_400V",
                                "descrizione": "Inverter Gearless 400V",
                                "categoria": "componenti_elettrici",
                                "quantita": 1,
                                "unita_misura": "pz",
                                "prezzo_unitario": 850.00,
                                "ordine": 20
                            }
                        },
                        {
                            "action": "add_material",
                            "material": {
                                "codice": "SENSORE_POS_MAG",
                                "descrizione": "Sensore posizione magnetico",
                                "categoria": "componenti_elettrici",
                                "quantita": 1,
                                "unita_misura": "pz",
                                "prezzo_unitario": 120.00,
                                "ordine": 30
                            }
                        },
                        {
                            "action": "add_material",
                            "material": {
                                "codice": "KIT_CABLAGGI_GL",
                                "descrizione": "Kit cablaggi Gearless",
                                "categoria": "cablaggi",
                                "quantita": 1,
                                "unita_misura": "kit",
                                "prezzo_unitario": 350.00,
                                "ordine": 40
                            }
                        }
                    ]
                }
            },
            {
                "rule_id": "BOM_GEARED",
                "nome": "BOM Geared",
                "descrizione": "Aggiunge componenti per ascensore Geared",
                "categoria": "BOM",
                "priorita": 100,
                "rule_json": {
                    "conditions": {
                        "field": "trazione",
                        "operator": "equals",
                        "value": "Geared"
                    },
                    "actions": [
                        {
                            "action": "add_material",
                            "material": {
                                "codice": "QUADRO_QM_GE_001",
                                "descrizione": "Quadro manovra Geared completo",
                                "categoria": "quadro_elettrico",
                                "quantita": 1,
                                "unita_misura": "pz",
                                "prezzo_unitario": 1050.00,
                                "ordine": 10
                            }
                        },
                        {
                            "action": "add_material",
                            "material": {
                                "codice": "MOTORE_GEARED_7.5KW",
                                "descrizione": "Motore Geared 7.5kW",
                                "categoria": "componenti_meccanici",
                                "quantita": 1,
                                "unita_misura": "pz",
                                "prezzo_unitario": 680.00,
                                "ordine": 20
                            }
                        }
                    ]
                }
            },
            {
                "rule_id": "BOM_EN81_20",
                "nome": "BOM EN81-20:2020",
                "descrizione": "Aggiunge componenti per normativa EN81-20:2020",
                "categoria": "BOM",
                "priorita": 200,
                "rule_json": {
                    "conditions": {
                        "field": "normativa",
                        "operator": "equals",
                        "value": "EN81-20:2020"
                    },
                    "actions": [
                        {
                            "action": "add_material",
                            "material": {
                                "codice": "DISPOSITIVO_EN81_20",
                                "descrizione": "Dispositivo sicurezza EN81-20:2020",
                                "categoria": "sicurezza",
                                "quantita": 1,
                                "unita_misura": "pz",
                                "prezzo_unitario": 450.00,
                                "ordine": 50
                            }
                        },
                        {
                            "action": "add_material",
                            "material": {
                                "codice": "SEGNALETICA_EN81",
                                "descrizione": "Kit segnaletica EN81-20",
                                "categoria": "accessori",
                                "quantita": 1,
                                "unita_misura": "kit",
                                "prezzo_unitario": 85.00,
                                "ordine": 60
                            }
                        }
                    ]
                }
            },
            {
                "rule_id": "BOM_PORTE_AUTOMATICHE",
                "nome": "BOM Porte Automatiche",
                "descrizione": "Aggiunge operatore e sicurezze per porte automatiche",
                "categoria": "BOM",
                "priorita": 150,
                "rule_json": {
                    "conditions": {
                        "field": "tipo_porte",
                        "operator": "equals",
                        "value": "Automatiche"
                    },
                    "actions": [
                        {
                            "action": "add_material",
                            "material": {
                                "codice": "OPERATORE_PORTE_AUTO",
                                "descrizione": "Operatore porte automatiche",
                                "categoria": "componenti_meccanici",
                                "quantita": 1,
                                "unita_misura": "pz",
                                "prezzo_unitario": 580.00,
                                "ordine": 70
                            }
                        },
                        {
                            "action": "add_material",
                            "material": {
                                "codice": "FOTOCELLULE_PORTE",
                                "descrizione": "Fotocellule sicurezza porte",
                                "categoria": "sicurezza",
                                "quantita": 2,
                                "unita_misura": "pz",
                                "prezzo_unitario": 95.00,
                                "ordine": 80
                            }
                        }
                    ]
                }
            },
            {
                "rule_id": "BOM_FERMATE_MULTIPLE",
                "nome": "BOM Fermate Multiple",
                "descrizione": "Aggiunge componenti per fermate >5",
                "categoria": "BOM",
                "priorita": 120,
                "rule_json": {
                    "conditions": {
                        "field": "numero_fermate",
                        "operator": "greater_than",
                        "value": 5
                    },
                    "actions": [
                        {
                            "action": "add_material",
                            "material": {
                                "codice": "SCHEDA_ESPANSIONE_IO",
                                "descrizione": "Scheda espansione I/O",
                                "categoria": "componenti_elettrici",
                                "quantita": 1,
                                "unita_misura": "pz",
                                "prezzo_unitario": 220.00,
                                "ordine": 90
                            }
                        }
                    ]
                }
            },
            {
                "rule_id": "BOM_UPS_BACKUP",
                "nome": "BOM UPS Backup",
                "descrizione": "Aggiunge UPS se richiesto backup",
                "categoria": "BOM",
                "priorita": 180,
                "rule_json": {
                    "conditions": {
                        "field": "ups_backup",
                        "operator": "equals",
                        "value": "Sì"
                    },
                    "actions": [
                        {
                            "action": "add_material",
                            "material": {
                                "codice": "UPS_1500VA",
                                "descrizione": "UPS 1500VA per quadro",
                                "categoria": "alimentazione",
                                "quantita": 1,
                                "unita_misura": "pz",
                                "prezzo_unitario": 380.00,
                                "ordine": 100
                            }
                        }
                    ]
                }
            },
            {
                "rule_id": "BOM_TELECONTROLLO",
                "nome": "BOM Telecontrollo",
                "descrizione": "Aggiunge modulo telecontrollo se richiesto",
                "categoria": "BOM",
                "priorita": 190,
                "rule_json": {
                    "conditions": {
                        "field": "telecontrollo",
                        "operator": "equals",
                        "value": "Sì"
                    },
                    "actions": [
                        {
                            "action": "add_material",
                            "material": {
                                "codice": "MODULO_GSM_4G",
                                "descrizione": "Modulo telecontrollo GSM/4G",
                                "categoria": "elettronica",
                                "quantita": 1,
                                "unita_misura": "pz",
                                "prezzo_unitario": 295.00,
                                "ordine": 110
                            }
                        }
                    ]
                }
            }
        ]
        
        for regola_data in regole_demo:
            existing = db.query(Regola).filter(Regola.rule_id == regola_data["rule_id"]).first()
            if not existing:
                regola = Regola(**regola_data, created_by="admin", attiva=True)
                db.add(regola)
                print(f"  ✅ Regola {regola_data['rule_id']} creata")
        
        db.commit()
        
        print("\n✅ Database demo inizializzato con successo!")
        print("\n📝 Credenziali demo:")
        print("  Admin:")
        print("    Username: admin")
        print("    Password: admin123")
        print("\n  Commerciale:")
        print("    Username: mario.rossi")
        print("    Password: password123")
        
    except Exception as e:
        print(f"\n❌ Errore: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    init_demo_database()
