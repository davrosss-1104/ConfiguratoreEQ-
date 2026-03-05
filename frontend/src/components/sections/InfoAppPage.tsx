import { useState } from 'react';
import {
  Info, History, BookOpen, FileSpreadsheet, ChevronDown, ChevronRight,
  ExternalLink, Package, Cpu, Database, Layout, Zap, Shield, Mail,
  CheckCircle2, Clock, Tag, Download, GitBranch
} from 'lucide-react';

const API_BASE = 'http://localhost:8000';

// ==========================================
// DATI APP
// ==========================================

const APP_INFO = {
  nome: 'Configuratore Elettroquadri',
  versione: '2.3.0',
  build: '2026-02-24',
  descrizione: 'Sistema di configurazione e preventivazione per quadri elettrici ascensori, piattaforme e scale mobili.',
  sviluppatore: 'B-CONN SRLS',
  cliente: 'Elettroquadri S.r.l.',
  stack: [
    { nome: 'Backend', tech: 'FastAPI + SQLAlchemy + SQLite/SQL Server', icon: Database },
    { nome: 'Frontend', tech: 'React 18 + TypeScript + Vite + shadcn/ui', icon: Layout },
    { nome: 'Rule Engine', tech: 'JSON rules + lookup tables + pipeline + catalog match', icon: Zap },
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
    versione: '2.3.0', data: '2026-02-24', tipo: 'minor',
    titolo: 'Pipeline Builder e selezione trasformatori',
    dettagli: [
      'Pipeline Builder: editor visuale per calcoli multi-step (lookup_each, group_sum, multi_match)',
      'Selezione automatica trasformatore basata su aggregazione potenze per tensione di uscita',
      'Supporto righe multiple per componente (es. utilizzatori con 3 uscite a tensioni diverse)',
      'Endpoint generico "Crea campi da tabella" — genera checkbox nel configuratore da qualsiasi data table',
      'Raggruppamento automatico componenti con note aggregate per uscite multiple',
      'Import Excel con foglio _MAPPA per pipeline (tipo "catalogo" per tabelle con righe ripetute)',
      'Simulazione pipeline con preview step-by-step dei risultati intermedi',
    ]
  },
  {
    versione: '2.2.0', data: '2026-02-24', tipo: 'minor',
    titolo: 'Wizard Import Excel e Rule Engine v5',
    dettagli: [
      'Nuovo wizard import Excel a 4 step — non serve più il foglio _MAPPA',
      'Selezione interattiva di foglio, colonne chiave e colonne output',
      'Mapping automatico colonne → campi configuratore con punteggio',
      'Associazione valori → articoli con ricerca nel catalogo',
      'Supporto lookup_multi con match composito (lte + exact)',
      'Value mappings: materiali automatici da valori lookup',
      'Fallback ceiling: se valore sotto il minimo, prende la riga successiva',
      'Rule engine interamente SQL diretto (nessun mismatch ORM)',
      'Normalizzazione booleana nelle condizioni (1/true/sì/vero)',
    ]
  },
  {
    versione: '2.1.0', data: '2026-02-22', tipo: 'minor',
    titolo: 'Import Excel con _MAPPA (deprecato per lookup semplici)',
    dettagli: [
      'Primo modulo import Excel con foglio _MAPPA (sostituito dal wizard v2.2 per lookup semplici)',
      'Supporto tipi tabella: lookup_range, catalogo, costanti',
      'Pagina Informazioni App con storico revisioni e documentazione',
      'Rimane necessario per import pipeline (cataloghi multi-riga)',
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
      'Action types: lookup_table, lookup_multi, catalog_match, set_field',
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
    id: 'rule-engine',
    titolo: 'Come funziona il Rule Engine',
    descrizione: 'Il motore che aggiunge automaticamente i materiali al preventivo in base alla configurazione',
    icon: Zap,
    contenuto: `## Cosa fa

Ogni volta che salvate il preventivo, il Rule Engine valuta tutte le regole attive e aggiunge automaticamente i materiali giusti. Se cambiate un campo (es. potenza motore, tipo avviamento), i materiali si aggiornano da soli.

Ogni regola ha 3 parti:
- **Condizioni** — Quando attivarsi (es. trazione = oleodinamica)
- **Azioni** — Cosa fare quando le condizioni sono tutte vere (cercare in tabella, aggiungere materiale, ecc.)
- **Priorità** — L'ordine di esecuzione

---

## Il ciclo di valutazione

Ad ogni salvataggio il sistema:
1. **Cancella** tutti i materiali automatici dal preventivo
2. **Legge tutti i campi** compilati nel preventivo
3. **Fase 1 — Ricerche** → cerca nelle tabelle dati e arricchisce il contesto con risultati intermedi
4. **Fase 1.5 — Pipeline** → esegue i calcoli multi-step (per casi complessi come la selezione del trasformatore)
5. **Fase 2 — Materiali** → valuta le condizioni e aggiunge i materiali al preventivo
6. **Associazione articoli** — per ogni valore trovato nelle ricerche, aggiunge gli articoli collegati

I materiali vengono ricreati da zero ad ogni ciclo, garantendo coerenza con la configurazione attuale.

---

## Tipi di azione

| Tipo | Cosa fa |
|------|---------|
| **Imposta valore** (set_field) | Scrive un risultato intermedio nel contesto di calcolo |
| **Ricerca tabella** (lookup_table) | Cerca per fascia numerica (es. kW → contattore) |
| **Ricerca avanzata** (lookup_multi) | Cerca per più criteri insieme (es. kW + frequenza + tipo avviamento) |
| **Ricerca a catalogo** (catalog_match) | Cerca il prodotto giusto confrontando più caratteristiche |
| **Aggiungi materiale** (add_material) | Inserisce un materiale nella distinta del preventivo |

### Ricerca avanzata — il tipo più comune

Gestisce il caso tipico: cercare in una tabella per kW (fascia numerica) + tipo avviamento/frequenza (corrispondenza esatta). Supporta:
- **Chiavi combinate**: usa più campi del configuratore per cercare
- **Partizioni**: sotto-tabelle per frequenza, tensione, ecc.
- **Associazione articoli**: collegamento automatico valore trovato → articoli da inserire

---

## Risultati intermedi (_calc.*)

Sono variabili temporanee calcolate durante la valutazione. Non vengono salvate nel database — esistono solo durante il ciclo. Servono come "ponte" tra le ricerche e i materiali.

Esempio: una ricerca scrive \`_calc.contattori_oleo.dir_cont\` = "D18". Una regola materiale usa questo valore per aggiungere il contattore giusto.

## Associazione valori → articoli

Collegano i valori trovati dalle ricerche direttamente agli articoli. Quando una ricerca trova (ad esempio) "D18" come taglia contattore:
- Il sistema cerca "D18" tra le associazioni configurate nella regola
- Se trova un collegamento, aggiunge automaticamente gli articoli associati (es. contattore KM + contattore KS)
- Potete collegare più articoli allo stesso valore

Le associazioni vengono configurate nel wizard Import Excel (Step 3) o manualmente nel JSON della regola.

## Valori dinamici nei materiali

Nei materiali potete usare \`{{campo}}\` per inserire valori calcolati:
- \`{{_calc.contattori_oleo.dir_cont}}\` → "D18"
- Il codice \`CONT-{{_calc.cont_dir}}-KM\` diventa "CONT-D18-KM"

---

## Condizioni

### Operatori disponibili

| Operatore | Significato | Esempio |
|-----------|------------|---------|
| **equals** | Uguale (case-insensitive) | tipo_trazione equals "oleodinamica" |
| **not_equals** | Diverso | tipo_avviamento not_equals "" |
| **contains** | Contiene sottostringa | descrizione contains "fune" |
| **greater_than** | Maggiore di | potenza_kw greater_than 0 |
| **less_than** | Minore di | num_fermate less_than 10 |
| **in** | Contenuto nella lista | tipo in ["diretto", "stella_triangolo"] |
| **exists** | Campo presente e non vuoto | potenza_motore_kw exists |

### Normalizzazione booleana
I confronti booleani gestiscono automaticamente le varianti: \`true\`/\`1\`/\`sì\`/\`vero\`/\`on\` sono tutti equivalenti, così come \`false\`/\`0\`/\`no\`/\`falso\`/\`off\`.

### Comportamento "ceiling"
Se il valore cercato è sotto il minimo della tabella (es. kW 2.0 ma la tabella parte da 4.4), il sistema prende la **prima riga disponibile** — cioè la taglia più piccola.

---

## Ordine di esecuzione

Le regole si dividono in 3 fasi:
1. **Fase 1 — Ricerche** (lookup_table, lookup_multi, catalog_match)
2. **Fase 1.5 — Pipeline** (calcoli multi-step)
3. **Fase 2 — Materiali** (add_material)

All'interno di ogni fase, la priorità determina l'ordine.`
  },
  {
    id: 'import-excel',
    titolo: 'Dall\'Excel alle Regole — Wizard import',
    descrizione: 'Come trasformare le vostre tabelle tecniche Excel in regole automatiche, passo dopo passo',
    icon: FileSpreadsheet,
    allegati: [
      {
        nome: 'Esempio Contattori Oleodinamici',
        filename: 'esempio_contattori_oleo.xlsx',
        descrizione: 'Tabella per fasce kW con partizioni 50Hz/60Hz, colonne ART: per codici articolo'
      },
      {
        nome: 'Esempio Trasformatori e Ponti (con _MAPPA)',
        filename: 'esempio_trasformatori.xlsx',
        descrizione: 'Catalogo trasformatori + costanti ponti raddrizzatori + foglio _MAPPA'
      },
    ],
    contenuto: `## Panoramica

Questo wizard trasforma le vostre tabelle tecniche Excel in regole automatiche per il configuratore. Non è necessario modificare l'Excel — il wizard vi guida passo dopo passo.

| Step | Cosa si fa | Risultato |
|------|-----------|-----------|
| **1. Upload** | Caricate l'Excel e selezionate il foglio dati | Preview dei dati |
| **2. Struttura** | Scegliete le colonne di ricerca e le colonne risultato | Definizione della tabella |
| **3. Mappatura** | Collegate colonne ai campi del configuratore e valori agli articoli | Collegamento dati ↔ configuratore |
| **4. Generazione** | Il sistema crea tabella dati + regola di ricerca | Regola attiva e funzionante |

---

## STEP 1 — Upload e selezione foglio

### Cosa fare
- Caricate il file Excel (.xlsx)
- Il sistema mostra tutti i fogli presenti — selezionate quello con i dati
- Se le intestazioni non sono nella riga 1, indicate il numero riga corretto

### Come deve essere l'Excel
- **Una riga di intestazioni** con nomi colonna leggibili
- **Sotto le intestazioni**: dati, una riga per ogni record
- Niente righe vuote in mezzo ai dati, niente celle unite
- Celle vuote = dato non disponibile

Non servono fogli speciali né formattazioni particolari: l'Excel può restare così com'è.

---

## STEP 2 — Colonne di ricerca e risultato

### Colonne di ricerca (chiave)
Sono le colonne che il configuratore usa per **cercare** nella tabella. Per ogni colonna indicate il tipo di confronto:

| Tipo confronto | Quando usarlo | Esempio |
|----------------|--------------|---------|
| **≤ Per fascia (range)** | Valori numerici dove si cerca "il più vicino superiore" | kW → 7.7 cade nella fascia 5.9–9.6 |
| **= Esatto** | Corrispondenza diretta testo | Tipo avviamento → "diretto" |

### Colonne risultato
Sono le colonne con i **dati** che la ricerca restituisce: taglie contattori, modelli, morsetti, fili, ecc.

### Partizioni
Se la stessa tabella è divisa su **più fogli** dello stesso Excel (es. un foglio per 50Hz e uno per 60Hz), il sistema li combina automaticamente.

---

## STEP 3 — Mappatura campi e articoli

### 3.1 — Collegamento colonne → campi del configuratore
Per ogni colonna di ricerca, il wizard propone automaticamente i campi del configuratore più probabili, con un punteggio di compatibilità.

- **Punteggio alto (≥80%)**: il match è quasi sicuro, basta confermare
- **Punteggio medio**: verificare che il campo proposto sia corretto
- **Nessun suggerimento**: scegliere manualmente dal menu a tendina

### 3.2 — Collegamento valori → articoli
Per ogni valore distinto trovato nelle colonne risultato, potete associare uno o più articoli dal catalogo:

- Cercate l'articolo per codice o descrizione nel catalogo
- Potete associare più articoli allo stesso valore (es. per D18: contattore KM + contattore KS)
- Se il codice articolo non è ancora a catalogo, potete inserirlo dopo — le regole restano valide

Queste associazioni diventano automatiche: quando la ricerca trova un valore (es. "D18"), aggiunge automaticamente gli articoli collegati al preventivo.

---

## STEP 4 — Generazione

Clic su **"Genera tabella e regola"** → il sistema crea:

- **Tabella dati** (file JSON): contiene i valori dell'Excel strutturati per la ricerca
- **Regola di ricerca** (file JSON): contiene la logica di attivazione e le associazioni articoli

### Dopo la generazione
- La regola viene creata ma può richiedere di completare le **condizioni** (quando attivarsi)
- Usate il **Rule Designer** per aggiungere condizioni tipo "trazione = oleodinamica"
- I dati possono essere reimportati senza perdere le condizioni personalizzate

---

## Aggiornamento dati

Quando cambiano i valori nell'Excel (nuova potenza, taglia diversa):
1. Modificate l'Excel
2. Reimportate con lo stesso nome tabella
3. Le regole e le associazioni articoli si aggiornano, le condizioni personalizzate restano

---

## Esempi pratici

### Contattori oleodinamici
- **Excel**: 2 fogli (50Hz, 60Hz), colonna kW per fascia, output: taglie contattori, morsetti, fili
- **Step 2**: kW con confronto "Per fascia", una colonna risultato per ogni campo tecnico
- **Step 3**: kW → potenza motore, valori D18/D25/D32 → articoli EQ-KM018, EQ-KM025...
- **Risultato**: cambi potenza nel preventivo → materiali contattori si aggiornano automaticamente

### Trasformatori
- **Excel**: 1 foglio catalogo con codice, tipo, potenza VA, tensioni, peso
- **Step 2**: nessuna fascia numerica, tutte colonne risultato (è un catalogo)
- **Risultato**: tabella consultabile dalle regole e dalle pipeline

---

## Errori comuni

| Problema | Causa | Soluzione |
|----------|-------|-----------|
| "Nessuna riga trovata" | Foglio vuoto o intestazioni sulla riga sbagliata | Verificare numero riga intestazioni |
| "Nessun match" al test | Valore sotto il minimo tabella | Gestito automaticamente (prende la prima riga) |
| Materiali non compaiono | Associazioni articoli non configurate | Tornare allo Step 3 e collegare gli articoli |
| Campi non proposti | Nome colonna molto diverso dal campo | Selezionare manualmente dal menu |
| Partizioni non riconosciute | Campo composito non configurato | Usare mapping composito nello Step 3 |`
  },
  {
    id: 'pipeline-builder',
    titolo: 'Pipeline di Calcolo — Calcoli multi-step',
    descrizione: 'Per casi complessi dove il materiale da aggiungere dipende da calcoli su più campi (es. selezione trasformatore)',
    icon: GitBranch,
    allegati: [
      {
        nome: 'Esempio Trasformatori (con _MAPPA)',
        filename: 'trasformatori_lookup_cliente.xlsx',
        descrizione: 'Excel con utilizzatori multi-riga + catalogo trasformatori appiattito + foglio _MAPPA'
      },
    ],
    contenuto: `## Quando serve una pipeline

Le **ricerche semplici** (wizard Import Excel) gestiscono il caso diretto: un campo del configuratore → cerca in tabella → trova materiale. Es: kW → contattore.

Le **pipeline** servono quando il dato di ricerca **non esiste come campo**, ma va **calcolato** combinando più campi. Esempio tipico: selezione del trasformatore.

### Esempio: selezione trasformatore

L'utente spunta 3 utilizzatori nel configuratore:
- Pattino retrattile (150W a 75V, 150W a 15V, 150W a 18V)
- AMI100 24V (70W a 18V)
- 3 Valvole (135W a 55V)

Il sistema deve:
1. Sommare i watt per ogni tensione di uscita
2. Convertire in VA (dividi per power factor)
3. Trovare nel catalogo il trasformatore più piccolo che copra **tutte** le tensioni richieste

Nessuna ricerca semplice può farlo — serve una pipeline a 4 step.

---

## Come funziona

### I 4 step della pipeline trasformatore

| Step | Tipo | Cosa fa |
|------|------|---------|
| **1** | **CERCA** | Per ogni checkbox attivo, cerca nella tabella utilizzatori → scrive watt e tensione per ogni riga |
| **2** | **RAGGRUPPA** | Raggruppa per tensione e somma i watt, poi divide per power factor → VA per tensione |
| **3** | **SELEZIONA** | Cerca nel catalogo il trasformatore più piccolo che ha VA sufficienti a **tutte** le tensioni |
| **4** | **MATERIALE** | Aggiunge il trasformatore trovato ai materiali del preventivo |

### Componenti con più uscite

Un utilizzatore può richiedere uscite a tensioni diverse. Nell'Excel, si mettono **più righe con lo stesso componente**:

| componente | watt | tensione_uscita_trasf |
|-----------|------|----------------------|
| Pattino retrattile | 150 | 75 |
| Pattino retrattile | 150 | 15 |
| Pattino retrattile | 150 | 18 |
| AMI100 24V | 70 | 18 |

Nel configuratore compare **1 solo checkbox** per "Pattino retrattile" (con nota "3 uscite: 150/75 | 150/15 | 150/18"). La pipeline gestisce automaticamente tutte le righe.

---

## Come creare una pipeline

### 1. Preparare l'Excel

Servono 2 fogli dati + il foglio **_MAPPA** (vedi la guida dedicata qui sotto):

**Foglio Utilizzatori** — una riga per ogni uscita di ogni componente:
- Colonna \`componente\`: nome del componente (può ripetersi)
- Colonna \`watt\`: potenza assorbita per quell'uscita
- Colonna \`tensione_uscita_trasf\`: tensione in Volt dell'uscita

**Foglio Catalogo** — catalogo appiattito, una riga per ogni uscita di ogni trasformatore:
- Colonna \`codice_trasf\`: codice univoco trasformatore
- Colonna \`potenza_totale_va\`: potenza totale del trasformatore
- Colonna \`tensione_uscita\`: tensione di questa uscita
- Colonna \`va_disponibili\`: VA disponibili su questa uscita

### 2. Importare l'Excel

Usare la pagina **Import Excel** — il sistema legge il foglio _MAPPA, converte tutto in JSON e salva i dati.

### 3. Creare i campi checkbox

Nel **Pipeline Builder**, aggiungere uno step CERCA e cliccare il bottone **"Crea campi configuratore da tabella"**. Il sistema:
- Legge la tabella dati
- Raggruppa per componente unico
- Crea 1 checkbox per componente con note aggregate
- Crea la sezione nel configuratore se non esiste

### 4. Configurare gli step

Usare il Pipeline Builder per configurare i 4 step. È disponibile il template **"Selezione Trasformatore"** che pre-compila tutto.

### 5. Simulare

Il pulsante **Simula** mostra i risultati intermedi di ogni step — utile per verificare che i calcoli siano corretti prima di attivare la pipeline.

---

## Tipi di step disponibili

| Tipo | Colore | Cosa fa |
|------|--------|---------|
| **CERCA** (lookup_each) | Ciano | Per ogni checkbox attivo → cerca in tabella → scrive nel contesto |
| **RACCOGLI** (collect_sum) | Blu | Somma valori da un pattern o da un campo singolo |
| **RAGGRUPPA** (group_sum) | Indaco | Raggruppa per un campo e somma un altro (+ divisione per power factor) |
| **CALCOLA** (math_expr) | Ambra | Espressione matematica con variabili dal contesto |
| **SELEZIONA SINGOLO** (catalog_select) | Verde | Selezione con un solo criterio dal catalogo (>=, <=, ==) |
| **SELEZIONA COMPLETO** (multi_match) | Teal | Ricerca nel catalogo verificando **tutte** le condizioni richieste contemporaneamente |
| **MATERIALE** (add_material) | Viola | Aggiunge materiale con codice/quantità da variabili calcolate |

---

## Catalogo appiattito

Per la selezione completa, il catalogo deve essere **appiattito**: una riga per ogni uscita di ogni trasformatore. Lo stesso trasformatore appare più volte.

Esempio: il trasformatore "218" ha 3 uscite → 3 righe:

| codice_trasf | potenza_totale_va | tensione_uscita | va_disponibili |
|-------------|-------------------|-----------------|---------------|
| 218 | 600 | 75 | 250 |
| 218 | 600 | 30 | 200 |
| 218 | 600 | 10 | 50 |

Il sistema raggruppa le righe per codice, verifica che **ogni tensione richiesta** abbia VA sufficienti, e seleziona il trasformatore più piccolo che soddisfa tutti i requisiti.

### Come avviene la selezione

- I VA di un'uscita **non compensano** quelli di un'altra (ogni tensione è indipendente)
- Se servono 200VA a 75V e 150VA a 55V, il trasformatore deve avere **almeno** 200VA a 75V **e** 150VA a 55V
- Tra i candidati validi, viene scelto quello con potenza totale più bassa`
  },
  {
    id: 'foglio-mappa',
    titolo: 'Foglio _MAPPA — Indice per import complessi',
    descrizione: 'Serve per le pipeline e per importare più tabelle dallo stesso Excel: dice al sistema come interpretare ogni foglio',
    icon: FileSpreadsheet,
    contenuto: `## Cos'è e quando serve

Il foglio \`_MAPPA\` è l'**indice** del file Excel. Dice al sistema **quali fogli leggere**, **che tipo di dati contengono**, e **come strutturarli**.

### Quando usarlo

- **Serve per le pipeline** — quando i dati hanno righe ripetute per lo stesso componente (es. utilizzatori multi-uscita, catalogo trasformatori appiattito)
- **Serve quando importate più tabelle** dallo stesso file Excel
- **NON serve** per le ricerche semplici — il wizard a 4 step le gestisce direttamente senza _MAPPA

In pratica: se state usando il **Pipeline Builder**, quasi certamente vi servirà il _MAPPA. Se usate solo il wizard Import Excel standard, non vi serve.

---

## Formato del foglio

Il foglio si deve chiamare esattamente \`_MAPPA\` (con l'underscore iniziale). La prima riga sono le intestazioni, poi una riga per ogni foglio dati da importare.

### Colonne

| Colonna | Obbligatoria | Descrizione |
|---------|:---:|-------------|
| **foglio** | ✅ | Nome esatto del foglio dati nell'Excel |
| **tipo** | ✅ | Tipo di tabella (vedi sotto) |
| **nome_tabella** | ✅ | Nome del file dati generato (es. \`utilizzatori_trasformatore\`) |
| **colonna_chiave** | — | Colonna principale di ricerca (es. \`componente\`, \`codice_trasf\`) |
| **tipo_chiave** | — | Tipo della chiave: \`testo\` o \`numerico\` |
| **partizionato_per** | — | Campo configuratore per partizionare (es. \`frequenza_rete\`) |
| **valore_partizione** | — | Valore della partizione di questo foglio (es. \`50\`) |
| **riga_intestazioni** | — | Riga dove si trovano le intestazioni (default: 1) |
| **note** | — | Note libere |

### Tipi di tabella

| Tipo | Quando usarlo | Cosa produce |
|------|--------------|-------------|
| **catalogo** | Tabelle con righe ripetute per la stessa chiave (utilizzatori multi-uscita, catalogo appiattito) | Elenco completo — tutte le righe conservate |
| **costanti** | Tabelle chiave→valore con chiavi univoche (ponti raddrizzatori) | Dizionario — una entry per chiave |
| **lookup_range** | Tabelle con fasce numeriche (contattori per kW) | Fasce con min/max calcolate automaticamente |

### ⚠️ Regola importante

Se un componente ha **più righe** (es. stesso utilizzatore con uscite a tensioni diverse), usare tipo **\`catalogo\`**, NON \`costanti\`. Il tipo \`costanti\` richiede chiavi univoche e scarta le righe duplicate.

---

## Esempio pratico: import per pipeline trasformatore

Excel con 3 fogli:

### Foglio _MAPPA

| foglio | tipo | nome_tabella | colonna_chiave | tipo_chiave | riga_intestazioni | note |
|--------|------|-------------|---------------|------------|------------------|------|
| Utilizzatori | catalogo | utilizzatori_trasformatore | componente | testo | 1 | Componenti con watt e tensione (righe multiple OK) |
| Catalogo_trasformatori | catalogo | catalogo_trasformatori_flat | codice_trasf | testo | 1 | Catalogo appiattito: 1 riga per uscita |

### Foglio Utilizzatori

| componente | watt | tensione_uscita_trasf |
|-----------|------|----------------------|
| Pattino retrattile | 150 | 75 |
| Pattino retrattile | 150 | 15 |
| Pattino retrattile | 150 | 18 |
| AMI100 24V | 70 | 18 |
| 3 Valvole | 135 | 55 |

### Foglio Catalogo_trasformatori

| codice_trasf | tipo | potenza_totale_va | forza_motrice | tensione_uscita | va_disponibili | nome_uscita |
|-------------|------|-------------------|--------------|-----------------|---------------|-------------|
| 218 | Monofase | 600 | 0-230-400 | 75 | 250 | manovra |
| 218 | Monofase | 600 | 0-230-400 | 30 | 200 | uscita_1 |
| 52E | Trimono | 600 | 380 | 55 | 250 | valvole |
| 52E | Trimono | 600 | 380 | 75 | 250 | manovra |

---

## Risultato dell'import

Cliccando **Import** nella pagina Import Excel, il sistema genera i file JSON con i dati strutturati, pronti per essere usati dal Pipeline Builder e dal Rule Engine.

---

## Errori comuni

| Problema | Causa | Soluzione |
|----------|-------|-----------|
| "Foglio _MAPPA non trovato" | Il foglio si chiama diversamente | Rinominare esattamente \`_MAPPA\` |
| "Tipo non valido" | Tipo diverso da catalogo/costanti/lookup_range | Controllare l'ortografia |
| Righe duplicate perse | Tipo \`costanti\` con chiavi ripetute | Usare tipo \`catalogo\` |
| "Foglio X non trovato nel file" | Nome foglio in _MAPPA diverso dal tab Excel | I nomi devono corrispondere esattamente |
| Colonne non riconosciute | Intestazioni sulla riga sbagliata | Specificare \`riga_intestazioni\` |
| Dati non letti | Righe vuote tra le intestazioni e i dati | Rimuovere righe vuote intermedie |`
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
            className={`px-4 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
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
      {tab === 'info' && <InfoTab />}
      {tab === 'revisioni' && <RevisioniTab />}
      {tab === 'documenti' && <DocumentiTab />}
    </div>
  );
}

// ==========================================
// TAB INFORMAZIONI
// ==========================================
function InfoTab() {
  return (
    <div className="space-y-6">
      {/* App Card */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
            <Zap className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">{APP_INFO.nome}</h3>
            <p className="text-sm text-gray-500">{APP_INFO.descrizione}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Versione</p>
            <p className="font-semibold text-gray-900">{APP_INFO.versione}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Build</p>
            <p className="font-semibold text-gray-900">{APP_INFO.build}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Sviluppatore</p>
            <p className="font-semibold text-gray-900">{APP_INFO.sviluppatore}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Cliente</p>
            <p className="font-semibold text-gray-900">{APP_INFO.cliente}</p>
          </div>
        </div>
      </div>

      {/* Stack */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Stack tecnologico</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {APP_INFO.stack.map(s => (
            <div key={s.nome} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <s.icon className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">{s.nome}</p>
                <p className="text-xs text-gray-500">{s.tech}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// TAB STORICO REVISIONI
// ==========================================
function RevisioniTab() {
  const tipoColors: Record<string, string> = {
    major: 'bg-red-100 text-red-700',
    minor: 'bg-blue-100 text-blue-700',
    patch: 'bg-green-100 text-green-700',
    fix: 'bg-amber-100 text-amber-700',
  };

  return (
    <div className="space-y-4">
      {STORICO_REVISIONI.map((rev, idx) => (
        <div key={rev.versione} className={`bg-white border rounded-lg p-5 ${idx === 0 ? 'ring-2 ring-blue-200' : ''}`}>
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono font-bold text-gray-900">v{rev.versione}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tipoColors[rev.tipo]}`}>
              {rev.tipo}
            </span>
            <span className="text-sm text-gray-400 ml-auto">{rev.data}</span>
          </div>
          <p className="font-semibold text-gray-800 mb-2">{rev.titolo}</p>
          <ul className="space-y-1">
            {rev.dettagli.map((d, i) => (
              <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
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
// TAB DOCUMENTAZIONE
// ==========================================
function DocumentiTab() {
  const [openDoc, setOpenDoc] = useState<string | null>(null);

  const handleDownload = async (filename: string) => {
    try {
      const res = await fetch(`${API_BASE}/import-excel/esempio/${filename}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
