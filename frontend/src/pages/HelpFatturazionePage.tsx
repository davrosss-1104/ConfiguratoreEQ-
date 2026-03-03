/**
 * HelpFatturazionePage.tsx
 * 
 * Pagina di help/guida per il modulo Fatturazione Elettronica.
 * Copre: configurazione iniziale Aruba, flusso SDI, FAQ, troubleshooting.
 * 
 * POSIZIONE: frontend/src/pages/HelpFatturazionePage.tsx
 * ROUTE: /fatturazione/guida
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Server, FileText, Send, RefreshCw,
  CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronRight,
  ExternalLink, Copy, Shield, Zap, HelpCircle, Phone,
  Mail, Globe, Clock, ArrowRight, Info, Lock, Eye
} from 'lucide-react';

// ============================================================
// DATI
// ============================================================

interface FaqItem {
  q: string;
  a: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    q: "Devo avere un abbonamento Aruba per usare questo modulo?",
    a: "Per l'invio automatico allo SDI sì, serve il servizio \"Fatturazione Elettronica\" di Aruba con API REST abilitate. Se preferisci non abbonarti, puoi usare il provider \"Manuale\": l'app genera il file XML e tu lo carichi manualmente sul portale del tuo intermediario, sul sito dell'Agenzia delle Entrate, o lo invii via PEC."
  },
  {
    q: "Quanto costa il servizio Aruba?",
    a: "Il servizio Aruba Fatturazione Elettronica costa circa €25/anno + IVA per volumi standard. Include firma digitale automatica, invio e ricezione SDI, conservazione a norma per 10 anni, e accesso API REST."
  },
  {
    q: "Posso usare un intermediario diverso da Aruba?",
    a: "L'architettura supporta provider multipli. Al momento è implementato il provider Aruba. Se usi un intermediario diverso (Namirial, Fatture in Cloud, ecc.), puoi usare il provider Manuale per generare l'XML e caricarlo sul tuo portale. In futuro potremo aggiungere altri provider."
  },
  {
    q: "Cos'è il codice destinatario KRRH6B9?",
    a: "È il codice che identifica Aruba come intermediario presso lo SDI. Va comunicato ai tuoi fornitori affinché le fatture passive arrivino ad Aruba (e quindi alla nostra app). Se usi un intermediario diverso, il codice sarà diverso."
  },
  {
    q: "Posso testare senza inviare fatture reali?",
    a: "Sì. Nella configurazione SDI, imposta l'ambiente su \"Demo\". L'app si collegherà ai server di test Aruba e le fatture non verranno inviate allo SDI reale. Quando sei pronto, cambia in \"Produzione\"."
  },
  {
    q: "Cosa succede se lo SDI scarta la fattura?",
    a: "L'app mostra lo stato \"Scartata\" con il motivo dell'errore nella timeline SDI. Puoi correggere i dati e re-inviare. Le cause più comuni sono: P.IVA errata, formato XML non conforme, o numerazione duplicata."
  },
  {
    q: "Come funziona la conservazione a norma?",
    a: "La conservazione digitale a norma (obbligatoria per 10 anni) è gestita da Aruba come parte del servizio. La nostra app conserva una copia locale per consultazione rapida, ma la conservazione legale è responsabilità dell'intermediario."
  },
  {
    q: "Posso importare fatture passive?",
    a: "Sì, in due modi: (1) automaticamente tramite sincronizzazione con Aruba, che scarica le fatture ricevute, oppure (2) manualmente caricando il file XML ricevuto via PEC o scaricato dal portale dell'Agenzia delle Entrate."
  },
  {
    q: "Come genero una nota di credito?",
    a: "Apri la fattura da stornare, clicca sul menu azioni (⋮) e seleziona \"Crea nota di credito\". L'app creerà automaticamente un documento TD04 collegato alla fattura originale con gli importi in negativo."
  },
  {
    q: "Chi devo contattare per problemi con Aruba?",
    a: "Per problemi di connessione API o credenziali: Supporto Aruba Fatturazione (assistenza@aruba.it o 0575/0505). Per problemi con l'app: il tuo referente tecnico. Prima di contattare l'assistenza, usa il pulsante \"Test connessione\" nella configurazione per diagnosticare il problema."
  },
];

// ============================================================
// COMPONENTE
// ============================================================

export default function HelpFatturazionePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const CopyButton = ({ text, id }: { text: string; id: string }) => (
    <button onClick={() => copyToClipboard(text, id)}
      className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-xs font-mono transition-colors">
      {copiedCode === id ? <><CheckCircle className="w-3 h-3 text-green-500" /> Copiato</> : <><Copy className="w-3 h-3 text-gray-400" /> {text}</>}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link to="/fatturazione" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <BookOpen className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Guida Fatturazione Elettronica</h1>
              <p className="text-sm text-gray-500">Configurazione, flusso SDI e risoluzione problemi</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* ====================================================
            INDICE
            ==================================================== */}
        <nav className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Indice</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: '#prerequisiti', label: 'Prerequisiti', icon: <Shield className="w-4 h-4" /> },
              { href: '#setup-aruba', label: 'Configurazione Aruba', icon: <Server className="w-4 h-4" /> },
              { href: '#config-app', label: 'Configurazione nell\'app', icon: <Zap className="w-4 h-4" /> },
              { href: '#flusso-sdi', label: 'Come funziona il flusso SDI', icon: <Send className="w-4 h-4" /> },
              { href: '#stati-fattura', label: 'Stati della fattura', icon: <RefreshCw className="w-4 h-4" /> },
              { href: '#troubleshooting', label: 'Risoluzione problemi', icon: <AlertTriangle className="w-4 h-4" /> },
              { href: '#faq', label: 'Domande frequenti', icon: <HelpCircle className="w-4 h-4" /> },
              { href: '#contatti', label: 'Contatti supporto', icon: <Phone className="w-4 h-4" /> },
            ].map(item => (
              <a key={item.href} href={item.href}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-blue-50 hover:text-blue-700 transition-colors">
                <span className="text-gray-400">{item.icon}</span>
                {item.label}
              </a>
            ))}
          </div>
        </nav>

        {/* ====================================================
            1. PREREQUISITI
            ==================================================== */}
        <section id="prerequisiti" className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-white border-b flex items-center gap-3">
            <Shield className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">1. Prerequisiti</h2>
          </div>
          <div className="px-6 py-5 space-y-4 text-sm text-gray-700 leading-relaxed">
            <p>Per utilizzare il modulo di fatturazione elettronica con invio automatico allo SDI, servono:</p>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Servizio Aruba Fatturazione Elettronica attivo</span>
                  <p className="text-gray-500 mt-0.5">Se già usi Aruba per le fatture (anche dal portale web), hai già il servizio. Altrimenti attivalo da
                    <a href="https://www.aruba.it/fatturazione-elettronica.aspx" target="_blank" rel="noopener"
                      className="text-blue-600 hover:underline ml-1 inline-flex items-center gap-1">
                      aruba.it <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">API REST abilitate sul tuo account Aruba</span>
                  <p className="text-gray-500 mt-0.5">L'accesso API non è attivo di default. Va richiesto separatamente (vedi sezione successiva).</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Credenziali API (username e password)</span>
                  <p className="text-gray-500 mt-0.5">Sono diverse dalle credenziali del portale web Aruba. Te le fornisce Aruba dopo l'abilitazione API.</p>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-800">Senza abbonamento Aruba?</span>
                <p className="text-amber-700 mt-0.5">
                  Puoi comunque usare il modulo con il provider <strong>"Manuale"</strong>: l'app genera il file XML FatturaPA 
                  e tu lo scarichi per caricarlo manualmente dove preferisci (portale Aruba web, sito Agenzia delle Entrate, 
                  o invio via PEC a <CopyButton text="sdi01@pec.fatturapa.it" id="pec-sdi" />).
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ====================================================
            2. CONFIGURAZIONE ARUBA
            ==================================================== */}
        <section id="setup-aruba" className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-white border-b flex items-center gap-3">
            <Server className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">2. Configurazione Aruba — Passo per passo</h2>
          </div>
          <div className="px-6 py-5 space-y-6 text-sm text-gray-700 leading-relaxed">

            {/* Step 1 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 text-base">Verifica che il servizio sia attivo</h3>
                <p className="mt-1 text-gray-600">
                  Accedi all'<a href="https://fatturazione.aruba.it" target="_blank" rel="noopener" className="text-blue-600 hover:underline inline-flex items-center gap-1">area clienti Aruba Fatturazione <ExternalLink className="w-3 h-3" /></a>.
                  Se riesci ad entrare e vedi la dashboard delle fatture, il servizio è attivo.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 text-base">Richiedi l'abilitazione API REST</h3>
                <p className="mt-1 text-gray-600">
                  L'accesso API non è attivo di default. Devi richiederlo ad Aruba. Ci sono due modi:
                </p>
                <div className="mt-3 space-y-2">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <span className="font-medium">Opzione A — Dal portale:</span>
                    <p className="text-gray-500 mt-1">Portale Fatturazione Aruba → Impostazioni → API / Integrazioni → Richiedi abilitazione</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <span className="font-medium">Opzione B — Contattando il supporto:</span>
                    <p className="text-gray-500 mt-1">
                      Scrivi ad Aruba con oggetto: <em>"Richiesta abilitazione API REST Fatturazione Elettronica"</em>. 
                      Specifica che devi integrare un software gestionale di terze parti.
                    </p>
                    <div className="flex gap-3 mt-2">
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded inline-flex items-center gap-1">
                        <Mail className="w-3 h-3" /> assistenza@aruba.it
                      </span>
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded inline-flex items-center gap-1">
                        <Phone className="w-3 h-3" /> 0575 0505
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 text-base">Ricevi le credenziali API</h3>
                <p className="mt-1 text-gray-600">
                  Aruba ti fornirà <strong>username</strong> e <strong>password</strong> specifiche per l'accesso API.
                </p>
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-red-700 text-xs">
                    <strong>Attenzione:</strong> le credenziali API sono diverse da quelle che usi per accedere al portale web Aruba.
                    Non confonderle. Conservale in un luogo sicuro.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">4</div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 text-base">Comunica il codice destinatario ai fornitori</h3>
                <p className="mt-1 text-gray-600">
                  Per ricevere le fatture passive tramite Aruba, comunica ai tuoi fornitori il codice destinatario:
                </p>
                <div className="mt-2 inline-flex items-center gap-2">
                  <CopyButton text="KRRH6B9" id="cod-dest" />
                  <span className="text-xs text-gray-400">(codice specifico Aruba)</span>
                </div>
                <p className="mt-2 text-gray-500 text-xs">
                  Puoi anche registrarlo sul sito dell'Agenzia delle Entrate nella sezione 
                  "Fatture e Corrispettivi" → "Registrazione dell'indirizzo telematico" per riceverlo automaticamente 
                  su tutte le fatture, indipendentemente da cosa indicano i fornitori.
                </p>
              </div>
            </div>

            {/* Step 5 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">5</div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 text-base">Configura l'app (vedi sezione successiva)</h3>
                <p className="mt-1 text-gray-600">
                  Inserisci le credenziali nella pagina di configurazione fatturazione dell'app e testa la connessione.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ====================================================
            3. CONFIGURAZIONE NELL'APP
            ==================================================== */}
        <section id="config-app" className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-white border-b flex items-center gap-3">
            <Zap className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">3. Configurazione nell'app</h2>
          </div>
          <div className="px-6 py-5 space-y-5 text-sm text-gray-700 leading-relaxed">

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-gray-200 text-gray-600 rounded-full flex items-center justify-center font-bold text-sm">A</div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Attiva il modulo Fatturazione</h3>
                <p className="text-gray-600 mt-1">
                  Vai in <strong>Amministrazione → Moduli & Parametri</strong> e attiva il toggle "Fatturazione Elettronica". 
                  Dopo l'attivazione, ricarica la pagina per vedere le nuove voci nel menu.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-gray-200 text-gray-600 rounded-full flex items-center justify-center font-bold text-sm">B</div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Compila i dati azienda</h3>
                <p className="text-gray-600 mt-1">
                  Vai in <strong>Amministrazione → Config. Fatturazione</strong> (oppure <Link to="/fatturazione/configurazione" className="text-blue-600 hover:underline">clicca qui</Link>). 
                  Compila la sezione "Dati Cedente / Prestatore" con i dati della tua azienda: denominazione, P.IVA, codice fiscale, 
                  regime fiscale, sede legale, contatti.
                </p>
                <p className="text-gray-500 mt-2 text-xs">
                  Per le S.r.l. e S.p.A. è obbligatorio anche compilare la sezione "Iscrizione REA" con ufficio, numero REA, 
                  capitale sociale e stato liquidazione.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-gray-200 text-gray-600 rounded-full flex items-center justify-center font-bold text-sm">C</div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Configura la connessione SDI</h3>
                <p className="text-gray-600 mt-1">Nella sezione "Connessione SDI":</p>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-2 text-gray-600">
                    <ArrowRight className="w-3 h-3 text-blue-400" />
                    <span>Provider SDI: seleziona <strong>"Aruba Fatturazione"</strong></span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <ArrowRight className="w-3 h-3 text-blue-400" />
                    <span>Ambiente: <strong>"Demo"</strong> per iniziare (non invia fatture reali)</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <ArrowRight className="w-3 h-3 text-blue-400" />
                    <span>Username: inserisci lo username API ricevuto da Aruba</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <ArrowRight className="w-3 h-3 text-blue-400" />
                    <span>Password: inserisci la password API ricevuta da Aruba</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <ArrowRight className="w-3 h-3 text-blue-400" />
                    <span>Codice destinatario ricezione: <CopyButton text="KRRH6B9" id="cod-dest-2" /></span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-gray-200 text-gray-600 rounded-full flex items-center justify-center font-bold text-sm">D</div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Testa la connessione</h3>
                <p className="text-gray-600 mt-1">
                  Clicca <strong>"Test connessione"</strong>. L'app tenterà di autenticarsi sulle API Aruba.
                </p>
                <div className="mt-2 space-y-2">
                  <div className="flex items-start gap-2 p-2 bg-green-50 rounded">
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-green-700"><strong>Connessione riuscita:</strong> le credenziali sono corrette, puoi procedere.</span>
                  </div>
                  <div className="flex items-start gap-2 p-2 bg-red-50 rounded">
                    <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <span className="text-red-700"><strong>Errore autenticazione:</strong> verifica username e password API (non quelle del portale web!).</span>
                  </div>
                  <div className="flex items-start gap-2 p-2 bg-amber-50 rounded">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <span className="text-amber-700"><strong>Timeout / errore rete:</strong> verifica che il server raggiunga internet e che Aruba non sia in manutenzione.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-gray-200 text-gray-600 rounded-full flex items-center justify-center font-bold text-sm">E</div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Salva e passa in produzione</h3>
                <p className="text-gray-600 mt-1">
                  Quando hai testato tutto in ambiente Demo e sei soddisfatto, cambia l'ambiente in <strong>"Produzione"</strong> 
                  e salva. Da quel momento le fatture inviate saranno reali e recapitate allo SDI.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ====================================================
            4. FLUSSO SDI
            ==================================================== */}
        <section id="flusso-sdi" className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-white border-b flex items-center gap-3">
            <Send className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">4. Come funziona il flusso SDI</h2>
          </div>
          <div className="px-6 py-5 text-sm text-gray-700 leading-relaxed">
            <p className="mb-5">
              Quando invii una fattura, questa è la sequenza di eventi. L'app gestisce tutto automaticamente — 
              tu devi solo creare la fattura e premere "Invia".
            </p>

            {/* Flow diagram */}
            <div className="space-y-0">
              {[
                { icon: <FileText className="w-5 h-5" />, color: 'blue', title: 'Crei la fattura nell\'app', desc: 'Inserisci destinatario, righe, importi. Stato: Bozza.' },
                { icon: <Zap className="w-5 h-5" />, color: 'blue', title: 'Genera XML', desc: 'L\'app crea il file XML FatturaPA conforme allo standard v1.2.2. Stato: Generata.' },
                { icon: <Send className="w-5 h-5" />, color: 'indigo', title: 'Invio ad Aruba via API', desc: 'L\'app carica l\'XML sui server Aruba tramite API REST autenticata (OAuth2).' },
                { icon: <Shield className="w-5 h-5" />, color: 'indigo', title: 'Aruba firma digitalmente', desc: 'Aruba appone la firma digitale qualificata (XAdES-BES) e inoltra allo SDI.' },
                { icon: <Globe className="w-5 h-5" />, color: 'purple', title: 'SDI riceve e valida', desc: 'Lo SDI dell\'Agenzia delle Entrate controlla formato, P.IVA, coerenza dati. Se errori → scarto.' },
                { icon: <Send className="w-5 h-5" />, color: 'purple', title: 'SDI consegna al destinatario', desc: 'Se il destinatario ha un canale accreditato (codice SDI o PEC), la fattura viene recapitata.' },
                { icon: <RefreshCw className="w-5 h-5" />, color: 'green', title: 'Aruba notifica l\'esito', desc: 'L\'app interroga periodicamente Aruba per aggiornare lo stato: consegnata, accettata, scartata, ecc.' },
                { icon: <CheckCircle className="w-5 h-5" />, color: 'green', title: 'Stato aggiornato nell\'app', desc: 'Puoi controllare tutto nella timeline SDI della fattura. Conservazione a norma gestita da Aruba.' },
              ].map((step, i) => (
                <div key={i} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      step.color === 'blue' ? 'bg-blue-100 text-blue-600' :
                      step.color === 'indigo' ? 'bg-indigo-100 text-indigo-600' :
                      step.color === 'purple' ? 'bg-purple-100 text-purple-600' :
                      'bg-green-100 text-green-600'
                    }`}>
                      {step.icon}
                    </div>
                    {i < 7 && <div className="w-0.5 h-6 bg-gray-200" />}
                  </div>
                  <div className="pb-6">
                    <h4 className="font-semibold text-gray-900">{step.title}</h4>
                    <p className="text-gray-500 mt-0.5">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ====================================================
            5. STATI FATTURA
            ==================================================== */}
        <section id="stati-fattura" className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-white border-b flex items-center gap-3">
            <RefreshCw className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">5. Stati della fattura</h2>
          </div>
          <div className="px-6 py-5">
            <div className="space-y-2">
              {[
                { stato: 'Bozza', color: 'bg-gray-100 text-gray-700', desc: 'Fattura in fase di compilazione. Puoi modificarla liberamente.' },
                { stato: 'Generata', color: 'bg-blue-100 text-blue-700', desc: 'XML generato. Puoi ancora modificarla (rigenerando l\'XML) o inviarla.' },
                { stato: 'Inviata', color: 'bg-indigo-100 text-indigo-700', desc: 'Caricata su Aruba e inoltrata allo SDI. In attesa di esito.' },
                { stato: 'Consegnata', color: 'bg-green-100 text-green-700', desc: 'Lo SDI ha recapitato la fattura al destinatario.' },
                { stato: 'Accettata', color: 'bg-emerald-100 text-emerald-700', desc: 'Il destinatario (PA) ha accettato la fattura. Ciclo completato.' },
                { stato: 'Scartata', color: 'bg-red-100 text-red-700', desc: 'Lo SDI ha trovato errori. Leggi il motivo nella timeline, correggi e re-invia.' },
                { stato: 'Rifiutata', color: 'bg-red-100 text-red-700', desc: 'Il destinatario (PA) ha rifiutato la fattura. Puoi correggere e re-inviare.' },
                { stato: 'Non consegnata', color: 'bg-amber-100 text-amber-700', desc: 'Lo SDI non è riuscito a consegnare. La fattura è comunque valida (disponibile su F&C del destinatario).' },
                { stato: 'Annullata', color: 'bg-gray-100 text-gray-500', desc: 'Fattura annullata prima dell\'invio. Se già inviata, serve una nota di credito.' },
              ].map(s => (
                <div key={s.stato} className="flex items-start gap-3 py-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${s.color}`}>{s.stato}</span>
                  <span className="text-sm text-gray-600">{s.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ====================================================
            6. TROUBLESHOOTING
            ==================================================== */}
        <section id="troubleshooting" className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-white border-b flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h2 className="text-lg font-bold text-gray-900">6. Risoluzione problemi</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            {[
              {
                problema: 'Test connessione fallisce con "Errore autenticazione"',
                soluzioni: [
                  'Verifica di usare le credenziali API, non quelle del portale web Aruba.',
                  'Controlla che non ci siano spazi prima/dopo username e password.',
                  'Verifica che le API siano state abilitate sul tuo account Aruba (contatta supporto).',
                ],
              },
              {
                problema: 'Fattura scartata dallo SDI con errore "00305 - IdFiscaleIVA non valido"',
                soluzioni: [
                  'La Partita IVA del destinatario non è corretta o non è attiva.',
                  'Verifica la P.IVA su: https://telematici.agenziaentrate.gov.it/VerificaPIVA/',
                  'Se il cliente è cessato, la fattura va emessa con il codice fiscale.',
                ],
              },
              {
                problema: 'Fattura scartata con errore "00404 - Numero duplicato"',
                soluzioni: [
                  'Esiste già una fattura con lo stesso numero nello stesso anno.',
                  'Controlla la numerazione in Config. Fatturazione → Numerazione fatture.',
                  'Se hai cambiato gestionale di recente, aggiorna il contatore "Ultimo numero" al valore corretto.',
                ],
              },
              {
                problema: 'Stato fattura bloccato su "Inviata" da più di 48 ore',
                soluzioni: [
                  'Clicca "Aggiorna stato" nella fattura per forzare un controllo con Aruba.',
                  'Lo SDI ha tempi massimi di 5 giorni per notificare l\'esito.',
                  'Se dopo 5 giorni non c\'è esito, la fattura si considera accettata per "decorrenza termini".',
                ],
              },
              {
                problema: 'Errore "Il modulo Fatturazione non è attivo" quando accedo alle API',
                soluzioni: [
                  'Vai in Amministrazione → Moduli & Parametri e attiva il toggle "Fatturazione Elettronica".',
                  'Dopo l\'attivazione, ricarica la pagina (F5).',
                ],
              },
            ].map((item, i) => (
              <div key={i} className="border rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-red-50 border-b">
                  <span className="font-semibold text-red-800 text-sm flex items-center gap-2">
                    <XCircle className="w-4 h-4" /> {item.problema}
                  </span>
                </div>
                <div className="px-4 py-3 space-y-1.5">
                  {item.soluzioni.map((s, j) => (
                    <div key={j} className="flex items-start gap-2 text-sm text-gray-600">
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ====================================================
            7. FAQ
            ==================================================== */}
        <section id="faq" className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-white border-b flex items-center gap-3">
            <HelpCircle className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">7. Domande frequenti</h2>
          </div>
          <div className="divide-y">
            {FAQ_ITEMS.map((faq, i) => (
              <button key={i} onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full text-left">
                <div className="px-6 py-4 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                  {openFaq === i
                    ? <ChevronDown className="w-4 h-4 text-blue-500 flex-shrink-0 mt-1" />
                    : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />}
                  <div className="flex-1">
                    <span className="font-medium text-sm text-gray-900">{faq.q}</span>
                    {openFaq === i && (
                      <p className="mt-2 text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ====================================================
            8. CONTATTI
            ==================================================== */}
        <section id="contatti" className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-white border-b flex items-center gap-3">
            <Phone className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">8. Contatti supporto</h2>
          </div>
          <div className="px-6 py-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-orange-500" /> Aruba — Problemi SDI
                </h3>
                <p className="text-sm text-gray-500 mb-3">Per credenziali API, abilitazioni, errori di connessione, problemi con il servizio Aruba.</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-3.5 h-3.5 text-gray-400" /> assistenza@aruba.it
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-3.5 h-3.5 text-gray-400" /> 0575 0505
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Globe className="w-3.5 h-3.5 text-gray-400" />
                    <a href="https://assistenza.aruba.it" target="_blank" rel="noopener" className="text-blue-600 hover:underline">
                      assistenza.aruba.it
                    </a>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-blue-500" /> Applicazione — Problemi tecnici
                </h3>
                <p className="text-sm text-gray-500 mb-3">Per bug, errori nell'app, richieste di funzionalità, configurazione.</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-3.5 h-3.5 text-gray-400" /> assistenza@b-conn.it
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-3.5 h-3.5 text-gray-400" /> Referente tecnico assegnato
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ====================================================
            ENDPOINT ARUBA (per riferimento tecnico)
            ==================================================== */}
        <section className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700 flex items-center gap-3">
            <Lock className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-bold text-gray-300">Riferimento tecnico — Endpoint Aruba</h2>
            <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded">per sviluppatori</span>
          </div>
          <div className="px-6 py-4 text-xs font-mono text-gray-400 space-y-1.5">
            <div><span className="text-gray-500">Demo:</span> <span className="text-green-400">https://demows.fatturazioneelettronica.aruba.it</span></div>
            <div><span className="text-gray-500">Prod:</span> <span className="text-green-400">https://ws.fatturazioneelettronica.aruba.it</span></div>
            <div className="pt-2 border-t border-gray-700">
              <span className="text-gray-500">Auth:</span> POST /auth/signin → Bearer token (scadenza 3600s)
            </div>
            <div><span className="text-gray-500">Upload:</span> POST /services/invoice/upload</div>
            <div><span className="text-gray-500">Status:</span> GET /services/invoice/getByFilename?filename=...</div>
            <div><span className="text-gray-500">Ricerca:</span> POST /services/invoice/search</div>
            <div><span className="text-gray-500">Notifiche:</span> GET /services/notification/search</div>
          </div>
        </section>

      </div>
    </div>
  );
}
