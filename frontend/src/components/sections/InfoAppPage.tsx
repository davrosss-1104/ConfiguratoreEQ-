import { useState } from 'react';
import {
  Info, History, BookOpen, FileSpreadsheet, ChevronDown, ChevronRight,
  ExternalLink, Package, Cpu, Database, Layout, Zap, Shield, Mail,
  CheckCircle2, Clock, Tag, Download
} from 'lucide-react';

const API_BASE = 'http://localhost:8000';

// ==========================================
// DATI APP
// ==========================================

const APP_INFO = {
  nome: 'Configuratore Elettroquadri',
  versione: '2.1.0',
  build: '2026-02-22',
  descrizione: 'Sistema di configurazione e preventivazione per quadri elettrici ascensori, piattaforme e scale mobili.',
  sviluppatore: 'B-CONN SRLS',
  cliente: 'Elettroquadri S.r.l.',
  stack: [
    { nome: 'Backend', tech: 'FastAPI + SQLAlchemy + SQLite/SQL Server', icon: Database },
    { nome: 'Frontend', tech: 'React 18 + TypeScript + Vite + shadcn/ui', icon: Layout },
    { nome: 'Rule Engine', tech: 'JSON rules + lookup tables + catalog match', icon: Zap },
    { nome: 'Documenti', tech: 'python-docx → Word/PDF', icon: FileSpreadsheet },
  ],
};

interface Revisione {
  versione: string;
  data: string;
  tipo: 'major' | 'minor' | 'patch' | 'fix';
  titolo: string;
  dettagli: string[];
}

const STORICO_REVISIONI: Revisione[] = [
  {
    versione: '2.1.0', data: '2026-02-22', tipo: 'minor',
    titolo: 'Import Excel con _MAPPA',
    dettagli: [
      'Nuovo modulo import Excel generico con foglio _MAPPA',
      'Supporto tipi tabella: lookup_range, catalogo, costanti',
      'Colonne ART: per codici articolo direttamente dall\'Excel',
      'Wizard upload con preview, verifica e generazione da interfaccia',
      'Pagina Informazioni App con storico revisioni e documentazione',
    ]
  },
  {
    versione: '2.0.0', data: '2026-02-15', tipo: 'major',
    titolo: 'Form dinamici e sezioni da DB',
    dettagli: [
      'Form preventivo completamente dinamici — campi e sezioni letti dal database',
      'Gestione sezioni con drag & drop per riordino',
      'Gestione campi con assegnazione a sezioni',
      'Gestione opzioni dropdown da interfaccia admin',
      'Auto-save con debounce 3 secondi',
      'Sistema revisioni preventivo (REV.0, REV.1, ...)',
    ]
  },
  {
    versione: '1.8.0', data: '2026-02-01', tipo: 'minor',
    titolo: 'Rule Engine v4 e data tables',
    dettagli: [
      'Action types: lookup_table, catalog_match, accumulate_from_lookup, set_field',
      'Esecuzione sequenziale azioni dentro una singola regola',
      'Data tables da file JSON in ./data/',
      'Variabili _calc.* per calcoli intermedi',
      'Template Mustache nei materiali ({{_calc.xxx}})',
    ]
  },
  {
    versione: '1.5.0', data: '2026-01-15', tipo: 'minor',
    titolo: 'Gestione clienti e BOM',
    dettagli: [
      'Anagrafica clienti con sconti configurabili',
      'Struttura BOM gerarchica',
      'Pannello ordine con calcolo prezzi',
      'Export documenti Word/PDF con template',
    ]
  },
  {
    versione: '1.0.0', data: '2025-12-01', tipo: 'major',
    titolo: 'Rilascio iniziale',
    dettagli: [
      'Configuratore base con sezioni hardcoded',
      'Rule engine con regole JSON da file',
      'Tabella materiali automatica',
      'Integrazione TRUSS 3D',
    ]
  },
];

// ==========================================
// DOCUMENTI GUIDA
// ==========================================
interface Documento {
  id: string;
  titolo: string;
  descrizione: string;
  icon: any;
  contenuto: string;
  allegati?: { nome: string; filename: string; descrizione: string }[];
}

