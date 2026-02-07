# 🚀 Configuratore Elettroquadri - Codice Completo

## 📦 Struttura Progetto

```
configuratore-elettroquadri/
├── backend/                 # FastAPI Backend
│   ├── main.py             # FastAPI app principale
│   ├── models.py           # Modelli SQLAlchemy
│   ├── schemas.py          # Schemi Pydantic
│   ├── auth.py             # Autenticazione JWT
│   ├── rule_engine.py      # Motore regole business
│   ├── database.py         # Configurazione database
│   └── init_demo_data.py   # Script popolamento database
├── frontend/               # React TypeScript Frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   └── ConfiguratorPage.tsx
│   │   ├── lib/
│   │   │   └── api.ts      # API client axios
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── tsconfig.json
└── requirements.txt        # Dipendenze Python
```

---

## 🔧 Setup Backend (FastAPI)

### 1. Installa Python 3.10+

```bash
python --version  # Verifica versione Python
```

### 2. Crea Virtual Environment

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

### 3. Installa Dipendenze

```bash
pip install -r ../requirements.txt
```

### 4. Inizializza Database

```bash
python init_demo_data.py
```

Output:
```
🔧 Inizializzazione database demo...
👥 Creazione utenti...
  ✅ Admin creato
  ✅ Commerciale Mario Rossi creato
🏢 Creazione clienti demo...
  ✅ Cliente Edilprogress creato
  ✅ Cliente Città Futura creato
📋 Creazione regole business...
  ✅ Regola BOM_GEARLESS_MRL creata
  ... (7 regole totali)
✅ Database demo inizializzato con successo!

📝 Credenziali demo:
  Admin:
    Username: admin
    Password: admin123

  Commerciale:
    Username: mario.rossi
    Password: password123
```

### 5. Avvia Backend

```bash
python main.py
```

**Backend in esecuzione su:** `http://localhost:8000`

**Documentazione API:** `http://localhost:8000/docs`

---

## 🎨 Setup Frontend (React)

### 1. Installa Node.js 18+

```bash
node --version  # Verifica versione Node
```

### 2. Installa Dipendenze

```bash
cd frontend
npm install
```

### 3. Avvia Frontend

```bash
npm run dev
```

**Frontend in esecuzione su:** `http://localhost:5173`

---

## 🎬 Test Sistema Completo

### 1. Apri Browser

Vai su: `http://localhost:5173`

### 2. Login

Usa credenziali:
- **Username:** `admin` (o `mario.rossi`)
- **Password:** `admin123` (o `password123`)

### 3. Crea Preventivo (Tramite API)

**Opzione A: Usa cURL**

```bash
# Login e ottieni token
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: multipart/form-data" \
  -F "username=admin" \
  -F "password=admin123"

# Salva il token: "access_token": "eyJ..."

# Crea preventivo
curl -X POST http://localhost:8000/api/preventivi \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_QUI" \
  -d '{
    "tipo": "prodotto_completo",
    "cliente_id": 1,
    "nome_commessa": "Ascensore Condominio Via Roma"
  }'

# Salva l'ID preventivo: es. 1
```

**Opzione B: Usa Swagger UI**

1. Vai su `http://localhost:8000/docs`
2. Clicca "Authorize" in alto a destra
3. Username: `admin`, Password: `admin123`
4. Clicca `POST /api/preventivi`
5. Clicca "Try it out"
6. Body:
```json
{
  "tipo": "prodotto_completo",
  "cliente_id": 1,
  "nome_commessa": "Ascensore Condominio Via Roma"
}
```
7. Clicca "Execute"
8. Copia l'ID dal response (es. `"id": 1`)

### 4. Apri Configuratore

Vai su: `http://localhost:5173/preventivi/1/configuratore`

