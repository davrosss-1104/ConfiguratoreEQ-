"""
Script semplice per creare utenti demo
"""
from database import SessionLocal, init_db
from models import User
from auth import get_password_hash

def create_demo_users():
    """Crea utenti demo"""
    
    print("📊 Inizializzazione database...")
    init_db()
    
    db = SessionLocal()
    
    try:
        print("👥 Creazione utenti...")
        
        # Admin
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin = User(
                username="admin",
                email="admin@elettroquadri.net",
                full_name="Amministratore",
                hashed_password=get_password_hash("admin123"),
                role="admin",
                is_active=True
            )
            db.add(admin)
            db.commit()
            print("  ✅ Admin creato: admin / admin123")
        else:
            print("  ⚠️  Admin già esistente")
        
        # Commerciale
        commerciale = db.query(User).filter(User.username == "mario.rossi").first()
        if not commerciale:
            commerciale = User(
                username="mario.rossi",
                email="mario.rossi@elettroquadri.net",
                full_name="Mario Rossi",
                hashed_password=get_password_hash("password123"),
                role="user",
                is_active=True
            )
            db.add(commerciale)
            db.commit()
            print("  ✅ Commerciale creato: mario.rossi / password123")
        else:
            print("  ⚠️  Commerciale già esistente")
        
        print("\n" + "="*50)
        print("✅ UTENTI CREATI CON SUCCESSO!")
        print("="*50)
        print("\n📝 CREDENZIALI:")
        print("  Admin: admin / admin123")
        print("  Commerciale: mario.rossi / password123")
        print("\n🎯 Puoi accedere all'applicazione!")
        
    except Exception as e:
        print(f"\n❌ Errore: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    create_demo_users()
