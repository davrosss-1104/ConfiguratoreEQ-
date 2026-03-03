/**
 * FatturaDettaglioPage.tsx - Dettaglio singola fattura elettronica
 *
 * Testata editabile (se bozza), righe, pannello fiscale (ritenuta, cassa, bollo),
 * riepilogo IVA, timeline SDI, anteprima XML.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  FileText, Save, Send, RefreshCw, Download, ArrowLeft, Trash2,
  CheckCircle, AlertTriangle, Clock, XCircle, Eye, Plus, Copy,
  Receipt, Building2, Calendar, CreditCard, Percent, Stamp,
  ChevronDown, ChevronRight, Code, Loader2, FileCheck, Ban,
  GitBranch, DollarSign, FileX, Banknote
} from 'lucide-react';

const API = '/api/fatturazione';

// ============================================================
// TIPI
// ============================================================

interface Riga {
  id?: number;
  numero_riga: number;
  codice_tipo?: string;
  codice_valore?: string;
  descrizione: string;
  quantita: number;
  unita_misura?: string;
  prezzo_unitario: number;
  sconto_percentuale: number;
  prezzo_totale: number;
  aliquota_iva: number;
  natura?: string;
  riferimento_normativo?: string;
  ritenuta: boolean;
}

interface Notifica {
  id: number;
  tipo_notifica: string;
  descrizione: string;
  data_ricezione: string;
  contenuto_json: any;
}

interface FatturaFull {
  id: number;
  direzione: string;
  tipo_documento: string;
  numero_fattura: string | null;
  anno: number;
  progressivo_invio: string | null;
  stato_sdi: string;
  // Destinatario
  cliente_id: number | null;
  dest_denominazione: string;
  dest_partita_iva: string;
  dest_codice_fiscale: string;
  dest_indirizzo: string;
  dest_numero_civico: string;
  dest_cap: string;
  dest_comune: string;
  dest_provincia: string;
  dest_nazione: string;
  dest_pec: string;
  dest_codice_destinatario: string;
  // Date
  data_fattura: string;
  data_scadenza: string | null;
  // Totali
  imponibile_totale: number;
  iva_totale: number;
  totale_fattura: number;
  // Ritenuta
  ritenuta_tipo: string | null;
  ritenuta_aliquota: number | null;
  ritenuta_importo: number;
  ritenuta_causale: string | null;
  // Cassa prev
  cassa_tipo: string | null;
  cassa_aliquota: number | null;
  cassa_importo: number;
  cassa_imponibile: number;
  cassa_aliquota_iva: number | null;
  cassa_ritenuta: boolean;
  cassa_natura: string | null;
  // Bollo
  bollo_virtuale: boolean;
  bollo_importo: number;
  // IVA
  esigibilita_iva: string;
  // Pagamento
  condizioni_pagamento: string;
  modalita_pagamento: string;
  iban_pagamento: string | null;
  istituto_finanziario: string | null;
  // Ordine
  ordine_id: number | null;
  preventivo_id: number | null;
  fattura_origine_id: number | null;
  dati_ordine_id_documento: string | null;
  dati_ordine_codice_commessa: string | null;
  dati_ordine_codice_cup: string | null;
  dati_ordine_codice_cig: string | null;
  // SDI
  xml_filename: string | null;
  xml_content: string | null;
  sdi_identificativo: string | null;
  sdi_filename: string | null;
  sdi_data_invio: string | null;
  sdi_data_consegna: string | null;
  // Note
  causale: string | null;
  note_interne: string | null;
  // Sub
  righe: Riga[];
  notifiche: Notifica[];
  allegati: any[];
  tipo_documento_desc: string;
  created_at: string;
}

// ============================================================
// COSTANTI
// ============================================================

const TIPO_DOC_OPTIONS = [
  { value: 'TD01', label: 'TD01 - Fattura' },
  { value: 'TD02', label: 'TD02 - Acconto/Anticipo' },
  { value: 'TD04', label: 'TD04 - Nota di credito' },
  { value: 'TD05', label: 'TD05 - Nota di debito' },
  { value: 'TD06', label: 'TD06 - Parcella' },
  { value: 'TD24', label: 'TD24 - Fattura differita' },
];

const ESIGIBILITA_OPTIONS = [
  { value: 'I', label: 'Immediata' },
  { value: 'D', label: 'Differita' },
  { value: 'S', label: 'Split payment (PA)' },
];

const CONDIZIONI_PAG = [
  { value: 'TP01', label: 'A rate' },
  { value: 'TP02', label: 'Pagamento completo' },
  { value: 'TP03', label: 'Anticipo' },
];

const MODALITA_PAG = [
  { value: 'MP01', label: 'Contanti' },
  { value: 'MP02', label: 'Assegno' },
  { value: 'MP05', label: 'Bonifico' },
  { value: 'MP08', label: 'Carta di pagamento' },
  { value: 'MP12', label: 'RIBA' },
  { value: 'MP16', label: 'Domiciliazione bancaria' },
  { value: 'MP19', label: 'SEPA Direct Debit' },
  { value: 'MP23', label: 'PagoPA' },
];

const STATO_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  bozza:              { bg: 'bg-gray-100',    text: 'text-gray-700',    ring: 'ring-gray-300' },
  generata:           { bg: 'bg-blue-100',    text: 'text-blue-700',    ring: 'ring-blue-300' },
  inviata:            { bg: 'bg-amber-100',   text: 'text-amber-700',   ring: 'ring-amber-300' },
  consegnata:         { bg: 'bg-green-100',   text: 'text-green-700',   ring: 'ring-green-300' },
  accettata:          { bg: 'bg-emerald-100',  text: 'text-emerald-700',  ring: 'ring-emerald-300' },
  scartata:           { bg: 'bg-red-100',     text: 'text-red-700',     ring: 'ring-red-300' },
  rifiutata:          { bg: 'bg-red-100',     text: 'text-red-700',     ring: 'ring-red-300' },
  errore:             { bg: 'bg-red-100',     text: 'text-red-700',     ring: 'ring-red-300' },
  mancata_consegna:   { bg: 'bg-orange-100',  text: 'text-orange-700',  ring: 'ring-orange-300' },
  decorrenza_termini: { bg: 'bg-purple-100',  text: 'text-purple-700',  ring: 'ring-purple-300' },
};

function fmtEuro(n: number | null | undefined): string {
  if (n == null) return '€ 0,00';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}
function fmtData(d: string | null | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('it-IT');
}
function fmtDataOra(d: string | null | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleString('it-IT');
}

// ============================================================
// COMPONENTE PRINCIPALE
// ============================================================

export default function FatturaDettaglioPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [fattura, setFattura] = useState<FatturaFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'dettaglio' | 'fiscale' | 'pagamento' | 'sdi' | 'xml'>('dettaglio');
  const [xmlPreview, setXmlPreview] = useState<string | null>(null);

  // --- Carica fattura ---
  const loadFattura = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/fatture/${id}`);
      if (!r.ok) throw new Error('Fattura non trovata');
      setFattura(await r.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadFattura(); }, [loadFattura]);

  const isEditable = fattura && ['bozza', 'errore', 'scartata'].includes(fattura.stato_sdi);

  // --- Update field ---
  const updateField = (field: string, value: any) => {
    if (!fattura) return;
    setFattura({ ...fattura, [field]: value });
  };

  // --- Update riga ---
  const updateRiga = (idx: number, field: string, value: any) => {
    if (!fattura) return;
    const righe = [...fattura.righe];
    righe[idx] = { ...righe[idx], [field]: value };
    // Ricalcola totale riga
    const r = righe[idx];
    let ptot = (r.quantita || 0) * (r.prezzo_unitario || 0);
    if (r.sconto_percentuale) ptot *= (1 - r.sconto_percentuale / 100);
    righe[idx].prezzo_totale = Math.round(ptot * 100) / 100;
    setFattura({ ...fattura, righe });
  };

  const addRiga = () => {
    if (!fattura) return;
    const nuovaRiga: Riga = {
      numero_riga: fattura.righe.length + 1,
      descrizione: '', quantita: 1, prezzo_unitario: 0,
      sconto_percentuale: 0, prezzo_totale: 0, aliquota_iva: 22, ritenuta: false,
    };
    setFattura({ ...fattura, righe: [...fattura.righe, nuovaRiga] });
  };

  const removeRiga = (idx: number) => {
    if (!fattura) return;
    setFattura({ ...fattura, righe: fattura.righe.filter((_, i) => i !== idx) });
  };

  // --- Salva ---
  const handleSave = async () => {
    if (!fattura) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const payload = {
        tipo_documento: fattura.tipo_documento,
        dest_denominazione: fattura.dest_denominazione,
        dest_partita_iva: fattura.dest_partita_iva,
        dest_codice_fiscale: fattura.dest_codice_fiscale,
        dest_indirizzo: fattura.dest_indirizzo,
        dest_numero_civico: fattura.dest_numero_civico,
        dest_cap: fattura.dest_cap,
        dest_comune: fattura.dest_comune,
        dest_provincia: fattura.dest_provincia,
        dest_nazione: fattura.dest_nazione,
        dest_pec: fattura.dest_pec,
        dest_codice_destinatario: fattura.dest_codice_destinatario,
        data_fattura: fattura.data_fattura,
        data_scadenza: fattura.data_scadenza,
        ritenuta_tipo: fattura.ritenuta_tipo,
        ritenuta_aliquota: fattura.ritenuta_aliquota,
        ritenuta_causale: fattura.ritenuta_causale,
        cassa_tipo: fattura.cassa_tipo,
        cassa_aliquota: fattura.cassa_aliquota,
        cassa_ritenuta: fattura.cassa_ritenuta,
        cassa_aliquota_iva: fattura.cassa_aliquota_iva,
        cassa_natura: fattura.cassa_natura,
        esigibilita_iva: fattura.esigibilita_iva,
        condizioni_pagamento: fattura.condizioni_pagamento,
        modalita_pagamento: fattura.modalita_pagamento,
        iban_pagamento: fattura.iban_pagamento,
        istituto_finanziario: fattura.istituto_finanziario,
        dati_ordine_id_documento: fattura.dati_ordine_id_documento,
        dati_ordine_codice_commessa: fattura.dati_ordine_codice_commessa,
        dati_ordine_codice_cup: fattura.dati_ordine_codice_cup,
        dati_ordine_codice_cig: fattura.dati_ordine_codice_cig,
        causale: fattura.causale,
        note_interne: fattura.note_interne,
        righe: fattura.righe.map((r, i) => ({
          ...r,
          numero_riga: i + 1,
        })),
      };

      const r = await fetch(`${API}/fatture/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.detail || 'Errore salvataggio');
      }
      setSuccess('Fattura salvata');
      await loadFattura();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // --- Genera XML ---
  const handleGeneraXML = async () => {
    setSaving(true); setError('');
    try {
      const r = await fetch(`${API}/fatture/${id}/genera-xml`, { method: 'POST' });
      const data = await r.json();
      if (!r.ok) {
        if (data.errori) setError(data.errori.join(', '));
        else throw new Error(data.detail || 'Errore generazione');
        return;
      }
      setSuccess(`XML generato: ${data.xml_filename}`);
      await loadFattura();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  // --- Invia SDI ---
  const handleInviaSDI = async () => {
    setSaving(true); setError('');
    try {
      const r = await fetch(`${API}/fatture/${id}/invia-sdi`, { method: 'POST' });
      const data = await r.json();
      if (data.success) {
        setSuccess('Fattura inviata a SDI');
      } else {
        setError(data.error || 'Errore invio');
      }
      await loadFattura();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  // --- Aggiorna stato ---
  const handleAggiornaStato = async () => {
    try {
      await fetch(`${API}/fatture/${id}/aggiorna-stato`, { method: 'POST' });
      await loadFattura();
    } catch (e: any) { setError(e.message); }
  };

  // --- Elimina ---
  const handleElimina = async () => {
    if (!confirm('Eliminare questa fattura?')) return;
    try {
      await fetch(`${API}/fatture/${id}`, { method: 'DELETE' });
      navigate('/fatturazione');
    } catch (e: any) { setError(e.message); }
  };

  // --- Nota di credito ---
  const handleCreaNDC = async () => {
    try {
      const r = await fetch(`${API}/fatture/${id}/nota-credito`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await r.json();
      navigate(`/fatturazione/${data.id}`);
    } catch (e: any) { setError(e.message); }
  };

  // --- Duplica ---
  const handleDuplica = async () => {
    if (!fattura) return;
    try {
      const payload = {
        direzione: 'attiva',
        tipo_documento: fattura.tipo_documento,
        dest_denominazione: fattura.dest_denominazione,
        dest_partita_iva: fattura.dest_partita_iva,
        dest_codice_fiscale: fattura.dest_codice_fiscale,
        dest_indirizzo: fattura.dest_indirizzo,
        dest_cap: fattura.dest_cap,
        dest_comune: fattura.dest_comune,
        dest_provincia: fattura.dest_provincia,
        dest_codice_destinatario: fattura.dest_codice_destinatario,
        data_fattura: new Date().toISOString(),
        causale: fattura.causale,
        righe: fattura.righe.map(r => ({
          descrizione: r.descrizione, quantita: r.quantita,
          prezzo_unitario: r.prezzo_unitario, aliquota_iva: r.aliquota_iva,
          prezzo_totale: r.prezzo_totale,
        })),
      };
      const r = await fetch(`${API}/fatture`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      navigate(`/fatturazione/${data.id}`);
    } catch (e: any) { setError(e.message); }
  };

  // --- Carica XML preview ---
  const handleLoadXml = async () => {
    try {
      const r = await fetch(`${API}/fatture/${id}/xml`);
      if (r.ok) setXmlPreview(await r.text());
    } catch (_) {}
  };

  // --- Riepilogo IVA calcolato ---
  const riepilogoIva = useMemo(() => {
    if (!fattura) return [];
    const gruppi: Record<string, { aliquota: number; imponibile: number; imposta: number }> = {};
    for (const r of fattura.righe) {
      const key = String(r.aliquota_iva);
      if (!gruppi[key]) gruppi[key] = { aliquota: r.aliquota_iva, imponibile: 0, imposta: 0 };
      gruppi[key].imponibile += r.prezzo_totale || 0;
    }
    for (const g of Object.values(gruppi)) {
      g.imposta = Math.round(g.imponibile * g.aliquota / 100 * 100) / 100;
    }
    return Object.values(gruppi);
  }, [fattura?.righe]);

  const totImponibile = riepilogoIva.reduce((s, g) => s + g.imponibile, 0);
  const totIva = riepilogoIva.reduce((s, g) => s + g.imposta, 0);
  const totDocumento = fattura?.totale_fattura || (totImponibile + totIva);

  // ============================================================
  // RENDER
  // ============================================================

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  if (!fattura) return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto text-center">
        <FileX className="w-16 h-16 mx-auto text-gray-300 mb-4" />
        <p className="text-gray-600 text-lg">{error || 'Fattura non trovata'}</p>
        <Link to="/fatturazione" className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Torna alla lista
        </Link>
      </div>
    </div>
  );

  const sc = STATO_COLORS[fattura.stato_sdi] || STATO_COLORS.bozza;
  const inputClass = "w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500";
  const labelClass = "block text-xs font-medium text-gray-500 mb-1";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/fatturazione" className="p-2 hover:bg-gray-100 rounded-lg">
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </Link>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-bold text-gray-900">
                    {fattura.numero_fattura || 'Bozza'}
                  </h1>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${sc.bg} ${sc.text} ${sc.ring}`}>
                    {fattura.stato_sdi.replace(/_/g, ' ').toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                    {fattura.tipo_documento_desc || fattura.tipo_documento}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {fattura.dest_denominazione} · {fmtData(fattura.data_fattura)}
                  {fattura.ordine_id && <span className="ml-2">· Ordine #{fattura.ordine_id}</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isEditable && (
                <button onClick={handleSave} disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salva
                </button>
              )}
              {fattura.stato_sdi === 'bozza' && (
                <button onClick={handleGeneraXML} disabled={saving}
                  className="px-3 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 text-sm flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4" /> Genera XML
                </button>
              )}
              {['generata', 'errore', 'scartata'].includes(fattura.stato_sdi) && (
                <button onClick={handleInviaSDI} disabled={saving}
                  className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-1.5">
                  <Send className="w-4 h-4" /> Invia SDI
                </button>
              )}
              {['inviata', 'mancata_consegna'].includes(fattura.stato_sdi) && (
                <button onClick={handleAggiornaStato}
                  className="px-3 py-2 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 text-sm flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4" /> Aggiorna stato
                </button>
              )}
              {/* Menu azioni extra */}
              <div className="relative group">
                <button className="px-3 py-2 border rounded-lg text-gray-600 hover:bg-gray-50 text-sm flex items-center gap-1">
                  Altro <ChevronDown className="w-3 h-3" />
                </button>
                <div className="absolute right-0 mt-1 w-56 bg-white border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
                  {fattura.tipo_documento === 'TD01' && fattura.stato_sdi !== 'bozza' && (
                    <button onClick={handleCreaNDC} className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
                      <FileX className="w-4 h-4 text-red-500" /> Crea nota di credito
                    </button>
                  )}
                  <button onClick={handleDuplica} className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
                    <Copy className="w-4 h-4 text-blue-500" /> Duplica fattura
                  </button>
                  {fattura.xml_filename && (
                    <a href={`${API}/fatture/${id}/xml`} download
                       className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
                      <Download className="w-4 h-4 text-purple-500" /> Scarica XML
                    </a>
                  )}
                  {['bozza', 'errore'].includes(fattura.stato_sdi) && (
                    <button onClick={handleElimina} className="w-full px-4 py-2.5 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2 border-t">
                      <Trash2 className="w-4 h-4" /> Elimina
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Messaggi */}
          {error && <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>}
          {success && <div className="mt-3 bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">{success}</div>}

          {/* Tabs */}
          <div className="flex gap-1 mt-4 -mb-px">
            {[
              { key: 'dettaglio', label: 'Dettaglio', icon: <FileText className="w-4 h-4" /> },
              { key: 'fiscale', label: 'Fiscale', icon: <Percent className="w-4 h-4" /> },
              { key: 'pagamento', label: 'Pagamento', icon: <CreditCard className="w-4 h-4" /> },
              { key: 'sdi', label: 'Timeline SDI', icon: <GitBranch className="w-4 h-4" /> },
              { key: 'xml', label: 'XML', icon: <Code className="w-4 h-4" /> },
            ].map(t => (
              <button key={t.key}
                onClick={() => { setActiveTab(t.key as any); if (t.key === 'xml') handleLoadXml(); }}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors rounded-t ${
                  activeTab === t.key
                    ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* BODY */}
      <div className="max-w-7xl mx-auto p-6">
        {activeTab === 'dettaglio' && (
          <div className="space-y-6">
            {/* Destinatario */}
            <section className="bg-white rounded-xl border p-6">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-500" /> Destinatario
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="col-span-2">
                  <label className={labelClass}>Denominazione *</label>
                  <input value={fattura.dest_denominazione || ''} disabled={!isEditable}
                    onChange={e => updateField('dest_denominazione', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Partita IVA</label>
                  <input value={fattura.dest_partita_iva || ''} disabled={!isEditable} maxLength={11}
                    onChange={e => updateField('dest_partita_iva', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Codice Fiscale</label>
                  <input value={fattura.dest_codice_fiscale || ''} disabled={!isEditable} maxLength={16}
                    onChange={e => updateField('dest_codice_fiscale', e.target.value)} className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Indirizzo</label>
                  <input value={fattura.dest_indirizzo || ''} disabled={!isEditable}
                    onChange={e => updateField('dest_indirizzo', e.target.value)} className={inputClass} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={labelClass}>CAP</label>
                    <input value={fattura.dest_cap || ''} disabled={!isEditable} maxLength={5}
                      onChange={e => updateField('dest_cap', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Comune</label>
                    <input value={fattura.dest_comune || ''} disabled={!isEditable}
                      onChange={e => updateField('dest_comune', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Prov.</label>
                    <input value={fattura.dest_provincia || ''} disabled={!isEditable} maxLength={2}
                      onChange={e => updateField('dest_provincia', e.target.value)} className={inputClass} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Cod. SDI</label>
                    <input value={fattura.dest_codice_destinatario || ''} disabled={!isEditable} maxLength={7}
                      onChange={e => updateField('dest_codice_destinatario', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>PEC</label>
                    <input value={fattura.dest_pec || ''} disabled={!isEditable}
                      onChange={e => updateField('dest_pec', e.target.value)} className={inputClass} />
                  </div>
                </div>
              </div>
            </section>

            {/* Tipo / Date / Causale */}
            <section className="bg-white rounded-xl border p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className={labelClass}>Tipo documento</label>
                  <select value={fattura.tipo_documento} disabled={!isEditable}
                    onChange={e => updateField('tipo_documento', e.target.value)} className={inputClass}>
                    {TIPO_DOC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Data fattura</label>
                  <input type="date" value={(fattura.data_fattura || '').slice(0, 10)} disabled={!isEditable}
                    onChange={e => updateField('data_fattura', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Data scadenza</label>
                  <input type="date" value={(fattura.data_scadenza || '').slice(0, 10)} disabled={!isEditable}
                    onChange={e => updateField('data_scadenza', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Rif. ordine</label>
                  <input value={fattura.dati_ordine_id_documento || ''} disabled={!isEditable}
                    onChange={e => updateField('dati_ordine_id_documento', e.target.value)} className={inputClass} />
                </div>
                <div className="col-span-2 md:col-span-4">
                  <label className={labelClass}>Causale</label>
                  <textarea value={fattura.causale || ''} disabled={!isEditable} rows={2}
                    onChange={e => updateField('causale', e.target.value)} className={inputClass} />
                </div>
              </div>
            </section>

            {/* Righe */}
            <section className="bg-white rounded-xl border">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-blue-500" /> Righe fattura
                </h2>
                {isEditable && (
                  <button onClick={addRiga} className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Aggiungi riga
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-3 py-2 text-center w-10">#</th>
                      <th className="px-3 py-2 text-left">Codice</th>
                      <th className="px-3 py-2 text-left min-w-[200px]">Descrizione</th>
                      <th className="px-3 py-2 text-right w-20">Q.tà</th>
                      <th className="px-3 py-2 text-right w-24">Prezzo un.</th>
                      <th className="px-3 py-2 text-right w-20">Sc. %</th>
                      <th className="px-3 py-2 text-right w-24">Totale</th>
                      <th className="px-3 py-2 text-right w-16">IVA %</th>
                      <th className="px-3 py-2 text-center w-12">Rit.</th>
                      {isEditable && <th className="px-3 py-2 w-10"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {fattura.righe.map((r, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/30">
                        <td className="px-3 py-2 text-center text-gray-400">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <input value={r.codice_valore || ''} disabled={!isEditable}
                            onChange={e => updateRiga(idx, 'codice_valore', e.target.value)}
                            className="w-full px-2 py-1 border rounded text-xs" placeholder="Codice" />
                        </td>
                        <td className="px-3 py-2">
                          <input value={r.descrizione} disabled={!isEditable}
                            onChange={e => updateRiga(idx, 'descrizione', e.target.value)}
                            className="w-full px-2 py-1 border rounded text-sm" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" value={r.quantita} disabled={!isEditable} step="0.01"
                            onChange={e => updateRiga(idx, 'quantita', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 border rounded text-sm text-right" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" value={r.prezzo_unitario} disabled={!isEditable} step="0.01"
                            onChange={e => updateRiga(idx, 'prezzo_unitario', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 border rounded text-sm text-right" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" value={r.sconto_percentuale} disabled={!isEditable} step="0.5"
                            onChange={e => updateRiga(idx, 'sconto_percentuale', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 border rounded text-sm text-right" />
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{fmtEuro(r.prezzo_totale)}</td>
                        <td className="px-3 py-2">
                          <input type="number" value={r.aliquota_iva} disabled={!isEditable}
                            onChange={e => updateRiga(idx, 'aliquota_iva', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 border rounded text-sm text-right" />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox" checked={r.ritenuta} disabled={!isEditable}
                            onChange={e => updateRiga(idx, 'ritenuta', e.target.checked)}
                            className="w-4 h-4 rounded" />
                        </td>
                        {isEditable && (
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => removeRiga(idx)} className="text-red-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Riepilogo IVA */}
              <div className="px-6 py-4 border-t bg-gray-50/50">
                <div className="flex justify-end">
                  <div className="w-80 space-y-2">
                    {riepilogoIva.map(g => (
                      <div key={g.aliquota} className="flex justify-between text-sm">
                        <span className="text-gray-500">Imponibile {g.aliquota}%</span>
                        <span>{fmtEuro(g.imponibile)}</span>
                        <span className="text-gray-500">IVA</span>
                        <span>{fmtEuro(g.imposta)}</span>
                      </div>
                    ))}
                    <div className="border-t pt-2 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Imponibile</span><span className="font-medium">{fmtEuro(totImponibile)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>IVA</span><span className="font-medium">{fmtEuro(totIva)}</span>
                      </div>
                      {fattura.cassa_importo > 0 && (
                        <div className="flex justify-between text-sm text-amber-700">
                          <span>Cassa prev.</span><span>{fmtEuro(fattura.cassa_importo)}</span>
                        </div>
                      )}
                      {fattura.bollo_importo > 0 && (
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>Bollo</span><span>{fmtEuro(fattura.bollo_importo)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-lg font-bold border-t pt-2">
                        <span>Totale documento</span><span>{fmtEuro(totDocumento)}</span>
                      </div>
                      {fattura.ritenuta_importo > 0 && (
                        <div className="flex justify-between text-sm text-red-700">
                          <span>Ritenuta d'acconto</span><span>- {fmtEuro(fattura.ritenuta_importo)}</span>
                        </div>
                      )}
                      {fattura.ritenuta_importo > 0 && (
                        <div className="flex justify-between font-bold text-green-700">
                          <span>Netto a pagare</span>
                          <span>{fmtEuro(totDocumento - fattura.ritenuta_importo)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB FISCALE */}
        {activeTab === 'fiscale' && (
          <div className="space-y-6">
            {/* Ritenuta d'acconto */}
            <section className="bg-white rounded-xl border p-6">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                <Percent className="w-4 h-4 text-red-500" /> Ritenuta d'acconto
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Tipo ritenuta</label>
                  <select value={fattura.ritenuta_tipo || ''} disabled={!isEditable}
                    onChange={e => updateField('ritenuta_tipo', e.target.value || null)} className={inputClass}>
                    <option value="">Nessuna</option>
                    <option value="RT01">RT01 - Persone fisiche</option>
                    <option value="RT02">RT02 - Persone giuridiche</option>
                    <option value="RT03">RT03 - Contributo INPS</option>
                    <option value="RT04">RT04 - Contributo ENASARCO</option>
                    <option value="RT05">RT05 - Contributo ENPAM</option>
                    <option value="RT06">RT06 - Altro contributo previdenziale</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Aliquota %</label>
                  <input type="number" value={fattura.ritenuta_aliquota || ''} disabled={!isEditable}
                    onChange={e => updateField('ritenuta_aliquota', parseFloat(e.target.value) || null)}
                    className={inputClass} step="0.01" />
                </div>
                <div>
                  <label className={labelClass}>Causale pagamento</label>
                  <select value={fattura.ritenuta_causale || ''} disabled={!isEditable}
                    onChange={e => updateField('ritenuta_causale', e.target.value || null)} className={inputClass}>
                    <option value="">-</option>
                    <option value="A">A - Prestazioni di lavoro autonomo</option>
                    <option value="B">B - Utilizzazione economica opere ingegno</option>
                    <option value="C">C - Utili derivanti da contratti di associazione</option>
                    <option value="D">D - Utili da contratti di cointeressenza</option>
                    <option value="L">L - Redditi derivanti da utilizzazione economica</option>
                    <option value="M">M - Prestazioni di lavoro autonomo non esercitate abitualmente</option>
                    <option value="O">O - Prestazioni di lavoro autonomo non esercitate abitualmente</option>
                    <option value="V">V - Redditi derivanti da attività commerciali</option>
                    <option value="ZO">ZO - Titolo diverso dai precedenti</option>
                  </select>
                </div>
              </div>
              {fattura.ritenuta_tipo && (
                <div className="mt-3 bg-red-50 border border-red-100 rounded-lg p-3 text-sm text-red-700">
                  Importo ritenuta calcolato: <strong>{fmtEuro(fattura.ritenuta_importo)}</strong>
                  <span className="text-xs ml-2">(su righe marcate "Rit." o su tutto l'imponibile)</span>
                </div>
              )}
            </section>

            {/* Cassa previdenziale */}
            <section className="bg-white rounded-xl border p-6">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                <Stamp className="w-4 h-4 text-amber-500" /> Cassa previdenziale
              </h2>
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-2">
                  <label className={labelClass}>Tipo cassa</label>
                  <select value={fattura.cassa_tipo || ''} disabled={!isEditable}
                    onChange={e => updateField('cassa_tipo', e.target.value || null)} className={inputClass}>
                    <option value="">Nessuna</option>
                    <option value="TC02">TC02 - Dottori commercialisti</option>
                    <option value="TC07">TC07 - ENASARCO</option>
                    <option value="TC22">TC22 - INPS gestione separata</option>
                    <option value="TC01">TC01 - Avvocati</option>
                    <option value="TC04">TC04 - Ingegneri e architetti</option>
                    <option value="TC03">TC03 - Geometri</option>
                    <option value="TC17">TC17 - Periti industriali</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Aliquota %</label>
                  <input type="number" value={fattura.cassa_aliquota || ''} disabled={!isEditable}
                    onChange={e => updateField('cassa_aliquota', parseFloat(e.target.value) || null)}
                    className={inputClass} step="0.01" />
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={fattura.cassa_ritenuta} disabled={!isEditable}
                      onChange={e => updateField('cassa_ritenuta', e.target.checked)}
                      className="w-4 h-4 rounded" />
                    Soggetta a ritenuta
                  </label>
                </div>
              </div>
            </section>

            {/* Esigibilità IVA + Bollo */}
            <section className="bg-white rounded-xl border p-6">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-500" /> IVA e Bollo
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Esigibilità IVA</label>
                  <select value={fattura.esigibilita_iva} disabled={!isEditable}
                    onChange={e => updateField('esigibilita_iva', e.target.value)} className={inputClass}>
                    {ESIGIBILITA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Bollo virtuale</label>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-3 py-1.5 rounded-lg text-sm ${fattura.bollo_virtuale ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                      {fattura.bollo_virtuale ? `SI · ${fmtEuro(fattura.bollo_importo)}` : 'Non applicato'}
                    </span>
                    <span className="text-xs text-gray-400">(calcolato automaticamente)</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB PAGAMENTO */}
        {activeTab === 'pagamento' && (
          <section className="bg-white rounded-xl border p-6 space-y-4">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-indigo-500" /> Dati pagamento
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Condizioni pagamento</label>
                <select value={fattura.condizioni_pagamento || ''} disabled={!isEditable}
                  onChange={e => updateField('condizioni_pagamento', e.target.value)} className={inputClass}>
                  {CONDIZIONI_PAG.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Modalità pagamento</label>
                <select value={fattura.modalita_pagamento || ''} disabled={!isEditable}
                  onChange={e => updateField('modalita_pagamento', e.target.value)} className={inputClass}>
                  {MODALITA_PAG.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>IBAN</label>
                <input value={fattura.iban_pagamento || ''} disabled={!isEditable}
                  onChange={e => updateField('iban_pagamento', e.target.value)} className={inputClass} maxLength={34} />
              </div>
              <div>
                <label className={labelClass}>Istituto finanziario</label>
                <input value={fattura.istituto_finanziario || ''} disabled={!isEditable}
                  onChange={e => updateField('istituto_finanziario', e.target.value)} className={inputClass} />
              </div>
            </div>
            {/* Dati tracciabilità PA */}
            <div className="border-t pt-4 mt-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Tracciabilità (per PA)</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Codice commessa</label>
                  <input value={fattura.dati_ordine_codice_commessa || ''} disabled={!isEditable}
                    onChange={e => updateField('dati_ordine_codice_commessa', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Codice CUP</label>
                  <input value={fattura.dati_ordine_codice_cup || ''} disabled={!isEditable}
                    onChange={e => updateField('dati_ordine_codice_cup', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Codice CIG</label>
                  <input value={fattura.dati_ordine_codice_cig || ''} disabled={!isEditable}
                    onChange={e => updateField('dati_ordine_codice_cig', e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* TAB TIMELINE SDI */}
        {activeTab === 'sdi' && (
          <section className="bg-white rounded-xl border p-6">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-purple-500" /> Timeline SDI
            </h2>
            {fattura.sdi_filename && (
              <div className="mb-4 bg-gray-50 rounded-lg p-3 text-sm flex items-center gap-4">
                <span className="text-gray-500">Filename SDI:</span>
                <code className="font-mono text-blue-700">{fattura.sdi_filename}</code>
                {fattura.sdi_identificativo && (
                  <>
                    <span className="text-gray-500">ID SDI:</span>
                    <code className="font-mono text-blue-700">{fattura.sdi_identificativo}</code>
                  </>
                )}
              </div>
            )}
            {fattura.notifiche.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Clock className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>Nessuna notifica SDI ancora ricevuta</p>
              </div>
            ) : (
              <div className="relative pl-8">
                <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200" />
                {fattura.notifiche.map((n, idx) => {
                  const isError = n.tipo_notifica.includes('ERRORE') || n.tipo_notifica === 'SCARTATA';
                  const isSuccess = n.tipo_notifica === 'CONSEGNATA' || n.tipo_notifica === 'ACCETTATA';
                  return (
                    <div key={n.id} className="relative mb-4">
                      <div className={`absolute -left-5 top-1 w-3 h-3 rounded-full border-2 ${
                        isError ? 'bg-red-500 border-red-300' : isSuccess ? 'bg-green-500 border-green-300' : 'bg-blue-500 border-blue-300'
                      }`} />
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-semibold ${isError ? 'text-red-700' : isSuccess ? 'text-green-700' : 'text-gray-700'}`}>
                            {n.tipo_notifica}
                          </span>
                          <span className="text-xs text-gray-400">{fmtDataOra(n.data_ricezione)}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{n.descrizione}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB XML */}
        {activeTab === 'xml' && (
          <section className="bg-white rounded-xl border">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                <Code className="w-4 h-4 text-green-600" /> Anteprima XML
              </h2>
              {fattura.xml_filename && (
                <a href={`${API}/fatture/${id}/xml`} download
                   className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                  <Download className="w-4 h-4" /> {fattura.xml_filename}
                </a>
              )}
            </div>
            <div className="p-4">
              {xmlPreview ? (
                <pre className="bg-gray-900 text-green-400 rounded-lg p-4 overflow-x-auto text-xs font-mono max-h-[600px] overflow-y-auto">
                  {xmlPreview}
                </pre>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  {fattura.xml_filename
                    ? <><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Caricamento XML...</>
                    : <><Code className="w-12 h-12 mx-auto mb-2 text-gray-300" /><p>XML non ancora generato. Clicca "Genera XML" per crearlo.</p></>
                  }
                </div>
              )}
            </div>
          </section>
        )}

        {/* Note interne */}
        <section className="bg-white rounded-xl border p-6">
          <label className={labelClass}>Note interne (non incluse in fattura)</label>
          <textarea value={fattura.note_interne || ''} disabled={!isEditable} rows={3}
            onChange={e => updateField('note_interne', e.target.value)} className={inputClass}
            placeholder="Note visibili solo internamente..." />
        </section>
      </div>
    </div>
  );
}