(Sostituisci `1` con l'ID del preventivo creato)

### 5. Test Regole Automatiche

1. **Seleziona Trazione:** "Gearless MRL"
2. **Clicca:** "⚡ Calcola Materiali Automaticamente"
3. **Risultato:** Vedrai 4 materiali aggiunti automaticamente!
   - QUADRO_QM_GL_001
   - INVERTER_GL_400V
   - SENSORE_POS_MAG
   - KIT_CABLAGGI_GL

4. **Aggiungi altre opzioni:**
   - Normativa: "EN81-20:2020" → +2 materiali
   - Tipo Porte: "Automatiche" → +2 materiali
   - UPS Backup: "Sì" → +1 materiale
   - Telecontrollo: "Sì" → +1 materiale

5. **Totale possibile:** 10+ materiali aggiunti automaticamente! 🎉

---

## 📋 Credenziali Demo

### Utenti

| Username | Password | Ruolo |
|----------|----------|-------|
| `admin` | `admin123` | Amministratore |
| `mario.rossi` | `password123` | Commerciale |

### Clienti

1. **Costruzioni Edilprogress S.r.l.**
   - P.IVA: IT12345678901
   - Città: Milano

2. **Immobiliare Città Futura S.p.A.**
   - P.IVA: IT98765432109
   - Città: Roma

### Regole Business (7 totali)

1. **BOM_GEARLESS_MRL** - Aggiunge 4 componenti per Gearless
2. **BOM_GEARED** - Aggiunge 2 componenti per Geared
3. **BOM_EN81_20** - Aggiunge 2 componenti normativa EN81-20
4. **BOM_PORTE_AUTOMATICHE** - Aggiunge operatore porte
5. **BOM_FERMATE_MULTIPLE** - Scheda espansione se >5 fermate
6. **BOM_UPS_BACKUP** - UPS se richiesto
7. **BOM_TELECONTROLLO** - Modulo GSM se richiesto

---

## 🧪 Test API (Swagger UI)

### Documentazione Interattiva

Vai su: `http://localhost:8000/docs`

### Endpoint Principali

**AUTH:**
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Info utente corrente

**CLIENTI:**
- `GET /api/clienti` - Lista clienti
- `POST /api/clienti` - Crea cliente
- `GET /api/clienti/{id}` - Dettaglio cliente

**PREVENTIVI:**
- `GET /api/preventivi` - Lista preventivi
- `POST /api/preventivi` - Crea preventivo
- `GET /api/preventivi/{id}` - Dettaglio preventivo
- `PUT /api/preventivi/{id}` - Aggiorna preventivo
- `POST /api/preventivi/{id}/evaluate-rules` - ⚡ Valuta regole (KEY!)

**MATERIALI:**
- `GET /api/preventivi/{id}/materiali` - Lista materiali
- `POST /api/materiali` - Aggiungi materiale
- `PUT /api/materiali/{id}` - Aggiorna materiale
- `DELETE /api/materiali/{id}` - Elimina materiale

**REGOLE (Admin Only):**
- `GET /api/regole` - Lista regole
- `POST /api/regole` - Crea regola
- `PUT /api/regole/{id}` - Aggiorna regola

---

## 🎯 Flusso Demo Completo

### Step 1: Login
1. Apri `http://localhost:5173`
2. Login con `admin` / `admin123`

### Step 2: Crea Preventivo (via API)
```bash
curl -X POST http://localhost:8000/api/preventivi \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tipo": "prodotto_completo",
    "cliente_id": 1,
    "nome_commessa": "Demo Ascensore"
  }'
```

### Step 3: Configuratore
1. Vai su `http://localhost:5173/preventivi/1/configuratore`
2. Compila form:
   - Trazione: Gearless MRL
   - Normativa: EN81-20:2020
   - Numero fermate: 6
   - Tipo porte: Automatiche
   - UPS backup: Sì
   - Telecontrollo: Sì

### Step 4: Calcola Materiali
1. Clicca "⚡ Calcola Materiali Automaticamente"
2. Vedrai ~10 materiali aggiunti
3. Totale aggiornato in tempo reale

### Step 5: Modifica Configurazione
1. Cambia Trazione: Geared
2. Clicca di nuovo "Calcola Materiali"
3. Materiali precedenti rimossi, nuovi aggiunti

---

## 🔍 Debug & Troubleshooting

### Backend non parte

**Errore:** `ModuleNotFoundError: No module named 'fastapi'`

**Soluzione:**
```bash
pip install -r requirements.txt
```

---

**Errore:** `sqlite3.OperationalError: table users has no column named...`

**Soluzione:**
```bash
rm elettroquadri_demo.db  # Elimina database
python init_demo_data.py   # Ricrea database
```

---

### Frontend non parte

**Errore:** `Cannot find module 'react'`

**Soluzione:**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

---

**Errore:** CORS errors in console

**Soluzione:**

Verifica che backend sia in esecuzione su `localhost:8000`

Verifica in `backend/main.py` che CORS sia configurato:
```python
allow_origins=["http://localhost:5173"]
```

---

### Login non funziona

**Sintomo:** "401 Unauthorized"

**Verifica:**

1. Backend in esecuzione?
```bash
curl http://localhost:8000/api/health
# Deve restituire: {"status":"ok","timestamp":"..."}
```

2. Database inizializzato?
```bash
cd backend
python init_demo_data.py
```

3. Credenziali corrette?
- Username: `admin`
- Password: `admin123`

---

### Materiali non vengono aggiunti

**Verifica regole:**

```bash
curl http://localhost:8000/api/regole \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Devono esserci 7 regole con `"attiva": true`

**Se mancano:**
```bash
cd backend
python init_demo_data.py
```

---

## 📁 File Importanti

### Backend

- **`main.py`** - 700+ righe, tutti gli endpoint API
- **`models.py`** - Modelli SQLAlchemy (User, Cliente, Preventivo, Materiale, Regola)
- **`rule_engine.py`** - Motore valutazione regole automatiche
- **`init_demo_data.py`** - Popolamento database con 7 regole

### Frontend

- **`src/lib/api.ts`** - Client API completo con axios
- **`src/pages/LoginPage.tsx`** - Pagina login
- **`src/pages/ConfiguratorPage.tsx`** - Form configuratore + BOM live

---

## 🚀 Prossimi Step (per Demo Completa)

### Backend
- [ ] Endpoint lista preventivi
- [ ] PDF generation
- [ ] Gestione utenti (CRUD completo)
- [ ] Statistiche/dashboard

### Frontend
- [ ] HomePage con lista preventivi
- [ ] Pagina creazione preventivo
- [ ] Navbar con logout
- [ ] Toast notifications animate
- [ ] Tabella materiali con drag & drop
- [ ] Preview PDF inline

---

## 💾 Database

**File:** `elettroquadri_demo.db` (SQLite)

**Tabelle:**
- `users` - Utenti sistema
- `clienti` - Anagrafica clienti
- `preventivi` - Preventivi/offerte
- `materiali` - Materiali BOM 1° livello
- `regole` - Regole business

**Reset database:**
```bash
cd backend
rm elettroquadri_demo.db
python init_demo_data.py
```

---

## ✅ Sistema Funzionante!

**Hai:**
- ✅ Backend FastAPI completo (8 file)
- ✅ Frontend React TypeScript (12 file)
- ✅ Sistema autenticazione JWT
- ✅ Rule engine automatico
- ✅ 7 regole business demo
- ✅ Database pre-popolato
- ✅ API documentata (Swagger)
- ✅ Configuratore funzionante

**Demo WOW moment:**
1. Login → Configuratore
2. Seleziona "Gearless MRL"
3. Clicca "Calcola Materiali"
4. 💥 4 materiali appaiono in 0.5 secondi!

---

## 🎉 Ready for Demo!

**Start Everything:**

Terminal 1 (Backend):
```bash
cd backend
source venv/bin/activate  # o venv\Scripts\activate su Windows
python main.py
```

Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```

**Open:** `http://localhost:5173`

**Login:** `admin` / `admin123`

**Crea preventivo:** Via API o Swagger

**Demo:** `http://localhost:5173/preventivi/1/configuratore`

**SPACCA!** 🚀🔥
