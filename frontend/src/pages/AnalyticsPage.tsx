import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  BarChart2, Plus, Trash2, Download, FileText, Save,
  ChevronDown, ChevronUp, Play, X, BookOpen,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ── Tipi ─────────────────────────────────────────────────────────────────────

interface CampoInfo {
  codice: string;
  label: string;
  tipo: 'testo' | 'numero' | 'data';
  filtrabile: boolean;
}

interface FonteInfo {
  codice: string;
  label: string;
  campi: CampoInfo[];
}

interface Filtro {
  campo: string;
  operatore: string;
  valore: string;
}

interface Vista {
  id: number;
  nome: string;
  fonte: string;
  colonne: string[];
  filtri: Filtro[];
  ordina_per: string | null;
  ordine_desc: boolean;
  created_at: string;
}

interface QueryResult {
  colonne: string[];
  labels: Record<string, string>;
  righe: (string | number | null)[][];
  totale: number;
}

// ── Costanti ─────────────────────────────────────────────────────────────────

const OPERATORI_PER_TIPO: Record<string, { value: string; label: string }[]> = {
  testo: [
    { value: 'uguale',        label: 'è uguale a' },
    { value: 'diverso',       label: 'è diverso da' },
    { value: 'contiene',      label: 'contiene' },
    { value: 'non_contiene',  label: 'non contiene' },
    { value: 'inizia_con',    label: 'inizia con' },
    { value: 'finisce_con',   label: 'finisce con' },
    { value: 'vuoto',         label: 'è vuoto' },
    { value: 'non_vuoto',     label: 'non è vuoto' },
  ],
  numero: [
    { value: 'uguale',          label: '=' },
    { value: 'diverso',         label: '≠' },
    { value: 'maggiore',        label: '>' },
    { value: 'maggiore_uguale', label: '>=' },
    { value: 'minore',          label: '<' },
    { value: 'minore_uguale',   label: '<=' },
    { value: 'vuoto',           label: 'è vuoto' },
    { value: 'non_vuoto',       label: 'non è vuoto' },
  ],
  data: [
    { value: 'uguale',          label: 'è uguale a' },
    { value: 'maggiore',        label: 'dopo il' },
    { value: 'maggiore_uguale', label: 'dal' },
    { value: 'minore',          label: 'prima del' },
    { value: 'minore_uguale',   label: 'fino al' },
    { value: 'vuoto',           label: 'è vuoto' },
    { value: 'non_vuoto',       label: 'non è vuoto' },
  ],
};

const OPERATORI_SENZA_VALORE = new Set(['vuoto', 'non_vuoto']);

// ── Componenti interni ────────────────────────────────────────────────────────

