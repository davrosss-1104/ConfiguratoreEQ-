/**
 * FatturazionePage.tsx - Pagina principale Fatturazione Elettronica
 *
 * Lista fatture attive/passive, creazione, invio SDI, statistiche.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText, Plus, Send, RefreshCw, Download, Search, Filter,
  CheckCircle, AlertTriangle, Clock, XCircle, Eye, Trash2,
  ChevronDown, ChevronRight, BarChart3, ArrowUpRight, ArrowDownLeft,
  Copy, FileX, Receipt, CreditCard, Settings, Zap, Loader2,
  FileCheck, Building2, Calendar, HelpCircle
} from 'lucide-react';

const API = '/api/fatturazione';

// ============================================================
// TIPI
// ============================================================

interface Fattura {
  id: number;
  direzione: string;
  tipo_documento: string;
  numero_fattura: string | null;
  anno: number;
  stato_sdi: string;
  dest_denominazione: string;
  dest_partita_iva: string;
  data_fattura: string;
  data_scadenza: string | null;
  imponibile_totale: number;
  iva_totale: number;
  totale_fattura: number;
  ritenuta_importo: number;
  ordine_id: number | null;
  preventivo_id: number | null;
  fornitore_denominazione: string | null;
  sdi_filename: string | null;
  created_at: string;
}

interface Stats {
  anno: number;
  attive: Record<string, number>;
  passive: Record<string, number>;
}

// ============================================================
// HELPERS
// ============================================================

const TIPO_DOC_LABELS: Record<string, string> = {
  TD01: 'Fattura', TD02: 'Acconto', TD04: 'Nota di credito',
  TD05: 'Nota di debito', TD06: 'Parcella', TD24: 'Fatt. differita',
};

const STATO_COLORS: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  bozza:              { bg: 'bg-gray-100',   text: 'text-gray-700',   icon: <FileText className="w-3.5 h-3.5" /> },
  generata:           { bg: 'bg-blue-100',   text: 'text-blue-700',   icon: <FileCheck className="w-3.5 h-3.5" /> },
  inviata:            { bg: 'bg-amber-100',  text: 'text-amber-700',  icon: <Send className="w-3.5 h-3.5" /> },
  consegnata:         { bg: 'bg-green-100',  text: 'text-green-700',  icon: <CheckCircle className="w-3.5 h-3.5" /> },
  accettata:          { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  scartata:           { bg: 'bg-red-100',    text: 'text-red-700',    icon: <XCircle className="w-3.5 h-3.5" /> },
  rifiutata:          { bg: 'bg-red-100',    text: 'text-red-700',    icon: <XCircle className="w-3.5 h-3.5" /> },
  errore:             { bg: 'bg-red-100',    text: 'text-red-700',    icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  mancata_consegna:   { bg: 'bg-orange-100', text: 'text-orange-700', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  decorrenza_termini: { bg: 'bg-purple-100', text: 'text-purple-700', icon: <Clock className="w-3.5 h-3.5" /> },
  ricevuta:           { bg: 'bg-sky-100',    text: 'text-sky-700',    icon: <ArrowDownLeft className="w-3.5 h-3.5" /> },
};

function StatoBadge({ stato }: { stato: string }) {
  const s = STATO_COLORS[stato] || STATO_COLORS.bozza;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      {s.icon} {stato.replace(/_/g, ' ')}
    </span>
  );
}

function fmtEuro(n: number | null | undefined): string {
  if (n == null) return '€ 0,00';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

function fmtData(d: string | null | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('it-IT');
}

// ============================================================
// COMPONENTE PRINCIPALE
// ============================================================

export default function FatturazionePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'attive' | 'passive'>('attive');
  const [search, setSearch] = useState('');
  const [statoFilter, setStatoFilter] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');
  const [page, setPage] = useState(0);
  const [showNuova, setShowNuova] = useState(false);

  const direzione = tab === 'attive' ? 'attiva' : 'passiva';

  // --- Queries ---

  const { data: fatture, isLoading, refetch } = useQuery({
    queryKey: ['fatture', direzione, search, statoFilter, tipoFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        direzione, page: String(page), size: '30',
      });
      if (search) params.set('search', search);
      if (statoFilter) params.set('stato_sdi', statoFilter);
      if (tipoFilter) params.set('tipo_documento', tipoFilter);
      const r = await fetch(`${API}/fatture?${params}`);
      return r.json();
    },
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ['fatturazione-stats'],
    queryFn: async () => { const r = await fetch(`${API}/statistiche`); return r.json(); },
  });

  // --- Mutations ---

  const inviaSDI = useMutation({
    mutationFn: async (id: number) => {
      // Prima genera XML, poi invia
      await fetch(`${API}/fatture/${id}/genera-xml`, { method: 'POST' });
      const r = await fetch(`${API}/fatture/${id}/invia-sdi`, { method: 'POST' });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fatture'] }),
  });

  const aggiornaStato = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API}/fatture/${id}/aggiorna-stato`, { method: 'POST' });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fatture'] }),
  });

  const eliminaFattura = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API}/fatture/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Errore eliminazione');
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fatture'] }),
  });

  const sincronizzaPassive = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/sincronizza-passive`, { method: 'POST' });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fatture'] }),
  });

  const aggiornaBatch = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/aggiorna-stati-batch`, { method: 'POST' });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fatture'] }),
  });

  const items: Fattura[] = fatture?.items || [];
  const total = fatture?.total || 0;

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* --- HEADER --- */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="w-7 h-7 text-blue-600" />
              Fatturazione Elettronica
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Gestione fatture attive, passive, note di credito e invio SDI
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => aggiornaBatch.mutate()}
              disabled={aggiornaBatch.isPending}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
              title="Aggiorna stati SDI"
            >
              <RefreshCw className={`w-4 h-4 ${aggiornaBatch.isPending ? 'animate-spin' : ''}`} />
              Aggiorna stati
            </button>
            <button
              onClick={() => setShowNuova(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5 text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Nuova fattura
            </button>
            <Link to="/fatturazione/guida"
              className="px-3 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4" /> Guida
            </Link>
          </div>
        </div>

        {/* --- STATISTICHE COMPATTE --- */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Fatturato" value={fmtEuro(stats.attive.totale_fatturato)}
                      icon={<BarChart3 className="w-5 h-5 text-green-600" />} />
            <StatCard label="Bozze" value={String(stats.attive.bozza || 0)}
                      icon={<FileText className="w-5 h-5 text-gray-500" />} />
            <StatCard label="Inviate" value={String((stats.attive.inviata || 0) + (stats.attive.consegnata || 0))}
                      icon={<Send className="w-5 h-5 text-amber-500" />} />
            <StatCard label="Consegnate" value={String((stats.attive.accettata || 0))}
                      icon={<CheckCircle className="w-5 h-5 text-green-500" />} />
            <StatCard label="Passive da reg." value={String(stats.passive.da_registrare || 0)}
                      icon={<ArrowDownLeft className="w-5 h-5 text-sky-500" />} />
          </div>
        )}

        {/* --- TABS --- */}
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="border-b px-4">
            <div className="flex items-center gap-6">
              <TabBtn active={tab === 'attive'} onClick={() => { setTab('attive'); setPage(0); }}
                      icon={<ArrowUpRight className="w-4 h-4" />} label="Fatture attive" />
              <TabBtn active={tab === 'passive'} onClick={() => { setTab('passive'); setPage(0); }}
                      icon={<ArrowDownLeft className="w-4 h-4" />} label="Fatture passive" />
            </div>
          </div>

          {/* --- FILTRI --- */}
          <div className="p-4 border-b bg-gray-50/50 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
                placeholder="Cerca numero, cliente, P.IVA..."
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <select value={statoFilter} onChange={e => { setStatoFilter(e.target.value); setPage(0); }}
                    className="border rounded-lg px-3 py-2 text-sm">
              <option value="">Tutti gli stati</option>
              <option value="bozza">Bozza</option>
              <option value="generata">Generata</option>
              <option value="inviata">Inviata</option>
              <option value="consegnata">Consegnata</option>
              <option value="accettata">Accettata</option>
              <option value="scartata">Scartata</option>
              <option value="errore">Errore</option>
            </select>
            <select value={tipoFilter} onChange={e => { setTipoFilter(e.target.value); setPage(0); }}
                    className="border rounded-lg px-3 py-2 text-sm">
              <option value="">Tutti i tipi</option>
              <option value="TD01">Fattura</option>
              <option value="TD02">Acconto</option>
              <option value="TD04">Nota di credito</option>
              <option value="TD06">Parcella</option>
            </select>
            {tab === 'passive' && (
              <button
                onClick={() => sincronizzaPassive.mutate()}
                disabled={sincronizzaPassive.isPending}
                className="px-3 py-2 text-sm bg-sky-50 text-sky-700 border border-sky-200 rounded-lg hover:bg-sky-100 flex items-center gap-1.5"
              >
                {sincronizzaPassive.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Sincronizza da SDI
              </button>
            )}
          </div>

          {/* --- TABELLA --- */}
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-12 text-center text-gray-400">
                <Loader2 className="w-8 h-8 mx-auto animate-spin mb-2" />
                Caricamento fatture...
              </div>
            ) : items.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <Receipt className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">Nessuna fattura trovata</p>
                <p className="text-sm mt-1">Crea una nuova fattura o modifica i filtri</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Numero</th>
                    <th className="px-4 py-3 text-left">Tipo</th>
                    <th className="px-4 py-3 text-left">{tab === 'attive' ? 'Cliente' : 'Fornitore'}</th>
                    <th className="px-4 py-3 text-left">Data</th>
                    <th className="px-4 py-3 text-right">Imponibile</th>
                    <th className="px-4 py-3 text-right">Totale</th>
                    <th className="px-4 py-3 text-center">Stato SDI</th>
                    <th className="px-4 py-3 text-center">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map(f => (
                    <tr key={f.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {f.numero_fattura || <span className="text-gray-400 italic">bozza</span>}
                        {f.ordine_id && (
                          <span className="ml-1 text-xs text-gray-400">
                            (ord. #{f.ordine_id})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          f.tipo_documento === 'TD04' ? 'bg-red-50 text-red-600'
                          : f.tipo_documento === 'TD02' ? 'bg-amber-50 text-amber-600'
                          : 'bg-blue-50 text-blue-600'
                        }`}>
                          {TIPO_DOC_LABELS[f.tipo_documento] || f.tipo_documento}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">
                          {f.dest_denominazione || f.fornitore_denominazione || '-'}
                        </div>
                        <div className="text-xs text-gray-400">
                          {f.dest_partita_iva || ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{fmtData(f.data_fattura)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{fmtEuro(f.imponibile_totale)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{fmtEuro(f.totale_fattura)}</td>
                      <td className="px-4 py-3 text-center">
                        <StatoBadge stato={f.stato_sdi} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <a href={`/fatturazione/${f.id}`}
                             className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"
                             title="Dettaglio">
                            <Eye className="w-4 h-4" />
                          </a>
                          {f.stato_sdi === 'bozza' && (
                            <button
                              onClick={() => inviaSDI.mutate(f.id)}
                              className="p-1.5 text-gray-400 hover:text-green-600 rounded hover:bg-green-50"
                              title="Genera XML e invia SDI"
                              disabled={inviaSDI.isPending}
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          )}
                          {f.stato_sdi === 'generata' && (
                            <button
                              onClick={() => inviaSDI.mutate(f.id)}
                              className="p-1.5 text-gray-400 hover:text-green-600 rounded hover:bg-green-50"
                              title="Invia a SDI"
                              disabled={inviaSDI.isPending}
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          )}
                          {['inviata', 'mancata_consegna'].includes(f.stato_sdi) && (
                            <button
                              onClick={() => aggiornaStato.mutate(f.id)}
                              className="p-1.5 text-gray-400 hover:text-amber-600 rounded hover:bg-amber-50"
                              title="Aggiorna stato SDI"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          )}
                          {f.xml_filename && (
                            <a href={`${API}/fatture/${f.id}/xml`}
                               className="p-1.5 text-gray-400 hover:text-purple-600 rounded hover:bg-purple-50"
                               title="Scarica XML" download>
                              <Download className="w-4 h-4" />
                            </a>
                          )}
                          {['bozza', 'errore'].includes(f.stato_sdi) && (
                            <button
                              onClick={() => {
                                if (confirm('Eliminare questa fattura?'))
                                  eliminaFattura.mutate(f.id);
                              }}
                              className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                              title="Elimina"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* --- PAGINAZIONE --- */}
          {total > 30 && (
            <div className="px-4 py-3 border-t flex items-center justify-between text-sm text-gray-600">
              <span>{total} fatture totali</span>
              <div className="flex gap-2">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                        className="px-3 py-1 border rounded disabled:opacity-40">← Prec</button>
                <span className="px-3 py-1">Pag. {page + 1} / {Math.ceil(total / 30)}</span>
                <button disabled={(page + 1) * 30 >= total} onClick={() => setPage(p => p + 1)}
                        className="px-3 py-1 border rounded disabled:opacity-40">Succ →</button>
              </div>
            </div>
          )}
        </div>

        {/* --- MODAL NUOVA FATTURA --- */}
        {showNuova && (
          <NuovaFatturaModal
            onClose={() => setShowNuova(false)}
            onCreated={() => {
              setShowNuova(false);
              qc.invalidateQueries({ queryKey: ['fatture'] });
            }}
          />
        )}
      </div>
    </div>
  );
}


// ============================================================
// SUB-COMPONENTI
// ============================================================

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
      <div className="p-2 bg-gray-50 rounded-lg">{icon}</div>
      <div>
        <div className="text-lg font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
        active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {icon} {label}
    </button>
  );
}


// ============================================================
// MODAL: Nuova Fattura
// ============================================================

function NuovaFatturaModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    tipo_documento: 'TD01',
    dest_denominazione: '',
    dest_partita_iva: '',
    dest_codice_fiscale: '',
    dest_indirizzo: '',
    dest_cap: '',
    dest_comune: '',
    dest_provincia: '',
    dest_codice_destinatario: '0000000',
    data_fattura: new Date().toISOString().slice(0, 10),
    causale: '',
    righe: [{ descrizione: '', quantita: 1, prezzo_unitario: 0, aliquota_iva: 22 }] as any[],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addRiga = () => {
    setForm(f => ({
      ...f,
      righe: [...f.righe, { descrizione: '', quantita: 1, prezzo_unitario: 0, aliquota_iva: 22 }],
    }));
  };

  const updateRiga = (idx: number, field: string, value: any) => {
    setForm(f => {
      const righe = [...f.righe];
      righe[idx] = { ...righe[idx], [field]: value };
      // Ricalcola prezzo_totale
      righe[idx].prezzo_totale = (righe[idx].quantita || 0) * (righe[idx].prezzo_unitario || 0);
      return { ...f, righe };
    });
  };

  const removeRiga = (idx: number) => {
    setForm(f => ({ ...f, righe: f.righe.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        direzione: 'attiva',
        righe: form.righe.map((r, i) => ({
          ...r,
          numero_riga: i + 1,
          prezzo_totale: (r.quantita || 0) * (r.prezzo_unitario || 0),
        })),
      };
      const r = await fetch(`${API}/fatture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.detail || 'Errore creazione');
      }
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const totale = form.righe.reduce((s, r) => s + (r.quantita || 0) * (r.prezzo_unitario || 0), 0);

  const inputClass = "w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
  const labelClass = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-600" /> Nuova Fattura
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Tipo documento e data */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Tipo documento</label>
              <select value={form.tipo_documento}
                      onChange={e => setForm(f => ({ ...f, tipo_documento: e.target.value }))}
                      className={inputClass}>
                <option value="TD01">TD01 - Fattura</option>
                <option value="TD02">TD02 - Acconto/Anticipo</option>
                <option value="TD04">TD04 - Nota di credito</option>
                <option value="TD06">TD06 - Parcella</option>
                <option value="TD24">TD24 - Fattura differita</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Data fattura</label>
              <input type="date" value={form.data_fattura}
                     onChange={e => setForm(f => ({ ...f, data_fattura: e.target.value }))}
                     className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Cod. destinatario SDI</label>
              <input value={form.dest_codice_destinatario}
                     onChange={e => setForm(f => ({ ...f, dest_codice_destinatario: e.target.value }))}
                     className={inputClass} maxLength={7} />
            </div>
          </div>

          {/* Destinatario */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
              <Building2 className="w-4 h-4" /> Destinatario
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelClass}>Denominazione / Ragione sociale *</label>
                <input value={form.dest_denominazione}
                       onChange={e => setForm(f => ({ ...f, dest_denominazione: e.target.value }))}
                       className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Partita IVA</label>
                <input value={form.dest_partita_iva}
                       onChange={e => setForm(f => ({ ...f, dest_partita_iva: e.target.value }))}
                       className={inputClass} maxLength={11} />
              </div>
              <div>
                <label className={labelClass}>Codice Fiscale</label>
                <input value={form.dest_codice_fiscale}
                       onChange={e => setForm(f => ({ ...f, dest_codice_fiscale: e.target.value }))}
                       className={inputClass} maxLength={16} />
              </div>
              <div>
                <label className={labelClass}>Indirizzo</label>
                <input value={form.dest_indirizzo}
                       onChange={e => setForm(f => ({ ...f, dest_indirizzo: e.target.value }))}
                       className={inputClass} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelClass}>CAP</label>
                  <input value={form.dest_cap}
                         onChange={e => setForm(f => ({ ...f, dest_cap: e.target.value }))}
                         className={inputClass} maxLength={5} />
                </div>
                <div>
                  <label className={labelClass}>Comune</label>
                  <input value={form.dest_comune}
                         onChange={e => setForm(f => ({ ...f, dest_comune: e.target.value }))}
                         className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Prov.</label>
                  <input value={form.dest_provincia}
                         onChange={e => setForm(f => ({ ...f, dest_provincia: e.target.value }))}
                         className={inputClass} maxLength={2} />
                </div>
              </div>
            </div>
          </div>

          {/* Causale */}
          <div>
            <label className={labelClass}>Causale</label>
            <textarea value={form.causale}
                      onChange={e => setForm(f => ({ ...f, causale: e.target.value }))}
                      className={inputClass} rows={2} />
          </div>

          {/* Righe */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> Righe fattura
              </h3>
              <button onClick={addRiga}
                      className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100">
                + Aggiungi riga
              </button>
            </div>
            <div className="space-y-2">
              {form.righe.map((riga, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-gray-50 p-2 rounded-lg">
                  <div className="col-span-5">
                    {idx === 0 && <label className={labelClass}>Descrizione</label>}
                    <input value={riga.descrizione}
                           onChange={e => updateRiga(idx, 'descrizione', e.target.value)}
                           className={inputClass} placeholder="Descrizione..." />
                  </div>
                  <div className="col-span-1">
                    {idx === 0 && <label className={labelClass}>Q.tà</label>}
                    <input type="number" value={riga.quantita} step="0.01"
                           onChange={e => updateRiga(idx, 'quantita', parseFloat(e.target.value) || 0)}
                           className={inputClass} />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <label className={labelClass}>Prezzo unit.</label>}
                    <input type="number" value={riga.prezzo_unitario} step="0.01"
                           onChange={e => updateRiga(idx, 'prezzo_unitario', parseFloat(e.target.value) || 0)}
                           className={inputClass} />
                  </div>
                  <div className="col-span-1">
                    {idx === 0 && <label className={labelClass}>IVA %</label>}
                    <input type="number" value={riga.aliquota_iva}
                           onChange={e => updateRiga(idx, 'aliquota_iva', parseFloat(e.target.value) || 0)}
                           className={inputClass} />
                  </div>
                  <div className="col-span-2 text-right">
                    {idx === 0 && <label className={labelClass}>Totale</label>}
                    <div className="py-2 font-medium text-sm">
                      {fmtEuro((riga.quantita || 0) * (riga.prezzo_unitario || 0))}
                    </div>
                  </div>
                  <div className="col-span-1 text-center">
                    {form.righe.length > 1 && (
                      <button onClick={() => removeRiga(idx)}
                              className="p-1 text-red-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-right text-lg font-bold text-gray-900">
              Totale imponibile: {fmtEuro(totale)}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex justify-end gap-3 rounded-b-xl">
          <button onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm">
            Annulla
          </button>
          <button onClick={handleSave} disabled={saving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Crea fattura
          </button>
        </div>
      </div>
    </div>
  );
}
