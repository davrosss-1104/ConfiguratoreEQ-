import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft, Search, RefreshCw, Upload, Loader2,
  CheckCircle2, Clock, AlertTriangle, XCircle, FileText,
  Building2, Filter, ChevronRight, BarChart3, RefreshCcw,
  Euro, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';

const API = '/api/fatturazione/passive';
const fmt = (n: number) => (n ?? 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
const fmtData = (s?: string) => s ? new Date(s).toLocaleDateString('it-IT') : '—';

// ==========================================
// CONFIG STATI
// ==========================================
const STATI_CONFIG: Record<string, { label: string; bg: string; text: string; icona: React.ReactNode }> = {
  da_verificare: { label: 'Da verificare', bg: 'bg-gray-100',    text: 'text-gray-700',    icona: <FileText    className="h-3.5 w-3.5" /> },
  verificata:    { label: 'Verificata',    bg: 'bg-blue-100',    text: 'text-blue-700',    icona: <CheckCircle2 className="h-3.5 w-3.5" /> },
  approvata:     { label: 'Approvata',     bg: 'bg-amber-100',   text: 'text-amber-700',   icona: <CheckCircle2 className="h-3.5 w-3.5" /> },
  registrata:    { label: 'Registrata',    bg: 'bg-emerald-100', text: 'text-emerald-700', icona: <CheckCircle2 className="h-3.5 w-3.5" /> },
  pagata:        { label: 'Pagata',        bg: 'bg-violet-100',  text: 'text-violet-700',  icona: <CheckCircle2 className="h-3.5 w-3.5" /> },
};

const TIPO_DOC: Record<string, string> = {
  TD01: 'Fattura', TD04: 'Nota credito', TD05: 'Nota debito',
  TD06: 'Parcella', TD16: 'Integrazione RC', TD17: 'Autofattura',
  TD20: 'Autofattura', TD24: 'Fatt. differita',
};

function StatoBadge({ stato }: { stato: string }) {
  const cfg = STATI_CONFIG[stato] ?? { label: stato, bg: 'bg-gray-100', text: 'text-gray-600', icona: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.icona} {cfg.label}
    </span>
  );
}

