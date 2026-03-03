/**
 * ConfigurazioneFatturazionePage.tsx
 * 
 * Pagina admin per configurare il modulo fatturazione elettronica.
 * Dati cedente, REA, connessione SDI, defaults IVA/ritenuta/cassa/bollo,
 * pagamento default, numerazione fatture.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Save, Building2, Globe, Shield, Percent, Stamp,
  CreditCard, Hash, TestTube2, CheckCircle, XCircle, Loader2,
  Eye, EyeOff, ChevronDown, ChevronRight, RefreshCw, Plus, HelpCircle,
  Trash2, AlertTriangle, Banknote
} from 'lucide-react';

const API = '/api/fatturazione';

// ============================================================
// TIPI
// ============================================================

interface Configurazione {
  // Cedente
  denominazione: string;
  partita_iva: string;
  codice_fiscale: string;
  regime_fiscale: string;
  indirizzo: string;
  numero_civico: string;
  cap: string;
  comune: string;
  provincia: string;
  nazione: string;
  telefono: string;
  email: string;
  pec: string;
  // REA
  rea_ufficio: string;
  rea_numero: string;
  rea_capitale_sociale: number | null;
  rea_socio_unico: string;
  rea_stato_liquidazione: string;
  // SDI
  sdi_provider: string;
  sdi_username: string;
  sdi_password_encrypted: string;
  sdi_ambiente: string;
  sdi_codice_destinatario_ricezione: string;
  // Defaults IVA
  iva_default: number;
  esigibilita_default: string;
  natura_default: string;
  // Ritenuta
  ritenuta_attiva: boolean;
  ritenuta_tipo_default: string;
  ritenuta_aliquota_default: number | null;
  ritenuta_causale_default: string;
  // Cassa previdenziale
  cassa_attiva: boolean;
  cassa_tipo_default: string;
  cassa_aliquota_default: number | null;
  cassa_soggetta_ritenuta: boolean;
  // Bollo
  bollo_soglia: number;
  bollo_importo: number;
  // Pagamento
  condizioni_pagamento_default: string;
  modalita_pagamento_default: string;
  iban_default: string;
  bic_default: string;
  istituto_finanziario_default: string;
}

interface Numerazione {
  id: number;
  tipo_documento: string;
  anno: number;
  sezionale: string;
  ultimo_numero: number;
  formato: string;
  prefisso: string;
  padding_cifre: number;
}

const REGIMI_FISCALI = [
  { value: 'RF01', label: 'RF01 - Ordinario' },
  { value: 'RF02', label: 'RF02 - Contribuenti minimi' },
  { value: 'RF04', label: 'RF04 - Agricoltura' },
  { value: 'RF05', label: 'RF05 - Pesca' },
  { value: 'RF06', label: 'RF06 - Commercio ambulante' },
  { value: 'RF07', label: 'RF07 - Produzione, raccolta e cessione energia' },
  { value: 'RF08', label: 'RF08 - Agriturismo' },
  { value: 'RF09', label: 'RF09 - Spettacoli viaggianti' },
  { value: 'RF10', label: 'RF10 - Rivendita documenti di trasporto' },
  { value: 'RF11', label: 'RF11 - Agenzie di viaggio' },
  { value: 'RF12', label: 'RF12 - Beni usati' },
  { value: 'RF13', label: 'RF13 - Oggetti d\'arte' },
  { value: 'RF14', label: 'RF14 - Oggetti d\'antiquariato' },
  { value: 'RF15', label: 'RF15 - Oggetti da collezione' },
  { value: 'RF16', label: 'RF16 - IVA per cassa' },
  { value: 'RF17', label: 'RF17 - IVA per cassa P.A.' },
  { value: 'RF18', label: 'RF18 - Altro' },
  { value: 'RF19', label: 'RF19 - Forfettario' },
];

const NATURE_IVA = [
  { value: '', label: 'Nessuna (IVA ordinaria)' },
  { value: 'N1', label: 'N1 - Esclusa ex art. 15' },
  { value: 'N2.1', label: 'N2.1 - Non soggetta art. 7' },
  { value: 'N2.2', label: 'N2.2 - Non soggetta altri casi' },
  { value: 'N3.1', label: 'N3.1 - Non imponibile esportazioni' },
  { value: 'N3.2', label: 'N3.2 - Non imponibile cessioni UE' },
  { value: 'N3.3', label: 'N3.3 - Non imponibile cessioni San Marino' },
  { value: 'N3.4', label: 'N3.4 - Non imponibile operazioni assimilate' },
  { value: 'N3.5', label: 'N3.5 - Non imponibile dichiarazione intento' },
  { value: 'N3.6', label: 'N3.6 - Non imponibile altre operazioni' },
  { value: 'N4', label: 'N4 - Esente' },
  { value: 'N5', label: 'N5 - Regime del margine' },
  { value: 'N6.1', label: 'N6.1 - Inversione contabile cessioni rottami' },
  { value: 'N6.2', label: 'N6.2 - Inversione contabile cessioni oro' },
  { value: 'N6.3', label: 'N6.3 - Inversione contabile subappalto edilizia' },
  { value: 'N6.4', label: 'N6.4 - Inversione contabile cessioni fabbricati' },
  { value: 'N6.9', label: 'N6.9 - Inversione contabile altri casi' },
  { value: 'N7', label: 'N7 - IVA assolta in altro stato UE' },
];

const TIPI_CASSA = [
  { value: '', label: 'Nessuna' },
  { value: 'TC01', label: 'TC01 - Avvocati' },
  { value: 'TC02', label: 'TC02 - Dottori commercialisti' },
  { value: 'TC03', label: 'TC03 - Geometri' },
  { value: 'TC04', label: 'TC04 - Ingegneri e Architetti (INARCASSA)' },
  { value: 'TC07', label: 'TC07 - ENASARCO' },
  { value: 'TC17', label: 'TC17 - Periti industriali' },
  { value: 'TC22', label: 'TC22 - INPS gestione separata' },
];

const MODALITA_PAG = [
  { value: 'MP01', label: 'MP01 - Contanti' },
  { value: 'MP02', label: 'MP02 - Assegno' },
  { value: 'MP05', label: 'MP05 - Bonifico' },
  { value: 'MP08', label: 'MP08 - Carta di pagamento' },
  { value: 'MP12', label: 'MP12 - RIBA' },
  { value: 'MP16', label: 'MP16 - Domiciliazione bancaria' },
  { value: 'MP19', label: 'MP19 - SEPA DD' },
  { value: 'MP23', label: 'MP23 - PagoPA' },
];

// ============================================================
// COMPONENTE
// ============================================================

export default function ConfigurazioneFatturazionePage() {
  const [config, setConfig] = useState<Configurazione | null>(null);
  const [numerazioni, setNumerazioni] = useState<Numerazione[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    cedente: true, rea: false, sdi: true, iva: false,
    ritenuta: false, cassa: false, bollo: false, pagamento: false, numerazione: true,
  });

  const toggle = (key: string) => setOpenSections(p => ({ ...p, [key]: !p[key] }));

  // --- Carica ---
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rConf, rNum] = await Promise.all([
        fetch(`${API}/configurazione`),
        fetch(`${API}/numerazione`),
      ]);
      if (rConf.ok) setConfig(await rConf.json());
      if (rNum.ok) setNumerazioni(await rNum.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // --- Update field ---
  const upd = (field: string, value: any) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  // --- Salva configurazione ---
  const handleSave = async () => {
    if (!config) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const r = await fetch(`${API}/configurazione`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!r.ok) throw new Error((await r.json()).detail || 'Errore salvataggio');
      setSuccess('Configurazione salvata');
      setTimeout(() => setSuccess(''), 4000);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  // --- Test connessione ---
  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch(`${API}/configurazione/test-connessione`, { method: 'POST' });
      const data = await r.json();
      setTestResult({ ok: data.success, msg: data.message || data.error || '' });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message });
    } finally {
      setTesting(false);
    }
  };

  // --- Numerazione CRUD ---
  const saveNumerazione = async (n: Numerazione) => {
    try {
      const r = await fetch(`${API}/numerazione${n.id ? `/${n.id}` : ''}`, {
        method: n.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(n),
      });
      if (!r.ok) throw new Error('Errore salvataggio numerazione');
      await load();
    } catch (e: any) { setError(e.message); }
  };

  // ============================================================
  // RENDER HELPERS
  // ============================================================

  const inputClass = "w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
  const labelClass = "block text-xs font-medium text-gray-500 mb-1";

  const SectionHeader = ({ id, icon, title, desc }: { id: string; icon: React.ReactNode; title: string; desc?: string }) => (
    <button onClick={() => toggle(id)}
      className="w-full flex items-center gap-3 px-6 py-4 hover:bg-gray-50 transition-colors">
      <span className="text-blue-500">{icon}</span>
      <div className="flex-1 text-left">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
      </div>
      {openSections[id] ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
    </button>
  );

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  if (!config) return (
    <div className="min-h-screen bg-gray-50 p-8 text-center">
      <AlertTriangle className="w-16 h-16 mx-auto text-amber-400 mb-4" />
      <p className="text-gray-600 text-lg">Configurazione non trovata. Eseguire la migrazione del database.</p>
      <Link to="/fatturazione" className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:underline">
        <ArrowLeft className="w-4 h-4" /> Torna alla fatturazione
      </Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/fatturazione" className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Configurazione Fatturazione</h1>
              <p className="text-sm text-gray-500">Dati azienda, provider SDI, parametri fiscali</p>
            </div>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salva configurazione
          </button>
        </div>
        {error && <div className="max-w-4xl mx-auto px-6 pb-3"><div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div></div>}
        {success && <div className="max-w-4xl mx-auto px-6 pb-3"><div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4" />{success}</div></div>}
      </div>

      {/* BODY */}
      <div className="max-w-4xl mx-auto p-6 space-y-3">

        {/* ===================== DATI CEDENTE ===================== */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <SectionHeader id="cedente" icon={<Building2 className="w-5 h-5" />}
            title="Dati Cedente / Prestatore" desc="Dati dell'azienda che emette le fatture" />
          {openSections.cedente && (
            <div className="px-6 pb-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={labelClass}>Denominazione *</label>
                  <input value={config.denominazione || ''} onChange={e => upd('denominazione', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Partita IVA *</label>
                  <input value={config.partita_iva || ''} onChange={e => upd('partita_iva', e.target.value)} className={inputClass} maxLength={11} />
                </div>
                <div>
                  <label className={labelClass}>Codice Fiscale</label>
                  <input value={config.codice_fiscale || ''} onChange={e => upd('codice_fiscale', e.target.value)} className={inputClass} maxLength={16} />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Regime Fiscale *</label>
                  <select value={config.regime_fiscale || 'RF01'} onChange={e => upd('regime_fiscale', e.target.value)} className={inputClass}>
                    {REGIMI_FISCALI.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="border-t pt-4">
                <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3">Sede legale</h4>
                <div className="grid grid-cols-4 gap-4">
                  <div className="col-span-2">
                    <label className={labelClass}>Indirizzo</label>
                    <input value={config.indirizzo || ''} onChange={e => upd('indirizzo', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>N. civico</label>
                    <input value={config.numero_civico || ''} onChange={e => upd('numero_civico', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>CAP</label>
                    <input value={config.cap || ''} onChange={e => upd('cap', e.target.value)} className={inputClass} maxLength={5} />
                  </div>
                  <div>
                    <label className={labelClass}>Comune</label>
                    <input value={config.comune || ''} onChange={e => upd('comune', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Provincia</label>
                    <input value={config.provincia || ''} onChange={e => upd('provincia', e.target.value)} className={inputClass} maxLength={2} />
                  </div>
                  <div>
                    <label className={labelClass}>Nazione</label>
                    <input value={config.nazione || 'IT'} onChange={e => upd('nazione', e.target.value)} className={inputClass} maxLength={2} />
                  </div>
                </div>
              </div>
              <div className="border-t pt-4">
                <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3">Contatti</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Telefono</label>
                    <input value={config.telefono || ''} onChange={e => upd('telefono', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Email</label>
                    <input value={config.email || ''} onChange={e => upd('email', e.target.value)} className={inputClass} type="email" />
                  </div>
                  <div>
                    <label className={labelClass}>PEC</label>
                    <input value={config.pec || ''} onChange={e => upd('pec', e.target.value)} className={inputClass} type="email" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===================== ISCRIZIONE REA ===================== */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <SectionHeader id="rea" icon={<Shield className="w-5 h-5" />}
            title="Iscrizione REA" desc="Obbligatorio per S.r.l., S.p.A., ecc." />
          {openSections.rea && (
            <div className="px-6 pb-6">
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className={labelClass}>Ufficio REA</label>
                  <input value={config.rea_ufficio || ''} onChange={e => upd('rea_ufficio', e.target.value)} className={inputClass} maxLength={2} placeholder="TV" />
                </div>
                <div>
                  <label className={labelClass}>Numero REA</label>
                  <input value={config.rea_numero || ''} onChange={e => upd('rea_numero', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Capitale sociale</label>
                  <input type="number" value={config.rea_capitale_sociale ?? ''} onChange={e => upd('rea_capitale_sociale', parseFloat(e.target.value) || null)} className={inputClass} step="0.01" />
                </div>
                <div>
                  <label className={labelClass}>Socio unico</label>
                  <select value={config.rea_socio_unico || ''} onChange={e => upd('rea_socio_unico', e.target.value)} className={inputClass}>
                    <option value="">-</option>
                    <option value="SU">SU - Socio Unico</option>
                    <option value="SM">SM - Più Soci</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Stato liquidazione</label>
                  <select value={config.rea_stato_liquidazione || 'LN'} onChange={e => upd('rea_stato_liquidazione', e.target.value)} className={inputClass}>
                    <option value="LN">LN - Non in liquidazione</option>
                    <option value="LS">LS - In liquidazione</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===================== CONNESSIONE SDI ===================== */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <SectionHeader id="sdi" icon={<Globe className="w-5 h-5" />}
            title="Connessione SDI" desc="Provider, credenziali e ambiente" />
          {openSections.sdi && (
            <div className="px-6 pb-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Provider SDI</label>
                  <select value={config.sdi_provider || 'manuale'} onChange={e => upd('sdi_provider', e.target.value)} className={inputClass}>
                    <option value="manuale">Manuale (solo XML)</option>
                    <option value="aruba">Aruba Fatturazione</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Ambiente</label>
                  <select value={config.sdi_ambiente || 'demo'} onChange={e => upd('sdi_ambiente', e.target.value)} className={inputClass}>
                    <option value="demo">Demo (test)</option>
                    <option value="produzione">Produzione</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Cod. destinatario ricezione</label>
                  <input value={config.sdi_codice_destinatario_ricezione || ''} onChange={e => upd('sdi_codice_destinatario_ricezione', e.target.value)} className={inputClass} placeholder="KRRH6B9" />
                </div>
              </div>
              {config.sdi_provider === 'aruba' && (
                <div className="border rounded-lg p-4 bg-blue-50/30 space-y-3">
                  <h4 className="text-xs font-semibold text-blue-700 uppercase">Credenziali Aruba</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Username</label>
                      <input value={config.sdi_username || ''} onChange={e => upd('sdi_username', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Password</label>
                      <div className="relative">
                        <input type={showPwd ? 'text' : 'password'} value={config.sdi_password_encrypted || ''}
                          onChange={e => upd('sdi_password_encrypted', e.target.value)} className={`${inputClass} pr-10`} />
                        <button type="button" onClick={() => setShowPwd(!showPwd)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={handleTest} disabled={testing}
                      className="px-4 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-100 text-sm flex items-center gap-2 disabled:opacity-50">
                      {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube2 className="w-4 h-4" />}
                      Test connessione
                    </button>
                    {testResult && (
                      <span className={`text-sm flex items-center gap-1 ${testResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                        {testResult.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        {testResult.msg}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {config.sdi_ambiente === 'demo'
                      ? 'Connessione a: demows.fatturazioneelettronica.aruba.it'
                      : 'Connessione a: ws.fatturazioneelettronica.aruba.it'}
                  </p>
                  <Link to="/fatturazione/guida#setup-aruba"
                    className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 mt-1">
                    <HelpCircle className="w-3.5 h-3.5" /> Come ottenere le credenziali API Aruba
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ===================== DEFAULTS IVA ===================== */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <SectionHeader id="iva" icon={<Percent className="w-5 h-5" />}
            title="Defaults IVA" desc="Aliquota, esigibilità e natura operazione predefinite" />
          {openSections.iva && (
            <div className="px-6 pb-6">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Aliquota IVA default %</label>
                  <input type="number" value={config.iva_default ?? 22} onChange={e => upd('iva_default', parseFloat(e.target.value) || 0)} className={inputClass} step="0.5" />
                </div>
                <div>
                  <label className={labelClass}>Esigibilità default</label>
                  <select value={config.esigibilita_default || 'I'} onChange={e => upd('esigibilita_default', e.target.value)} className={inputClass}>
                    <option value="I">Immediata</option>
                    <option value="D">Differita</option>
                    <option value="S">Split payment</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Natura default (se esente)</label>
                  <select value={config.natura_default || ''} onChange={e => upd('natura_default', e.target.value)} className={inputClass}>
                    {NATURE_IVA.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===================== RITENUTA D'ACCONTO ===================== */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <SectionHeader id="ritenuta" icon={<Percent className="w-5 h-5" />}
            title="Ritenuta d'acconto" desc="Attivare se l'azienda emette fatture con ritenuta" />
          {openSections.ritenuta && (
            <div className="px-6 pb-6 space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={config.ritenuta_attiva || false}
                  onChange={e => upd('ritenuta_attiva', e.target.checked)} className="w-4 h-4 rounded" />
                Abilita ritenuta d'acconto nelle fatture
              </label>
              {config.ritenuta_attiva && (
                <div className="grid grid-cols-3 gap-4 mt-2">
                  <div>
                    <label className={labelClass}>Tipo ritenuta default</label>
                    <select value={config.ritenuta_tipo_default || 'RT01'} onChange={e => upd('ritenuta_tipo_default', e.target.value)} className={inputClass}>
                      <option value="RT01">RT01 - Persone fisiche</option>
                      <option value="RT02">RT02 - Persone giuridiche</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Aliquota default %</label>
                    <input type="number" value={config.ritenuta_aliquota_default ?? 20} onChange={e => upd('ritenuta_aliquota_default', parseFloat(e.target.value) || null)} className={inputClass} step="0.5" />
                  </div>
                  <div>
                    <label className={labelClass}>Causale pagamento</label>
                    <select value={config.ritenuta_causale_default || 'A'} onChange={e => upd('ritenuta_causale_default', e.target.value)} className={inputClass}>
                      <option value="A">A - Lavoro autonomo</option>
                      <option value="B">B - Opere ingegno</option>
                      <option value="M">M - Lavoro autonomo non abituale</option>
                      <option value="V">V - Attività commerciali</option>
                      <option value="ZO">ZO - Altro</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ===================== CASSA PREVIDENZIALE ===================== */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <SectionHeader id="cassa" icon={<Stamp className="w-5 h-5" />}
            title="Cassa previdenziale" desc="Per professionisti iscritti a cassa (INARCASSA, ENPAM, ecc.)" />
          {openSections.cassa && (
            <div className="px-6 pb-6 space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={config.cassa_attiva || false}
                  onChange={e => upd('cassa_attiva', e.target.checked)} className="w-4 h-4 rounded" />
                Abilita contributo cassa previdenziale
              </label>
              {config.cassa_attiva && (
                <div className="grid grid-cols-3 gap-4 mt-2">
                  <div className="col-span-2">
                    <label className={labelClass}>Tipo cassa</label>
                    <select value={config.cassa_tipo_default || ''} onChange={e => upd('cassa_tipo_default', e.target.value)} className={inputClass}>
                      {TIPI_CASSA.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Aliquota %</label>
                    <input type="number" value={config.cassa_aliquota_default ?? 4} onChange={e => upd('cassa_aliquota_default', parseFloat(e.target.value) || null)} className={inputClass} step="0.5" />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={config.cassa_soggetta_ritenuta || false}
                        onChange={e => upd('cassa_soggetta_ritenuta', e.target.checked)} className="w-4 h-4 rounded" />
                      Cassa soggetta a ritenuta d'acconto
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ===================== BOLLO VIRTUALE ===================== */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <SectionHeader id="bollo" icon={<Stamp className="w-5 h-5" />}
            title="Bollo virtuale" desc="Applicato automaticamente su fatture esenti sopra soglia" />
          {openSections.bollo && (
            <div className="px-6 pb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Soglia automatica (€)</label>
                  <input type="number" value={config.bollo_soglia ?? 77.47} onChange={e => upd('bollo_soglia', parseFloat(e.target.value) || 0)} className={inputClass} step="0.01" />
                  <p className="text-xs text-gray-400 mt-1">Default: € 77,47 (obbligatorio per legge)</p>
                </div>
                <div>
                  <label className={labelClass}>Importo bollo (€)</label>
                  <input type="number" value={config.bollo_importo ?? 2} onChange={e => upd('bollo_importo', parseFloat(e.target.value) || 0)} className={inputClass} step="0.01" />
                  <p className="text-xs text-gray-400 mt-1">Default: € 2,00</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===================== PAGAMENTO DEFAULT ===================== */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <SectionHeader id="pagamento" icon={<CreditCard className="w-5 h-5" />}
            title="Pagamento predefinito" desc="Usato come default nelle nuove fatture" />
          {openSections.pagamento && (
            <div className="px-6 pb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Condizioni pagamento</label>
                  <select value={config.condizioni_pagamento_default || 'TP02'} onChange={e => upd('condizioni_pagamento_default', e.target.value)} className={inputClass}>
                    <option value="TP01">TP01 - A rate</option>
                    <option value="TP02">TP02 - Pagamento completo</option>
                    <option value="TP03">TP03 - Anticipo</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Modalità pagamento</label>
                  <select value={config.modalita_pagamento_default || 'MP05'} onChange={e => upd('modalita_pagamento_default', e.target.value)} className={inputClass}>
                    {MODALITA_PAG.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>IBAN</label>
                  <input value={config.iban_default || ''} onChange={e => upd('iban_default', e.target.value)} className={inputClass} maxLength={34} placeholder="IT60X0542811101000000123456" />
                </div>
                <div>
                  <label className={labelClass}>Istituto finanziario</label>
                  <input value={config.istituto_finanziario_default || ''} onChange={e => upd('istituto_finanziario_default', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>BIC/SWIFT</label>
                  <input value={config.bic_default || ''} onChange={e => upd('bic_default', e.target.value)} className={inputClass} maxLength={11} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===================== NUMERAZIONE ===================== */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <SectionHeader id="numerazione" icon={<Hash className="w-5 h-5" />}
            title="Numerazione fatture" desc="Contatori progressivi per tipo documento e anno" />
          {openSections.numerazione && (
            <div className="px-6 pb-6">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-left">Anno</th>
                    <th className="px-3 py-2 text-left">Prefisso</th>
                    <th className="px-3 py-2 text-left">Formato</th>
                    <th className="px-3 py-2 text-right">Padding</th>
                    <th className="px-3 py-2 text-right">Ultimo n.</th>
                    <th className="px-3 py-2 text-left">Sezionale</th>
                    <th className="px-3 py-2 text-center">Anteprima</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {numerazioni.map(n => {
                    const preview = (n.formato || '{prefisso}{numero}/{anno}')
                      .replace('{prefisso}', n.prefisso || '')
                      .replace('{numero}', String(n.ultimo_numero + 1).padStart(n.padding_cifre || 4, '0'))
                      .replace('{anno}', String(n.anno))
                      .replace('{sezionale}', n.sezionale || '');
                    return (
                      <tr key={n.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono font-medium">{n.tipo_documento}</td>
                        <td className="px-3 py-2">{n.anno}</td>
                        <td className="px-3 py-2">
                          <input value={n.prefisso || ''} className="px-2 py-1 border rounded text-xs w-16"
                            onChange={e => {
                              const updated = numerazioni.map(x => x.id === n.id ? { ...x, prefisso: e.target.value } : x);
                              setNumerazioni(updated);
                            }} />
                        </td>
                        <td className="px-3 py-2">
                          <input value={n.formato || ''} className="px-2 py-1 border rounded text-xs w-40 font-mono"
                            onChange={e => {
                              const updated = numerazioni.map(x => x.id === n.id ? { ...x, formato: e.target.value } : x);
                              setNumerazioni(updated);
                            }} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" value={n.padding_cifre || 4} className="px-2 py-1 border rounded text-xs w-14 text-right"
                            onChange={e => {
                              const updated = numerazioni.map(x => x.id === n.id ? { ...x, padding_cifre: parseInt(e.target.value) || 4 } : x);
                              setNumerazioni(updated);
                            }} />
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{n.ultimo_numero}</td>
                        <td className="px-3 py-2">{n.sezionale || '-'}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-mono">{preview}</span>
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={() => saveNumerazione(n)}
                            className="text-blue-500 hover:text-blue-700">
                            <Save className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-3">
                Placeholder disponibili nel formato: <code className="bg-gray-100 px-1 rounded">{'{prefisso}'}</code> <code className="bg-gray-100 px-1 rounded">{'{numero}'}</code> <code className="bg-gray-100 px-1 rounded">{'{anno}'}</code> <code className="bg-gray-100 px-1 rounded">{'{sezionale}'}</code>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