const DOCUMENTI: Documento[] = [
  {
    id: 'import-excel',
    titolo: 'Dall\'Excel alle Regole — Guida operativa',
    descrizione: 'Come preparare un file Excel con foglio _MAPPA per generare tabelle lookup e regole JSON',
    icon: FileSpreadsheet,
    allegati: [
      {
        nome: 'Esempio Contattori Oleodinamici',
        filename: 'esempio_contattori_oleo.xlsx',
        descrizione: 'lookup_range con partizioni 50Hz/60Hz, colonne ART:, 13 righe per partizione'
      },
      {
        nome: 'Esempio Trasformatori e Ponti',
        filename: 'esempio_trasformatori.xlsx',
        descrizione: 'catalogo trasformatori + costanti ponti raddrizzatori, colonne ART:'
      },
    ],
    contenuto: `## Le 3 fasi

Per trasformare le vostre tabelle tecniche Excel in regole che il configuratore può usare, ci sono 3 passaggi:

| Fase | Cosa si fa | Risultato |
|------|-----------|-----------|
| **1. Preparazione** | Organizzare l'Excel e aggiungere il foglio _MAPPA | File Excel pronto per l'import |
| **2. Tabelle lookup** | Upload e generazione tabelle dati dall'interfaccia | Tabelle dati strutturate in JSON |
| **3. Regole** | Creare le regole che usano le tabelle | Regole JSON attive nel configuratore |

Ogni fase è indipendente: cambiano i dati tecnici? Ripetete solo la fase 2. Serve una nuova regola? Solo fase 3.

---

## FASE 1 — Preparare l'Excel

### 1.1 — Organizzare i fogli dati

Ogni foglio dati deve avere una struttura tabellare semplice:
- **Una riga di intestazioni** con nomi colonna leggibili
- **Sotto le intestazioni**: dati, una riga per ogni record
- Niente righe vuote in mezzo ai dati, niente celle unite
- **Celle vuote = dato non disponibile** (il sistema le interpreta così)

Se il vostro Excel ha titoli decorativi o note, spostate i dati puri in fogli puliti. I fogli originali possono restare — il sistema legge solo quelli nella _MAPPA.

### Esempio 1: contattori oleodinamici (lookup_range con partizioni)

Due fogli dati, uno per frequenza. Foglio **"50Hz_400V"**:

| kW | IN (A) | DIR: Cont. | DIR: Mors. | DIR: Filo | ST: KS | ST: KM | SS: Modello | ART: Cont. dir. |
|----|--------|-----------|-----------|----------|--------|--------|------------|-----------------|
| 4.4 | 10.4 | D18 | 10 | 2.5 | D18 | D12 | V40 | EQ-KM018 |
| 7.7 | 18.5 | D25 | 10 | 4 | D18 | D12 | V40 | EQ-KM025 |
| 29.4 | 63 | *(vuoto)* | | | D80 | D50 | V70 | |

Celle vuote = non disponibile a quella potenza. Foglio **"60Hz_440V"**: stessa struttura, valori diversi.

**Perché è un lookup_range**: la chiave è numerica (kW). Il sistema calcola automaticamente le fasce — per es. 7.7 kW cade nella fascia 5.9–9.6 → contattore D25.

**Perché ha partizioni**: la stessa tabella è su 2 fogli, distinti per frequenza (50Hz e 60Hz). Il configuratore sceglie la partizione giusta in base a cosa seleziona l'utente.

### Esempio 2: trasformatori (catalogo)

Un foglio catalogo. Foglio **"Trasformatori standard"**:

| Codice | Tipo | Potenza VA | Primario V | Secondario V | Peso kg | ART: Trasformatore |
|--------|------|-----------|-----------|-------------|---------|-------------------|
| 218 | Monofase | 200 | 230 | 24 | 3.5 | EQ-TRF-218 |
| 305 | Trimono | 630 | 400 | 24 | 10.5 | EQ-TRF-305 |

**Perché è un catalogo**: ogni riga è un prodotto, la scelta avviene per criteri multipli (tipo + potenza + tensione).

### Esempio 3: ponti raddrizzatori (costanti)

Foglio **"Ponti Raddrizzatori"**:

| Tensione freno V | Tipo | Fattore conversione | ART: Ponte |
|-----------------|------|--------------------:|-----------|
| 180 DC | Trifase | 1.35 | EQ-PR-180T |
| 180 DC | Monofase | 0.90 | EQ-PR-180M |
| 105 DC | Trifase | 1.35 | EQ-PR-105T |

**Perché è costanti**: tabella semplice chiave → valore, corrispondenza diretta.

---

### 1.2 — Codici articolo nell'Excel (facoltativo)

Se avete i codici articolo del gestionale, aggiungeteli con colonne che iniziano con **ART:**

Il sistema le riconosce automaticamente e le separa dalle colonne tecniche. I codici finiscono direttamente nelle regole generate.

Se non avete i codici, nessun problema — si inseriscono dopo dall'interfaccia.

---

### 1.3 — Aggiungere il foglio _MAPPA

Aggiungete un foglio chiamato esattamente **_MAPPA** con queste colonne:

| Colonna | Cosa scrivere | Obbligatoria |
|---------|--------------|:---:|
| **foglio** | Nome esatto del foglio dati | ✅ |
| **tipo** | \`lookup_range\`, \`catalogo\`, o \`costanti\` | ✅ |
| **nome_tabella** | Nome per la tabella generata | ✅ |
| **colonna_chiave** | La colonna principale di ricerca | ✅ |
| **tipo_chiave** | \`numero\` oppure \`testo\` | ✅ |
| **partizionato_per** | Campo configuratore che distingue le partizioni | se servono |
| **valore_partizione** | Valore per questo foglio | se servono |
| **riga_intestazioni** | Numero riga intestazioni (default: 1) | no |
| **note** | Note libere, il sistema le ignora | no |

### I 3 tipi di tabella

**\`lookup_range\`** — Chiave numerica, si cerca "in quale fascia cade"
- Esempio: kW 7.7 → fascia 5.9–9.6 → contattore D25
- Il sistema calcola le fasce automaticamente dai valori presenti

**\`catalogo\`** — Elenco prodotti, scelta per criteri multipli
- Esempio: trasformatore monofase ≥ 600 VA con primario 400V
- Ogni riga è un prodotto, ogni colonna è una caratteristica

**\`costanti\`** — Tabella semplice chiave → valore
- Esempio: tensione freno 180V DC + Trifase → ponte EQ-PR-180T

### _MAPPA per i contattori (lookup_range con partizioni)

| foglio | tipo | nome_tabella | colonna_chiave | tipo_chiave | partizionato_per | valore_partizione |
|--------|------|-------------|---------------|-------------|-----------------|------------------|
| 50Hz_400V | lookup_range | contattori_oleo | kW | numero | frequenza_rete | 50 |
| 60Hz_440V | lookup_range | contattori_oleo | kW | numero | frequenza_rete | 60 |

Traduzione: "2 fogli, entrambi lookup per range numerico su kW, stessa tabella \`contattori_oleo\`, distinti per frequenza."

### _MAPPA per trasformatori + ponti (catalogo + costanti)

| foglio | tipo | nome_tabella | colonna_chiave | tipo_chiave | partizionato_per | valore_partizione |
|--------|------|-------------|---------------|-------------|-----------------|------------------|
| Trasformatori standard | catalogo | trasformatori_std | Codice | testo | | |
| Ponti Raddrizzatori | costanti | ponti_raddr | Tensione freno V | testo | | |

Traduzione: "2 fogli indipendenti. Trasformatori è un catalogo (ricerca per codice). Ponti è una tabella costanti (ricerca per tensione freno)."

### Cosa sono le partizioni

A volte la stessa tabella è su più fogli. I contattori hanno un foglio per 50Hz e uno per 60Hz: stessa struttura, valori diversi.

\`partizionato_per\` indica **quale campo del configuratore** determina la partizione. \`valore_partizione\` indica il valore per questo foglio specifico.

Se l'utente seleziona frequenza 50Hz → il sistema cerca nella partizione "50".

Se la tabella è su un solo foglio, lasciate vuoti entrambi i campi.

---

## FASE 2 — Generare le tabelle lookup

Questa fase si fa dall'interfaccia, sezione **"Importa da Excel"**:

### 2.1 — Upload
Caricate il file Excel. Il sistema verifica subito la presenza del foglio _MAPPA.

### 2.2 — Verifica
Il sistema mostra un riepilogo di cosa ha trovato:
- Tabelle, tipi, numero righe
- Colonne tecniche e colonne ART:
- Per le lookup_range, le fasce calcolate
- Eventuali errori (foglio non trovato, colonna mancante) in rosso

### 2.3 — Anteprima dati
Potete vedere le prime righe come le ha interpretate il sistema. Per le lookup_range vedrete le fasce automatiche:

\`kW 4.4 → fascia [0, 5.15) → DIR: D18, ST: D18/D12, SS: V40\`
\`kW 7.7 → fascia [6.8, 8.65) → DIR: D25, ST: D18/D12, SS: V40\`

### 2.4 — Conferma
Clic su **"Genera"** → il sistema crea le tabelle dati JSON e le regole lookup.

### Aggiornamento futuro
Quando cambiano i dati (nuova potenza, taglia diversa):
1. Modificate l'Excel (il foglio _MAPPA resta uguale)
2. Reimportate
3. Le regole della Fase 3 continuano a funzionare con i nuovi valori

---

## FASE 3 — Creare le regole

Le tabelle lookup contengono i **dati**. Le regole definiscono la **logica**: quando attivarsi e quali materiali aggiungere.

### 3.1 — Regola di lookup
Collega un campo del configuratore alla tabella. Si genera quasi automaticamente dall'import — basta completare i riferimenti ai campi del configuratore.

Esempio contattori:
- **Quando**: trazione = oleodinamica E potenza motore compilata
- **Azione**: cerca in \`contattori_oleo\`, usa potenza come chiave, frequenza come partizione
- **Risultato**: popola variabili \`_calc.cont_dir\`, \`_calc.mors_dir\`, ecc.

### 3.2 — Regole materiali
Definiscono cosa aggiungere al preventivo. Usano i valori dalla lookup.

Esempio regola "Avviamento diretto":
- **Quando**: tipo avviamento = diretto E dati disponibili
- **Materiali**: 1× Contattore KM (taglia da lookup), 3× Morsetti linea, Fili

### 3.3 — Codici articolo: due metodi

**Metodo A — Dall'Excel**: le colonne \`ART:\` portano i codici direttamente nelle tabelle. Quando cambiate l'Excel e reimportate, i codici si aggiornano automaticamente.

**Metodo B — Dall'interfaccia**: inseriti manualmente nel Rule Designer, dentro ogni regola. Utile quando i codici non sono nell'Excel o servono correzioni puntuali.

I due metodi coesistono. Se un codice è presente in entrambi, **vale quello inserito manualmente**.

---

## Riepilogo

| Fase | Cosa | Dove | Quando |
|------|------|------|--------|
| 1 | Preparare Excel + _MAPPA + ART: | Nel vostro file Excel | Una volta per struttura |
| 2 | Generare tabelle lookup | Interfaccia → "Importa da Excel" | Ogni volta che cambiano i dati |
| 3 | Creare regole (lookup + materiali) | Rule Designer | Una volta per tipo di componente |

---

## Errori comuni

| Messaggio | Causa | Soluzione |
|-----------|-------|-----------|
| Foglio _MAPPA non trovato | Manca o nome diverso | Deve chiamarsi esattamente \`_MAPPA\` |
| Foglio 'XYZ' non esiste | Nome nella mappa ≠ foglio reale | Controllare maiuscole e spazi |
| Colonna non trovata | Intestazione diversa | Verificare riga intestazioni |
| Valori non numerici | Per lookup_range servono numeri | Controllare colonna chiave |
| Tipo non riconosciuto | Errore nella colonna tipo | Valori ammessi: lookup_range, catalogo, costanti |`
  },
  {
    id: 'rule-engine',
    titolo: 'Come funziona il Rule Engine',
    descrizione: 'Panoramica del motore regole: condizioni, azioni, variabili _calc, template Mustache',
    icon: Zap,
    contenuto: `## Concetti base

Il Rule Engine valuta regole JSON ogni volta che i dati del preventivo cambiano. Ogni regola ha:
- **Condizioni** — Quando attivarsi (es. trazione = oleodinamica)
- **Azioni** — Cosa fare quando le condizioni sono tutte vere

## Tipi di azione

| Tipo | Funzione |
|------|----------|
| **set_field** | Imposta una variabile _calc.* nel contesto |
| **lookup_table** | Cerca in una tabella dati → imposta variabili _calc.* |
| **catalog_match** | Matching multi-criterio su catalogo prodotti |
| **accumulate_from_lookup** | Somma valori da lookup raggruppando per campo |
| **add_material** | Aggiunge un materiale alla BOM |

## Esecuzione sequenziale
Le azioni dentro una regola si eseguono in ordine. Una regola può avere prima un lookup, poi diversi add_material che usano i risultati del lookup.

## Variabili _calc.*
Sono variabili temporanee calcolate durante la valutazione. Non vengono salvate nel database. Servono come "ponte" tra lookup e materiali.

Esempio: \`_calc.cont_dir\` = "D25" → usata nel template \`CONT-{{_calc.cont_dir}}-KM\` → codice finale "CONT-D25-KM"

## Template Mustache
Nei materiali potete usare \`{{campo}}\` per inserire valori dinamici. Il sistema li sostituisce a runtime con i valori reali dal contesto.

## Phase ordering
Le regole hanno un campo \`phase\` (default: 1) e \`priority\`. Le regole phase 1 (calcoli) si eseguono prima delle phase 2 (materiali).`
  },
];