function RigaFiltro({
  filtro,
  index,
  campi,
  onChange,
  onRemove,
}: {
  filtro: Filtro;
  index: number;
  campi: CampoInfo[];
  onChange: (i: number, f: Filtro) => void;
  onRemove: (i: number) => void;
}) {
  const campoInfo = campi.find(c => c.codice === filtro.campo);
  const tipoOps = campoInfo ? OPERATORI_PER_TIPO[campoInfo.tipo] ?? OPERATORI_PER_TIPO.testo : OPERATORI_PER_TIPO.testo;
  const needsValue = !OPERATORI_SENZA_VALORE.has(filtro.operatore);

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-gray-400 w-5 text-right shrink-0">{index + 1}.</span>

      {/* Campo */}
      <select
        className="border border-gray-200 rounded px-2 py-1.5 text-sm flex-1 min-w-0"
        value={filtro.campo}
        onChange={e => onChange(index, { ...filtro, campo: e.target.value, operatore: '', valore: '' })}
      >
        <option value="">— campo —</option>
        {campi.filter(c => c.filtrabile).map(c => (
          <option key={c.codice} value={c.codice}>{c.label}</option>
        ))}
      </select>

      {/* Operatore */}
      <select
        className="border border-gray-200 rounded px-2 py-1.5 text-sm w-36 shrink-0"
        value={filtro.operatore}
        onChange={e => onChange(index, { ...filtro, operatore: e.target.value, valore: '' })}
        disabled={!filtro.campo}
      >
        <option value="">— condizione —</option>
        {tipoOps.map(op => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </select>

      {/* Valore */}
      {needsValue ? (
        <input
          type={campoInfo?.tipo === 'numero' ? 'number' : campoInfo?.tipo === 'data' ? 'date' : 'text'}
          className="border border-gray-200 rounded px-2 py-1.5 text-sm flex-1 min-w-0"
          placeholder="valore..."
          value={filtro.valore}
          onChange={e => onChange(index, { ...filtro, valore: e.target.value })}
          disabled={!filtro.operatore}
        />
      ) : (
        <div className="flex-1 min-w-0" />
      )}

      <button
        onClick={() => onRemove(index)}
        className="text-gray-300 hover:text-red-500 transition-colors shrink-0 p-1"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Pagina principale ─────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [fonti, setFonti]               = useState<FonteInfo[]>([]);
  const [viste, setViste]               = useState<Vista[]>([]);
  const [fonteSelezionata, setFonte]    = useState('');
  const [colonneSelezionate, setColonne] = useState<string[]>([]);
  const [filtri, setFiltri]             = useState<Filtro[]>([]);
  const [ordinaPer, setOrdinaPer]       = useState('');
  const [ordineDesc, setOrdineDesc]     = useState(false);
  const [limite, setLimite]             = useState(500);

  const [risultato, setRisultato]       = useState<QueryResult | null>(null);
  const [loading, setLoading]           = useState(false);
  const [visteOpen, setVisteOpen]       = useState(false);
  const [nomeVista, setNomeVista]       = useState('');
  const [salvando, setSalvando]         = useState(false);

  const campiCorrente: CampoInfo[] = fonti.find(f => f.codice === fonteSelezionata)?.campi ?? [];

  // Load fonti
  useEffect(() => {
    fetch(`${API_BASE}/analytics/fonti`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(setFonti)
      .catch(() => toast.error('Impossibile caricare le fonti dati'));
  }, []);

  // Load viste
  const loadViste = useCallback(() => {
    fetch(`${API_BASE}/analytics/viste`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(setViste)
      .catch(() => {});
  }, []);

  useEffect(() => { loadViste(); }, [loadViste]);

  // Cambio fonte → reset
  const handleFonte = (codice: string) => {
    setFonte(codice);
    setColonne([]);
    setFiltri([]);
    setOrdinaPer('');
    setRisultato(null);
  };

  // Toggle colonna
  const toggleColonna = (codice: string) => {
    setColonne(prev =>
      prev.includes(codice) ? prev.filter(c => c !== codice) : [...prev, codice]
    );
  };

  // Seleziona tutto / niente
  const selezionaTutte = () => setColonne(campiCorrente.map(c => c.codice));
  const deselezionaTutte = () => setColonne([]);

  // Filtri
  const aggiungiFiltro = () =>
    setFiltri(prev => [...prev, { campo: '', operatore: '', valore: '' }]);
  const modificaFiltro = (i: number, f: Filtro) =>
    setFiltri(prev => prev.map((x, idx) => idx === i ? f : x));
  const rimuoviFiltro = (i: number) =>
    setFiltri(prev => prev.filter((_, idx) => idx !== i));

  // Esegui query
  const esegui = async () => {
    if (!fonteSelezionata) { toast.error('Seleziona una fonte dati'); return; }
    const filtriValidi = filtri.filter(f => f.campo && f.operatore);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/analytics/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          fonte: fonteSelezionata,
          colonne: colonneSelezionate,
          filtri: filtriValidi,
          ordina_per: ordinaPer || null,
          ordine_desc: ordineDesc,
          limite,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Errore query');
      }
      const data: QueryResult = await res.json();
      setRisultato(data);
    } catch (e: any) {
      toast.error(e.message || 'Errore durante la query');
    } finally {
      setLoading(false);
    }
  };

  // Export
  const esportaExcel = async () => {
    if (!risultato) return;
    const filtriValidi = filtri.filter(f => f.campo && f.operatore);
    const res = await fetch(`${API_BASE}/analytics/export-excel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({
        fonte: fonteSelezionata,
        colonne: colonneSelezionate,
        filtri: filtriValidi,
        ordina_per: ordinaPer || null,
        ordine_desc: ordineDesc,
        limite,
      }),
    });
    if (!res.ok) { toast.error('Errore esportazione Excel'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analisi_${fonteSelezionata}_${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const esportaPdf = async () => {
    if (!risultato) return;
    const filtriValidi = filtri.filter(f => f.campo && f.operatore);
    const res = await fetch(`${API_BASE}/analytics/export-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({
        fonte: fonteSelezionata,
        colonne: colonneSelezionate,
        filtri: filtriValidi,
        ordina_per: ordinaPer || null,
        ordine_desc: ordineDesc,
        limite,
      }),
    });
    if (!res.ok) { toast.error('Errore esportazione PDF'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analisi_${fonteSelezionata}_${new Date().toISOString().slice(0,10)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Salva vista
  const salvaVista = async () => {
    if (!nomeVista.trim()) { toast.error('Inserisci un nome per la vista'); return; }
    if (!fonteSelezionata) { toast.error('Seleziona una fonte dati'); return; }
    setSalvando(true);
    try {
      const res = await fetch(`${API_BASE}/analytics/viste`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          nome: nomeVista.trim(),
          fonte: fonteSelezionata,
          colonne: colonneSelezionate,
          filtri: filtri.filter(f => f.campo && f.operatore),
          ordina_per: ordinaPer || null,
          ordine_desc: ordineDesc,
        }),
      });
      if (!res.ok) throw new Error('Errore salvataggio');
      toast.success('Vista salvata');
      setNomeVista('');
      loadViste();
    } catch {
      toast.error('Errore durante il salvataggio');
    } finally {
      setSalvando(false);
    }
  };

  // Carica vista
  const caricaVista = (v: Vista) => {
    setFonte(v.fonte);
    setColonne(v.colonne);
    setFiltri(v.filtri as Filtro[]);
    setOrdinaPer(v.ordina_per ?? '');
    setOrdineDesc(v.ordine_desc);
    setRisultato(null);
    setVisteOpen(false);
  };

  // Elimina vista
  const eliminaVista = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`${API_BASE}/analytics/viste/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    loadViste();
    toast.success('Vista eliminata');
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart2 className="h-6 w-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Analisi dati</h1>
              <p className="text-sm text-gray-500">Esplora e filtra i dati del gestionale</p>
            </div>
          </div>

          {/* Viste salvate */}
          <div className="relative">
            <button
              onClick={() => setVisteOpen(p => !p)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <BookOpen className="h-4 w-4" />
              Viste salvate
              {viste.length > 0 && (
                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {viste.length}
                </span>
              )}
              {visteOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {visteOpen && (
              <div className="absolute right-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden">
                {viste.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-400">Nessuna vista salvata</p>
                ) : (
                  <ul className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                    {viste.map(v => (
                      <li
                        key={v.id}
                        onClick={() => caricaVista(v)}
                        className="flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 cursor-pointer group"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-800">{v.nome}</p>
                          <p className="text-xs text-gray-400">
                            {fonti.find(f => f.codice === v.fonte)?.label ?? v.fonte}
                          </p>
                        </div>
                        <button
                          onClick={e => eliminaVista(v.id, e)}
                          className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Colonna sinistra: configurazione ── */}
        <div className="lg:col-span-1 space-y-4">

          {/* 1. Fonte dati */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">1. Fonte dati</h2>
            <div className="space-y-1">
              {fonti.map(f => (
                <button
                  key={f.codice}
                  onClick={() => handleFonte(f.codice)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors
                    ${fonteSelezionata === f.codice
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Colonne */}
          {fonteSelezionata && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">2. Colonne</h2>
                <div className="flex gap-2">
                  <button onClick={selezionaTutte} className="text-xs text-blue-600 hover:underline">tutte</button>
                  <span className="text-gray-300">|</span>
                  <button onClick={deselezionaTutte} className="text-xs text-blue-600 hover:underline">nessuna</button>
                </div>
              </div>
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {campiCorrente.map(c => (
                  <label key={c.codice} className="flex items-center gap-2 px-1 py-1 cursor-pointer hover:bg-gray-50 rounded">
                    <input
                      type="checkbox"
                      checked={colonneSelezionate.includes(c.codice)}
                      onChange={() => toggleColonna(c.codice)}
                      className="rounded text-blue-600"
                    />
                    <span className="text-sm text-gray-700">{c.label}</span>
                    <span className="ml-auto text-[10px] text-gray-400 capitalize">{c.tipo}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 3. Filtri */}
          {fonteSelezionata && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">3. Filtri</h2>
                <button
                  onClick={aggiungiFiltro}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Aggiungi
                </button>
              </div>

              {filtri.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">Nessun filtro — verranno restituiti tutti i dati</p>
              ) : (
                <div className="space-y-1">
                  {filtri.map((f, i) => (
                    <RigaFiltro
                      key={i}
                      filtro={f}
                      index={i}
                      campi={campiCorrente}
                      onChange={modificaFiltro}
                      onRemove={rimuoviFiltro}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. Ordinamento + Limite */}
          {fonteSelezionata && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">4. Ordinamento</h2>
              <div className="flex gap-2">
                <select
                  className="border border-gray-200 rounded px-2 py-1.5 text-sm flex-1"
                  value={ordinaPer}
                  onChange={e => setOrdinaPer(e.target.value)}
                >
                  <option value="">— nessun ordinamento —</option>
                  {campiCorrente.map(c => (
                    <option key={c.codice} value={c.codice}>{c.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => setOrdineDesc(p => !p)}
                  className={`px-2.5 py-1.5 border rounded text-xs font-medium transition-colors
                    ${ordineDesc ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-500'}`}
                >
                  {ordineDesc ? '↓ DESC' : '↑ ASC'}
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-gray-500">Massimo righe:</span>
                <select
                  className="border border-gray-200 rounded px-2 py-1 text-sm"
                  value={limite}
                  onChange={e => setLimite(Number(e.target.value))}
                >
                  <option value={100}>100</option>
                  <option value={500}>500</option>
                  <option value={1000}>1.000</option>
                  <option value={5000}>5.000</option>
                </select>
              </div>
            </div>
          )}

          {/* Bottone Esegui */}
          {fonteSelezionata && (
            <button
              onClick={esegui}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-colors"
            >
              {loading ? (
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {loading ? 'Elaborazione...' : 'Esegui query'}
            </button>
          )}

          {/* Salva vista */}
          {fonteSelezionata && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">Salva come vista</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nome vista..."
                  className="border border-gray-200 rounded px-2 py-1.5 text-sm flex-1"
                  value={nomeVista}
                  onChange={e => setNomeVista(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && salvaVista()}
                />
                <button
                  onClick={salvaVista}
                  disabled={salvando || !nomeVista.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 text-white text-sm rounded disabled:opacity-40 hover:bg-gray-900 transition-colors"
                >
                  <Save className="h-3.5 w-3.5" />
                  Salva
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Colonna destra: risultati ── */}
        <div className="lg:col-span-2">
          {!risultato && !loading && (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 h-64 flex flex-col items-center justify-center text-gray-400">
              <BarChart2 className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Seleziona una fonte e clicca <strong>Esegui query</strong></p>
            </div>
          )}

          {loading && (
            <div className="bg-white rounded-xl border border-gray-200 h-64 flex items-center justify-center">
              <span className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
            </div>
          )}

          {risultato && !loading && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Toolbar risultati */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">
                    {risultato.totale.toLocaleString('it-IT')} righe
                  </span>
                  {risultato.totale >= limite && (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      Risultato limitato a {limite.toLocaleString('it-IT')} righe
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={esportaExcel}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Excel
                  </button>
                  <button
                    onClick={esportaPdf}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    PDF
                  </button>
                </div>
              </div>

              {/* Tabella */}
              <div className="overflow-auto max-h-[calc(100vh-280px)]">
                {risultato.righe.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <p className="text-sm">Nessun dato corrisponde ai filtri applicati</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                      <tr>
                        {risultato.colonne.map(col => (
                          <th
                            key={col}
                            onClick={() => {
                              if (ordinaPer === col) {
                                setOrdineDesc(p => !p);
                              } else {
                                setOrdinaPer(col);
                                setOrdineDesc(false);
                              }
                            }}
                            className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-800 whitespace-nowrap select-none"
                          >
                            {risultato.labels[col] ?? col}
                            {ordinaPer === col && (
                              <span className="ml-1 text-blue-500">{ordineDesc ? '↓' : '↑'}</span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {risultato.righe.map((row, ri) => (
                        <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-xs truncate">
                              {cell !== null && cell !== undefined ? String(cell) : (
                                <span className="text-gray-300 italic text-xs">—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
