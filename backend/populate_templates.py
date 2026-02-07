"""
Popola i template con le icone corrette.
Eseguire dalla cartella backend:  python populate_templates.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "configuratore.db")

TEMPLATES = [
    # RISE
    ("RISE", "GL", "GEARLESS", "Ascensore gearless MRL", "equa-rise-GL-color", 1),
    ("RISE", "GD", "GEARED",   "Ascensore geared con locale macchina", "equa-rise-GD-color", 2),
    ("RISE", "HY", "HYDRAULIC", "Ascensore oleodinamico", "equa-rise-HY-color", 3),
    # HOME
    ("HOME", "GL", "GEARLESS",  "Ascensore residenziale gearless", "equa-home-GL-color", 1),
    ("HOME", "2GL", "DOUBLE GEARLESS", "Doppio gearless residenziale", "equa-home-2GL-color", 2),
    ("HOME", "HY", "HYDRAULIC", "Ascensore residenziale oleodinamico", "equa-home-HY-color", 3),
]

def populate():
    if not os.path.exists(DB_PATH):
        print(f"❌ Database non trovato: {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    for cat, subcat, nome, desc, icona, ordine in TEMPLATES:
        # Controlla se esiste già
        cursor.execute(
            "SELECT id FROM product_templates WHERE categoria=? AND sottocategoria=?",
            (cat, subcat)
        )
        existing = cursor.fetchone()

        if existing:
            # Aggiorna solo l'icona
            cursor.execute(
                "UPDATE product_templates SET icona=?, nome_display=?, descrizione=?, ordine=? WHERE id=?",
                (icona, nome, desc, ordine, existing[0])
            )
            print(f"  🔄 Aggiornato: {cat} / {nome} → icona: {icona}")
        else:
            cursor.execute(
                "INSERT INTO product_templates (categoria, sottocategoria, nome_display, descrizione, icona, ordine, attivo) VALUES (?,?,?,?,?,?,1)",
                (cat, subcat, nome, desc, icona, ordine)
            )
            print(f"  ✅ Creato: {cat} / {nome} → icona: {icona}")

    conn.commit()
    conn.close()
    print("\n🎉 Template popolati con icone!")

if __name__ == "__main__":
    populate()