// ==========================================
// DIALOG IMPORT XML
// ==========================================
function ImportXmlDialog({ onClose, onImportato }: { onClose: () => void; onImportato: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [files,    setFiles]    = useState<File[]>([]);
  const [results,  setResults]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(false);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const xmlFiles = Array.from(fileList).filter(f =>
      f.name.toLowerCase().endsWith('.xml') || f.name.toLowerCase().endsWith('.p7m')
    );
    setFiles(prev => [...prev, ...xmlFiles]);
  };

  const handleImporta = async () => {
    if (!files.length) return;
    setLoading(true);
    const nuovi: any[] = [];

    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      try {
        const res = await fetch(`${API}/importa-xml`, { method: 'POST', body: fd });
        const data = await res.json();
        nuovi.push({ nome: file.name, ...data });
      } catch {
        nuovi.push({ nome: file.name, status: 'errore', messaggio: 'Errore di rete' });
      }
    }

    setResults(nuovi);
    setLoading(false);
    const importate = nuovi.filter(r => r.status === 'importata').length;
    if (importate > 0) {
      toast.success(`${importate} fatture importate`);
      onImportato();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="p-5 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Importa XML FatturaPA</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-300'
            }`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => document.getElementById('xml-input')?.click()}
          >
            <Upload className="h-8 w-8 mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">Trascina qui i file XML o <span className="text-blue-600 font-medium">sfoglia</span></p>
            <p className="text-xs text-gray-400 mt-1">Formati: .xml, .p7m</p>
            <input
              id="xml-input"
              type="file"
              accept=".xml,.p7m"
              multiple
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
          </div>

          {/* Lista file selezionati */}
          {files.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-1.5">
                  <span className="truncate text-gray-700">{f.name}</span>
                  <button
                    onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-500 ml-2 shrink-0"
                  >×</button>
                </div>
              ))}
            </div>
          )}

          {/* Risultati importazione */}
          {results.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg ${
                  r.status === 'importata' ? 'bg-emerald-50 text-emerald-700' :
                  r.status === 'duplicato' ? 'bg-amber-50 text-amber-700' :
                  'bg-red-50 text-red-700'
                }`}>
                  {r.status === 'importata'  ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> :
                   r.status === 'duplicato'  ? <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> :
                   <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                  <div>
                    <span className="font-medium">{r.nome}</span>
                    {r.fornitore && <span className="ml-1">— {r.fornitore}</span>}
                    {r.messaggio && <span className="ml-1">({r.messaggio})</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            {results.length > 0 ? 'Chiudi' : 'Annulla'}
          </button>
          {results.length === 0 && (
            <button
              onClick={handleImporta}
              disabled={!files.length || loading}
              className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Importa {files.length > 0 ? `(${files.length})` : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// PAGINA LISTA PASSIVE
// ==========================================
export default function FatturePassivePage() {
  const qc = useQueryClient();

  const [q,            setQ]            = useState('');
  const [stato,        setStato]        = useState('');
  const [anno,         setAnno]         = useState(new Date().getFullYear());
  const [daRegistrare, setDaRegistrare] = useState(false);
  const [scadute,      setScadute]      = useState(false);
  const [showImport,   setShowImport]   = useState(false);
  const [sincrLoading, setSincrLoading] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['fatture-passive', q, stato, anno, daRegistrare, scadute],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q)            params.set('q', q);
      if (stato)        params.set('stato', stato);
      if (anno)         params.set('anno', String(anno));
      if (daRegistrare) params.set('da_registrare', 'true');
      if (scadute)      params.set('scadute', 'true');
      params.set('limit', '100');
      const res = await fetch(`${API}?${params}`);
      if (!res.ok) throw new Error();
      return res.json();
    },
    staleTime: 30000,
  });

  const { data: stats } = useQuery({
    queryKey: ['fatture-passive-stats', anno],
    queryFn: async () => {
      const res = await fetch(`${API}/statistiche?anno=${anno}`);
      return res.ok ? res.json() : null;
    },
    staleTime: 60000,
  });

  const sincronizza = async () => {
    setSincrLoading(true);
    try {
      const res = await fetch(`${API}/sincronizza`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      toast.success(`Sincronizzazione: ${data.importate} nuove, ${data.duplicate} duplicate`);
      refetch();
    } catch (e: any) {
      toast.error(e.message || 'Errore sincronizzazione');
    } finally {
      setSincrLoading(false);
    }
  };

  const fatture = data?.fatture ?? [];
  const totale  = data?.totale ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ArrowDownLeft className="h-6 w-6 text-sky-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Fatture Passive</h1>
              <p className="text-sm text-gray-500">{totale} fatture ricevute</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={sincronizza}
              disabled={sincrLoading}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-sm text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {sincrLoading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RefreshCcw className="h-4 w-4" />
              }
              Sincronizza SDI
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              <Upload className="h-4 w-4" />
              Importa XML
            </button>
          </div>
        </div>
      </div>

      {/* KPI bar */}
      {stats && (
        <div className="bg-white border-b px-6 py-3">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-400" />
              <span className="text-gray-500">Totale {anno}:</span>
              <span className="font-semibold text-gray-900">{fmt(stats.totale_importo)}</span>
            </div>
            {stats.per_stato?.da_verificare?.count > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 bg-gray-400 rounded-full" />
                <span className="text-gray-500">{stats.per_stato.da_verificare.count} da verificare</span>
              </div>
            )}
            {stats.per_stato?.approvata?.count > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 bg-amber-400 rounded-full" />
                <span className="text-gray-500">{stats.per_stato.approvata.count} da registrare</span>
              </div>
            )}
            {stats.scadute > 0 && (
              <div className="flex items-center gap-1.5 text-red-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">{stats.scadute} scadute</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filtri */}
      <div className="bg-white border-b px-6 py-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Cerca fornitore, numero..."
              className="pl-9 pr-3 py-1.5 border rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={stato}
            onChange={e => setStato(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tutti gli stati</option>
            {Object.entries(STATI_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select
            value={anno}
            onChange={e => setAnno(Number(e.target.value))}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {[2026, 2025, 2024, 2023].map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={daRegistrare} onChange={e => setDaRegistrare(e.target.checked)} className="rounded" />
            Da registrare
          </label>
          <label className="flex items-center gap-1.5 text-sm text-red-600 cursor-pointer">
            <input type="checkbox" checked={scadute} onChange={e => setScadute(e.target.checked)} className="rounded" />
            Scadute
          </label>
        </div>
      </div>

      {/* Tabella */}
      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : fatture.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <ArrowDownLeft className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Nessuna fattura passiva</p>
            <p className="text-sm mt-1">Importa un XML o sincronizza con SDI</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fornitore</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">N. Fattura</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Data</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Scadenza</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Imponibile</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Totale</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stato</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {fatture.map((f: any) => {
                  const scaduta = f.scadenza_pagamento
                    && new Date(f.scadenza_pagamento) < new Date()
                    && f.stato_lavorazione !== 'pagata';

                  return (
                    <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-gray-300 shrink-0" />
                          <div>
                            <p className="font-medium text-gray-800 truncate max-w-[200px]">
                              {f.fornitore_denominazione || '—'}
                            </p>
                            {f.fornitore_partita_iva && (
                              <p className="text-xs text-gray-400">{f.fornitore_partita_iva}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs text-gray-600">
                          {f.numero_fattura_fornitore || f.numero_fattura || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500">
                          {TIPO_DOC[f.tipo_documento] || f.tipo_documento}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {fmtData(f.data_fattura_fornitore || f.data_ricezione)}
                      </td>
                      <td className={`px-4 py-3 ${scaduta ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                        {scaduta && <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />}
                        {fmtData(f.scadenza_pagamento)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {fmt(f.imponibile_totale)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {fmt(f.totale_fattura)}
                      </td>
                      <td className="px-4 py-3">
                        <StatoBadge stato={f.stato_lavorazione} />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/fatturazione/passive/${f.id}`}
                          className="text-gray-400 hover:text-blue-600"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showImport && (
        <ImportXmlDialog
          onClose={() => setShowImport(false)}
          onImportato={() => { setShowImport(false); refetch(); }}
        />
      )}
    </div>
  );
}