// ==========================================
// COMPONENTE PRINCIPALE
// ==========================================
type TabType = 'info' | 'revisioni' | 'documenti';

export default function InfoAppPage() {
  const [tab, setTab] = useState<TabType>('info');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <Info className="w-6 h-6 text-blue-600" />
          Informazioni App
        </h2>
        <p className="text-gray-500 mt-1">Informazioni, storico revisioni e documentazione</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {[
          { id: 'info' as TabType, label: 'Informazioni', icon: Info },
          { id: 'revisioni' as TabType, label: 'Storico Revisioni', icon: History },
          { id: 'documenti' as TabType, label: 'Documentazione', icon: BookOpen },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-colors text-sm ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'info' && <TabInfo />}
      {tab === 'revisioni' && <TabRevisioni />}
      {tab === 'documenti' && <TabDocumenti />}
    </div>
  );
}

// ==========================================
// TAB: INFORMAZIONI
// ==========================================
function TabInfo() {
  return (
    <div className="space-y-6">
      {/* Card principale */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
            <Cpu className="w-7 h-7 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-gray-900">{APP_INFO.nome}</h3>
            <p className="text-gray-600 mt-1">{APP_INFO.descrizione}</p>
            <div className="flex flex-wrap gap-4 mt-3 text-sm">
              <span className="flex items-center gap-1.5 text-gray-600">
                <Tag className="w-4 h-4 text-blue-500" />
                Versione <strong>{APP_INFO.versione}</strong>
              </span>
              <span className="flex items-center gap-1.5 text-gray-600">
                <Clock className="w-4 h-4 text-gray-400" />
                Build {APP_INFO.build}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Info sviluppo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Sviluppato da</p>
          <p className="font-semibold text-gray-900">{APP_INFO.sviluppatore}</p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Cliente</p>
          <p className="font-semibold text-gray-900">{APP_INFO.cliente}</p>
        </div>
      </div>

      {/* Stack tecnologico */}
      <div className="bg-white border rounded-lg p-6">
        <h4 className="font-semibold text-gray-900 mb-4">Stack tecnologico</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {APP_INFO.stack.map(s => (
            <div key={s.nome} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <s.icon className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-800">{s.nome}</p>
                <p className="text-xs text-gray-500">{s.tech}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contatti */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Mail className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold">Assistenza e segnalazioni</p>
          <p className="text-blue-700 mt-0.5">
            Per bug, richieste di funzionalità o supporto tecnico contattate il team di sviluppo.
          </p>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// TAB: STORICO REVISIONI
// ==========================================
function TabRevisioni() {
  const tipoBadge = {
    major: 'bg-red-100 text-red-800',
    minor: 'bg-blue-100 text-blue-800',
    patch: 'bg-green-100 text-green-800',
    fix: 'bg-amber-100 text-amber-800',
  };

  const tipoLabel = {
    major: 'Major',
    minor: 'Minor',
    patch: 'Patch',
    fix: 'Fix',
  };

  return (
    <div className="space-y-4">
      {STORICO_REVISIONI.map((rev, idx) => (
        <div key={rev.versione} className="bg-white border rounded-lg p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-gray-900 font-mono">v{rev.versione}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tipoBadge[rev.tipo]}`}>
                {tipoLabel[rev.tipo]}
              </span>
              {idx === 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Attuale
                </span>
              )}
            </div>
            <span className="text-sm text-gray-400">{rev.data}</span>
          </div>
          <p className="font-semibold text-gray-800 mb-2">{rev.titolo}</p>
          <ul className="space-y-1">
            {rev.dettagli.map((d, i) => (
              <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                {d}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ==========================================
// TAB: DOCUMENTAZIONE
// ==========================================
function TabDocumenti() {
  const [openDoc, setOpenDoc] = useState<string | null>(null);

  const handleDownload = async (filename: string) => {
    try {
      const res = await fetch(`${API_BASE}/import-excel/esempio/${filename}`);
      if (!res.ok) throw new Error('Download fallito');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Errore download:', err);
      alert(`Errore nel download di ${filename}. Verificare che il file sia presente nella cartella "examples" del backend.`);
    }
  };

  return (
    <div className="space-y-4">
      {DOCUMENTI.map(doc => (
        <div key={doc.id} className="bg-white border rounded-lg overflow-hidden">
          {/* Header documento */}
          <button
            onClick={() => setOpenDoc(openDoc === doc.id ? null : doc.id)}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <doc.icon className="w-5 h-5 text-blue-600" />
              <div className="text-left">
                <p className="font-semibold text-gray-900">{doc.titolo}</p>
                <p className="text-sm text-gray-500">{doc.descrizione}</p>
              </div>
            </div>
            {openDoc === doc.id
              ? <ChevronDown className="w-5 h-5 text-gray-400" />
              : <ChevronRight className="w-5 h-5 text-gray-400" />
            }
          </button>

          {/* Contenuto documento */}
          {openDoc === doc.id && (
            <div className="border-t">
              {/* Allegati scaricabili */}
              {doc.allegati && doc.allegati.length > 0 && (
                <div className="px-6 py-4 bg-amber-50 border-b border-amber-200">
                  <p className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    File di esempio scaricabili
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {doc.allegati.map(a => (
                      <button
                        key={a.filename}
                        onClick={() => handleDownload(a.filename)}
                        className="flex items-start gap-3 p-3 bg-white border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors text-left group"
                      >
                        <FileSpreadsheet className="w-8 h-8 text-green-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-700">{a.nome}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{a.descrizione}</p>
                          <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                            <Download className="w-3 h-3" />
                            {a.filename}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Testo della guida */}
              <div className="px-6 py-5">
                <MarkdownLite content={doc.contenuto} />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ==========================================
// MARKDOWN LITE RENDERER
// ==========================================
function MarkdownLite({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: JSX.Element[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Heading ##
    if (line.startsWith('## ')) {
      elements.push(
        <h3 key={key++} className="text-lg font-bold text-gray-900 mt-6 mb-3 first:mt-0">
          {line.slice(3)}
        </h3>
      );
      i++;
      continue;
    }

    // Heading ###
    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={key++} className="text-base font-semibold text-gray-800 mt-4 mb-2">
          {line.slice(4)}
        </h4>
      );
      i++;
      continue;
    }

    // Horizontal rule ---
    if (line.trim() === '---') {
      elements.push(<hr key={key++} className="my-5 border-gray-200" />);
      i++;
      continue;
    }

    // Table
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      elements.push(<MarkdownTable key={key++} lines={tableLines} />);
      continue;
    }

    // List item
    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={key++} className="space-y-1 my-2">
          {items.map((item, j) => (
            <li key={j} className="text-sm text-gray-700 flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">•</span>
              <InlineFormat text={item} />
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={key++} className="text-sm text-gray-700 my-2 leading-relaxed">
        <InlineFormat text={line} />
      </p>
    );
    i++;
  }

  return <div>{elements}</div>;
}

// Inline formatting: **bold**, `code`
function InlineFormat({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={i} className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
        }
        return <span key={i}>{part.replace(/\\`/g, '`')}</span>;
      })}
    </>
  );
}

// Simple table renderer
function MarkdownTable({ lines }: { lines: string[] }) {
  if (lines.length < 2) return null;

  const parseRow = (line: string) =>
    line.split('|').map(c => c.trim()).filter(c => c !== '');

  const headers = parseRow(lines[0]);
  const startIdx = lines[1].includes('---') ? 2 : 1;
  const rows = lines.slice(startIdx).map(parseRow);

  return (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50">
            {headers.map((h, i) => (
              <th key={i} className="text-left px-3 py-2 border border-gray-200 font-semibold text-gray-700 text-xs">
                <InlineFormat text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-blue-50/30">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-1.5 border border-gray-200 text-gray-700 text-xs">
                  <InlineFormat text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
