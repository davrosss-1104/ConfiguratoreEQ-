import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Play, Square, CheckCircle, Clock, AlertTriangle, Package,
  ChevronDown, ChevronRight, Plus, Trash2, Edit2, SkipForward,
  Loader2, RotateCcw, Settings, BarChart2, Layers, Wrench,
  Calendar, Timer, X, Save, RefreshCw, GripVertical,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface CentroLavoro {
  id: number; nome: string; descrizione: string | null;
  capacita_ore_giorno: number; colore: string; attivo: number;
}

interface FaseTemplate {
  id: number; nome: string; descrizione: string | null; ordine: number;
  durata_stimata_ore: number; centro_lavoro_id: number | null;
  tipo_commessa: string | null; centro_nome: string | null; centro_colore: string | null;
}

interface FaseProduzione {
  id: number; ordine_id: number; template_id: number | null; nome: string;
  ordine: number; stato: 'da_fare' | 'in_corso' | 'completata' | 'saltata';
  centro_lavoro_id: number | null; centro_nome: string | null; centro_colore: string | null;
  durata_stimata_ore: number; durata_reale_ore: number | null;
  data_inizio_prevista: string | null; data_fine_prevista: string | null;
  data_inizio_reale: string | null; data_fine_reale: string | null;
  note: string | null; minuti_registrati?: number;
}

interface Avanzamento {
  totale: number; completate: number; in_corso: number; da_fare: number;
  saltate: number; percentuale: number;
}

interface CommessaProduzione {
  id: number; numero_preventivo: string; customer_name: string;
  stato: string; data_consegna: string | null; quantita: number | null;
  avanzamento: Avanzamento; fasi?: FaseProduzione[];
}

interface WipRiga {
  id: number; ordine_id: number; articolo_id: number | null;
  codice_articolo: string; descrizione: string | null; unita_misura: string;
  quantita_necessaria: number; quantita_prelevata: number;
  stato: 'da_prelevare' | 'parziale' | 'prelevato'; note: string | null;
  giacenza_attuale: number | null;
}

interface DashboardData {
  kpi: {
    commesse_in_produzione: number; completate_30gg: number;
    fasi_in_ritardo: number; fasi_in_corso: number;
    fasi_da_iniziare_oggi: number; wip_da_prelevare: number;
  };
  commesse: CommessaProduzione[];
}

interface GanttData {
  range_inizio: string; range_fine: string; oggi: string;
  commesse: CommessaProduzione[];
}

interface TimerInfo {
  timer_aperto: { id: number; started_at: string } | null;
  totale_minuti: number; totale_ore: number;
}

// ─────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────

function fmtData(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function fmtOre(h: number | null): string {
  if (h == null) return '—';
  const hh = Math.floor(h); const mm = Math.round((h - hh) * 60);
  return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`;
}

function isInRitardo(fase: FaseProduzione, oggi: string): boolean {
  return !!(fase.data_fine_prevista && fase.data_fine_prevista < oggi
    && fase.stato !== 'completata' && fase.stato !== 'saltata');
}

const STATO_COLORE: Record<string, string> = {
  da_fare: 'bg-gray-100 text-gray-600 border-gray-300',
  in_corso: 'bg-amber-100 text-amber-700 border-amber-300',
  completata: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  saltata: 'bg-gray-200 text-gray-400 border-gray-200',
};
const STATO_LABEL: Record<string, string> = {
  da_fare: 'Da fare', in_corso: 'In corso', completata: 'Completata', saltata: 'Saltata',
};

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, color = 'blue', icon }: {
  label: string; value: number | string; color?: string; icon: React.ReactNode;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    violet: 'bg-violet-50 text-violet-700',
  };
  return (
    <div className="bg-white border rounded-xl p-4 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${colors[color] || colors.blue}`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function AvanzamentoBar({ av }: { av: Avanzamento }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">{av.completate}/{av.totale} fasi</span>
        <span className="text-xs font-bold text-gray-700">{av.percentuale}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div
          className="bg-emerald-500 h-1.5 rounded-full transition-all"
          style={{ width: `${av.percentuale}%` }}
        />
      </div>
    </div>
  );
}

// Timer live
function TimerDisplay({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(startedAt + 'Z').getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return (
    <span className="font-mono text-amber-700 font-bold tabular-nums">
      {String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// GANTT COMPONENT
// ─────────────────────────────────────────────────────────────

function GanttView({ dati, onDragEnd, onRefresh }: {
  dati: GanttData;
  onDragEnd: (faseId: number, newStart: string, newEnd: string) => Promise<void>;
  onRefresh: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Calcola range date
  const startDate = new Date(dati.range_inizio);
  const endDate   = new Date(dati.range_fine);
  const oggi      = new Date(dati.oggi);

  const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  const DAY_W = 36; // px per giorno
  const ROW_H = 40; // px per riga fase
  const LABEL_W = 280; // px colonna commessa
  const HEADER_H = 56;

  // Genera array date per header
  const dates: Date[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }

  function dateToX(d: Date): number {
    return Math.round((d.getTime() - startDate.getTime()) / 86400000) * DAY_W;
  }

  function xToDate(x: number): Date {
    const d = new Date(startDate);
    d.setDate(d.getDate() + Math.round(x / DAY_W));
    return d;
  }

  function isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  // Drag state
  const dragState = useRef<{
    faseId: number; startX: number; origStart: Date; origEnd: Date;
    durDays: number; barEl: HTMLDivElement;
  } | null>(null);

  const onMouseDownBar = useCallback((
    e: React.MouseEvent<HTMLDivElement>,
    faseId: number,
    startD: Date,
    endD: Date,
  ) => {
    e.preventDefault();
    const barEl = e.currentTarget as HTMLDivElement;
    const durDays = Math.round((endD.getTime() - startD.getTime()) / 86400000);
    dragState.current = { faseId, startX: e.clientX, origStart: startD, origEnd: endD, durDays, barEl };

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const dx = ev.clientX - dragState.current.startX;
      const daysDelta = Math.round(dx / DAY_W);
      const newStart = new Date(dragState.current.origStart);
      newStart.setDate(newStart.getDate() + daysDelta);
      const newEnd = new Date(newStart);
      newEnd.setDate(newEnd.getDate() + dragState.current.durDays);
      const newX = dateToX(newStart);
      dragState.current.barEl.style.left = `${newX}px`;
    };

    const onUp = async (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!dragState.current) return;
      const dx = ev.clientX - dragState.current.startX;
      const daysDelta = Math.round(dx / DAY_W);
      if (daysDelta !== 0) {
        const newStart = new Date(dragState.current.origStart);
        newStart.setDate(newStart.getDate() + daysDelta);
        const newEnd = new Date(newStart);
        newEnd.setDate(newEnd.getDate() + dragState.current.durDays);
        await onDragEnd(dragState.current.faseId, isoDate(newStart), isoDate(newEnd));
      }
      dragState.current = null;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [onDragEnd]);

  // Oggi marker X
  const oggiX = dateToX(oggi);

  // Calcola altezza totale
  const totalRows = dati.commesse.reduce((acc, c) => acc + (c.fasi?.length || 1), 0) + dati.commesse.length;

  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <span className="text-sm font-semibold text-gray-700">
          {fmtData(dati.range_inizio)} — {fmtData(dati.range_fine)}
        </span>
        <button onClick={onRefresh} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">
          <RefreshCw className="h-3.5 w-3.5" /> Aggiorna
        </button>
      </div>

      <div className="overflow-auto" ref={containerRef}>
        <div style={{ minWidth: LABEL_W + totalDays * DAY_W }} className="relative">

          {/* Header date */}
          <div className="flex sticky top-0 z-20 bg-white border-b" style={{ height: HEADER_H }}>
            {/* Colonna label */}
            <div className="shrink-0 border-r bg-gray-50 flex items-end px-3 pb-2" style={{ width: LABEL_W }}>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Commessa</span>
            </div>
            {/* Date */}
            <div className="relative flex-1">
              {dates.map((d, i) => {
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const isOggi = d.toISOString().slice(0,10) === dati.oggi;
                const showMonth = i === 0 || d.getDate() === 1;
                return (
                  <div
                    key={i}
                    className={`absolute top-0 flex flex-col items-center justify-end pb-1 border-r text-xs select-none
                      ${isWeekend ? 'bg-gray-50/70' : ''}
                      ${isOggi ? 'bg-blue-50' : ''}
                    `}
                    style={{ left: i * DAY_W, width: DAY_W, height: HEADER_H }}
                  >
                    {showMonth && (
                      <span className="absolute top-1 left-1 text-[10px] font-bold text-gray-400">
                        {d.toLocaleDateString('it-IT', { month: 'short' }).toUpperCase()}
                      </span>
                    )}
                    <span className={`font-medium ${isOggi ? 'text-blue-600 font-bold' : isWeekend ? 'text-gray-400' : 'text-gray-600'}`}>
                      {d.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Righe */}
          {dati.commesse.map((commessa) => {
            const fasi = commessa.fasi || [];
            return (
              <div key={commessa.id}>
                {/* Header commessa */}
                <div className="flex border-b bg-gray-50/80" style={{ height: ROW_H }}>
                  <div className="shrink-0 border-r flex items-center px-3 gap-2" style={{ width: LABEL_W }}>
                    <span className="text-xs font-bold text-gray-800 truncate">{commessa.numero_preventivo}</span>
                    <span className="text-xs text-gray-500 truncate flex-1">{commessa.customer_name}</span>
                    <span className="text-xs font-semibold text-emerald-600 shrink-0">{commessa.avanzamento.percentuale}%</span>
                  </div>
                  <div className="relative flex-1" style={{ height: ROW_H }}>
                    {/* Barre weekend */}
                    {dates.map((d, i) => {
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      return isWeekend ? (
                        <div key={i} className="absolute top-0 bottom-0 bg-gray-100/60 border-r border-gray-200/40"
                          style={{ left: i * DAY_W, width: DAY_W }} />
                      ) : null;
                    })}
                    {/* Oggi line */}
                    {oggiX >= 0 && oggiX <= totalDays * DAY_W && (
                      <div className="absolute top-0 bottom-0 w-px bg-blue-400 z-10" style={{ left: oggiX }} />
                    )}
                  </div>
                </div>

                {/* Fasi */}
                {fasi.map((fase) => {
                  const faseStart = fase.data_inizio_prevista ? new Date(fase.data_inizio_prevista) : null;
                  const faseEnd   = fase.data_fine_prevista   ? new Date(fase.data_fine_prevista)   : null;
                  const ritardo   = isInRitardo(fase, dati.oggi);
                  const barX      = faseStart ? dateToX(faseStart) : null;
                  const barW      = (faseStart && faseEnd)
                    ? Math.max(DAY_W, Math.round((faseEnd.getTime() - faseStart.getTime()) / 86400000) * DAY_W)
                    : null;
                  const barColor  = fase.centro_colore || '#6366f1';

                  return (
                    <div key={fase.id} className="flex border-b hover:bg-gray-50/40" style={{ height: ROW_H }}>
                      {/* Label fase */}
                      <div className="shrink-0 border-r flex items-center gap-2 px-3 pl-6" style={{ width: LABEL_W }}>
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: barColor }} />
                        <span className="text-xs text-gray-600 truncate flex-1">{fase.nome}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATO_COLORE[fase.stato]}`}>
                          {STATO_LABEL[fase.stato]}
                        </span>
                      </div>

                      {/* Area Gantt */}
                      <div className="relative flex-1" style={{ height: ROW_H }}>
                        {/* Weekend stripes */}
                        {dates.map((d, i) => {
                          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                          return isWeekend ? (
                            <div key={i} className="absolute top-0 bottom-0 bg-gray-100/60 border-r border-gray-200/40"
                              style={{ left: i * DAY_W, width: DAY_W }} />
                          ) : null;
                        })}

                        {/* Oggi line */}
                        {oggiX >= 0 && oggiX <= totalDays * DAY_W && (
                          <div className="absolute top-0 bottom-0 w-px bg-blue-400 z-10" style={{ left: oggiX }} />
                        )}

                        {/* Barra fase */}
                        {barX != null && barW != null && (
                          <div
                            className={`absolute top-2 rounded cursor-grab active:cursor-grabbing select-none
                              flex items-center px-2 gap-1 overflow-hidden shadow-sm z-20
                              ${fase.stato === 'completata' ? 'opacity-70' : ''}
                              ${fase.stato === 'saltata' ? 'opacity-30' : ''}
                            `}
                            style={{
                              left: barX,
                              width: barW - 2,
                              height: ROW_H - 16,
                              backgroundColor: barColor,
                              border: ritardo ? '2px solid #ef4444' : '1px solid rgba(0,0,0,0.1)',
                            }}
                            onMouseDown={(e) => {
                              if (faseStart && faseEnd)
                                onMouseDownBar(e, fase.id, faseStart, faseEnd);
                            }}
                            title={`${fase.nome}\n${fmtData(fase.data_inizio_prevista)} → ${fmtData(fase.data_fine_prevista)}\n${fmtOre(fase.durata_stimata_ore)} stimate`}
                          >
                            <GripVertical className="h-3 w-3 text-white/60 shrink-0" />
                            <span className="text-white text-[11px] font-medium truncate">{fase.nome}</span>
                            {fase.stato === 'completata' && <CheckCircle className="h-3 w-3 text-white shrink-0 ml-auto" />}
                            {ritardo && <AlertTriangle className="h-3 w-3 text-white shrink-0 ml-auto animate-pulse" />}
                          </div>
                        )}

                        {/* Nessuna data */}
                        {barX == null && (
                          <div className="absolute inset-y-0 left-2 flex items-center">
                            <span className="text-[10px] text-gray-400 italic">date non impostate</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {dati.commesse.length === 0 && (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
              Nessuna commessa in produzione
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DETTAGLIO COMMESSA — fasi + timer + WIP
// ─────────────────────────────────────────────────────────────

function DettaglioCommessa({ commessaId, onClose }: { commessaId: number; onClose: () => void }) {
  const [fasi, setFasi] = useState<FaseProduzione[]>([]);
  const [avanzamento, setAvanzamento] = useState<Avanzamento | null>(null);
  const [wip, setWip] = useState<WipRiga[]>([]);
  const [timers, setTimers] = useState<Record<number, TimerInfo>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'fasi' | 'wip'>('fasi');
  const [editingFase, setEditingFase] = useState<number | null>(null);
  const oggi = new Date().toISOString().slice(0, 10);

  const loadFasi = useCallback(async () => {
    const r = await fetch(`${API_BASE}/produzione/commesse/${commessaId}/fasi`);
    if (r.ok) {
      const d = await r.json();
      setFasi(d.fasi || []);
      setAvanzamento(d.avanzamento);
    }
  }, [commessaId]);

  const loadWip = useCallback(async () => {
    const r = await fetch(`${API_BASE}/produzione/wip/${commessaId}`);
    if (r.ok) {
      const d = await r.json();
      setWip(d.righe || []);
    }
  }, [commessaId]);

  const loadTimer = useCallback(async (faseId: number) => {
    const r = await fetch(`${API_BASE}/produzione/fasi/${faseId}/timer`);
    if (r.ok) {
      const d = await r.json();
      setTimers(prev => ({ ...prev, [faseId]: d }));
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadFasi(), loadWip()]);
      setLoading(false);
    })();
  }, [commessaId]);

  useEffect(() => {
    fasi.forEach(f => loadTimer(f.id));
  }, [fasi]);

  async function avanzaStato(faseId: number, stato: string) {
    const r = await fetch(`${API_BASE}/produzione/fasi/${faseId}/avanza-stato`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stato }),
    });
    if (r.ok) { toast.success('Stato aggiornato'); loadFasi(); }
    else { const e = await r.json(); toast.error(e.detail || 'Errore'); }
  }

  async function startTimer(faseId: number) {
    const r = await fetch(`${API_BASE}/produzione/fasi/${faseId}/timer/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    if (r.ok) { loadTimer(faseId); }
    else { const e = await r.json(); toast.error(e.detail || 'Errore'); }
  }

  async function stopTimer(faseId: number) {
    const r = await fetch(`${API_BASE}/produzione/fasi/${faseId}/timer/stop`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    if (r.ok) {
      const d = await r.json();
      toast.success(`Timer: ${Math.round(d.minuti)} min`);
      loadTimer(faseId); loadFasi();
    } else { const e = await r.json(); toast.error(e.detail || 'Errore'); }
  }

  async function aggiornaPrelevo(wipId: number, qta: number) {
    const r = await fetch(`${API_BASE}/produzione/wip/${commessaId}/${wipId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantita_prelevata: qta }),
    });
    if (r.ok) loadWip();
    else toast.error('Errore aggiornamento prelievo');
  }

  async function creaDaTemplate() {
    const r = await fetch(`${API_BASE}/produzione/commesse/${commessaId}/crea-da-template`, { method: 'POST' });
    if (r.ok) { toast.success('Fasi create da template'); loadFasi(); }
    else { const e = await r.json(); toast.error(e.detail || 'Errore'); }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
    </div>
  );

  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-3">
          <span className="font-bold text-gray-800">Commessa #{commessaId}</span>
          {avanzamento && (
            <div className="w-32"><AvanzamentoBar av={avanzamento} /></div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-lg overflow-hidden text-xs">
            {(['fasi','wip'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 font-medium ${tab === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {t === 'fasi' ? 'Fasi produzione' : 'Materiali (WIP)'}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-200 text-gray-500">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tab Fasi */}
      {tab === 'fasi' && (
        <div className="p-4">
          {fasi.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-500 text-sm mb-3">Nessuna fase configurata per questa commessa</p>
              <button onClick={creaDaTemplate}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                Crea da template
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {fasi.map(fase => {
                const timer = timers[fase.id];
                const ritardo = isInRitardo(fase, oggi);
                return (
                  <div key={fase.id}
                    className={`border rounded-lg p-3 ${ritardo ? 'border-red-300 bg-red-50/30' : 'border-gray-200'}`}>
                    <div className="flex items-start gap-3">
                      {/* Indicatore stato */}
                      <div className="mt-0.5 w-3 h-3 rounded-full shrink-0 border-2"
                        style={{
                          backgroundColor: fase.centro_colore || '#6366f1',
                          borderColor: fase.centro_colore || '#6366f1',
                          opacity: fase.stato === 'completata' ? 0.4 : 1,
                        }} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-800 text-sm">{fase.nome}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATO_COLORE[fase.stato]}`}>
                            {STATO_LABEL[fase.stato]}
                          </span>
                          {fase.centro_nome && (
                            <span className="text-[10px] text-gray-400">{fase.centro_nome}</span>
                          )}
                          {ritardo && (
                            <span className="text-[10px] text-red-600 font-semibold flex items-center gap-0.5">
                              <AlertTriangle className="h-3 w-3" /> In ritardo
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                          <span>Prev: {fmtData(fase.data_inizio_prevista)} → {fmtData(fase.data_fine_prevista)}</span>
                          <span>Stimate: {fmtOre(fase.durata_stimata_ore)}</span>
                          {fase.durata_reale_ore != null && (
                            <span>Reali: {fmtOre(fase.durata_reale_ore)}</span>
                          )}
                          {timer && timer.totale_minuti > 0 && (
                            <span>Timer: {fmtOre(timer.totale_ore)}</span>
                          )}
                        </div>

                        {/* Timer live */}
                        {timer?.timer_aperto && (
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-xs text-amber-600">In corso:</span>
                            <TimerDisplay startedAt={timer.timer_aperto.started_at} />
                          </div>
                        )}

                        {fase.note && (
                          <p className="text-xs text-gray-500 mt-1 italic">{fase.note}</p>
                        )}
                      </div>

                      {/* Azioni */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Timer */}
                        {fase.stato === 'in_corso' && (
                          timer?.timer_aperto ? (
                            <button onClick={() => stopTimer(fase.id)}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-red-100 text-red-700 border border-red-200 rounded hover:bg-red-200">
                              <Square className="h-3 w-3" /> Stop
                            </button>
                          ) : (
                            <button onClick={() => startTimer(fase.id)}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded hover:bg-amber-200">
                              <Timer className="h-3 w-3" /> Start
                            </button>
                          )
                        )}

                        {/* Transizioni stato */}
                        {fase.stato === 'da_fare' && (
                          <button onClick={() => avanzaStato(fase.id, 'in_corso')}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600">
                            <Play className="h-3 w-3" /> Avvia
                          </button>
                        )}
                        {fase.stato === 'in_corso' && (
                          <button onClick={() => avanzaStato(fase.id, 'completata')}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700">
                            <CheckCircle className="h-3 w-3" /> Completa
                          </button>
                        )}
                        {fase.stato === 'da_fare' && (
                          <button onClick={() => avanzaStato(fase.id, 'saltata')}
                            className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                            title="Salta fase">
                            <SkipForward className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {(fase.stato === 'completata' || fase.stato === 'saltata') && (
                          <button onClick={() => avanzaStato(fase.id, 'in_corso')}
                            className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                            title="Riapri">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab WIP */}
      {tab === 'wip' && (
        <div className="p-4">
          {wip.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-500 text-sm mb-3">Nessun materiale registrato</p>
              <button
                onClick={async () => {
                  const r = await fetch(`${API_BASE}/produzione/wip/${commessaId}/popola`, { method: 'POST' });
                  if (r.ok) { const d = await r.json(); toast.success(`${d.inseriti} materiali importati dalla BOM`); loadWip(); }
                  else toast.error('Errore');
                }}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                Importa da BOM
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500">
                    <th className="text-left py-2 pr-4 font-medium">Codice</th>
                    <th className="text-left py-2 pr-4 font-medium">Descrizione</th>
                    <th className="text-right py-2 pr-4 font-medium">Necessaria</th>
                    <th className="text-right py-2 pr-4 font-medium">Prelevata</th>
                    <th className="text-right py-2 pr-4 font-medium">Giacenza</th>
                    <th className="text-left py-2 font-medium">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {wip.map(w => (
                    <tr key={w.id} className={`border-b hover:bg-gray-50 ${w.stato === 'prelevato' ? 'opacity-50' : ''}`}>
                      <td className="py-2 pr-4 font-mono text-xs">{w.codice_articolo}</td>
                      <td className="py-2 pr-4 text-gray-700 max-w-xs truncate">{w.descrizione || '—'}</td>
                      <td className="py-2 pr-4 text-right">{w.quantita_necessaria} {w.unita_misura}</td>
                      <td className="py-2 pr-4 text-right">
                        <input
                          type="number" min={0} step={0.01}
                          defaultValue={w.quantita_prelevata}
                          disabled={w.stato === 'prelevato'}
                          className="w-20 text-right border rounded px-1 py-0.5 text-xs disabled:bg-gray-50 disabled:text-gray-400"
                          onBlur={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) && v !== w.quantita_prelevata)
                              aggiornaPrelevo(w.id, v);
                          }}
                        />
                      </td>
                      <td className={`py-2 pr-4 text-right text-xs ${(w.giacenza_attuale ?? 0) < w.quantita_necessaria ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                        {w.giacenza_attuale ?? '—'}
                      </td>
                      <td className="py-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                          w.stato === 'prelevato' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          w.stato === 'parziale'  ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-gray-100 text-gray-500 border-gray-200'
                        }`}>
                          {w.stato === 'prelevato' ? 'Prelevato' : w.stato === 'parziale' ? 'Parziale' : 'Da prelevare'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGINA CONFIG (centri + template)
// ─────────────────────────────────────────────────────────────

function ConfigProduzione() {
  const [centri, setCentri] = useState<CentroLavoro[]>([]);
  const [template, setTemplate] = useState<FaseTemplate[]>([]);
  const [subTab, setSubTab] = useState<'centri' | 'template'>('centri');
  const [editCentro, setEditCentro] = useState<Partial<CentroLavoro> | null>(null);
  const [editTemplate, setEditTemplate] = useState<Partial<FaseTemplate> | null>(null);
  const [saving, setSaving] = useState(false);

  const loadCentri = async () => {
    const r = await fetch(`${API_BASE}/produzione/centri-lavoro`);
    if (r.ok) setCentri(await r.json());
  };
  const loadTemplate = async () => {
    const r = await fetch(`${API_BASE}/produzione/template-fasi`);
    if (r.ok) setTemplate(await r.json());
  };

  useEffect(() => { loadCentri(); loadTemplate(); }, []);

  async function salvaCentro() {
    if (!editCentro) return;
    setSaving(true);
    const isNew = !editCentro.id;
    const url = isNew ? `${API_BASE}/produzione/centri-lavoro` : `${API_BASE}/produzione/centri-lavoro/${editCentro.id}`;
    const r = await fetch(url, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editCentro) });
    setSaving(false);
    if (r.ok) { toast.success('Salvato'); setEditCentro(null); loadCentri(); }
    else { const e = await r.json(); toast.error(e.detail || 'Errore'); }
  }

  async function eliminaCentro(id: number) {
    if (!confirm('Disattivare questo centro di lavoro?')) return;
    await fetch(`${API_BASE}/produzione/centri-lavoro/${id}`, { method: 'DELETE' });
    loadCentri();
  }

  async function salvaTemplate() {
    if (!editTemplate) return;
    setSaving(true);
    const isNew = !editTemplate.id;
    const url = isNew ? `${API_BASE}/produzione/template-fasi` : `${API_BASE}/produzione/template-fasi/${editTemplate.id}`;
    const r = await fetch(url, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editTemplate) });
    setSaving(false);
    if (r.ok) { toast.success('Salvato'); setEditTemplate(null); loadTemplate(); }
    else { const e = await r.json(); toast.error(e.detail || 'Errore'); }
  }

  async function eliminaTemplate(id: number) {
    if (!confirm('Disattivare questo template?')) return;
    await fetch(`${API_BASE}/produzione/template-fasi/${id}`, { method: 'DELETE' });
    loadTemplate();
  }

  return (
    <div className="space-y-4">
      <div className="flex border rounded-lg overflow-hidden w-fit text-sm">
        {(['centri','template'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`px-4 py-2 font-medium ${subTab === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {t === 'centri' ? 'Centri di lavoro' : 'Template fasi'}
          </button>
        ))}
      </div>

      {/* Centri di lavoro */}
      {subTab === 'centri' && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b">
            <span className="font-semibold text-gray-700">Centri di lavoro</span>
            <button onClick={() => setEditCentro({ nome: '', capacita_ore_giorno: 8, colore: '#6366f1' })}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Plus className="h-4 w-4" /> Nuovo
            </button>
          </div>

          {/* Form modifica */}
          {editCentro && (
            <div className="px-5 py-4 border-b bg-blue-50/40 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700">Nome *</label>
                <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={editCentro.nome || ''} onChange={e => setEditCentro(p => ({ ...p, nome: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Capacità (ore/giorno)</label>
                <input type="number" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={editCentro.capacita_ore_giorno || 8}
                  onChange={e => setEditCentro(p => ({ ...p, capacita_ore_giorno: parseFloat(e.target.value) }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Descrizione</label>
                <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={editCentro.descrizione || ''} onChange={e => setEditCentro(p => ({ ...p, descrizione: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Colore</label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" className="h-9 w-16 border rounded cursor-pointer"
                    value={editCentro.colore || '#6366f1'}
                    onChange={e => setEditCentro(p => ({ ...p, colore: e.target.value }))} />
                  <span className="text-sm text-gray-500">{editCentro.colore}</span>
                </div>
              </div>
              <div className="col-span-2 flex gap-2 justify-end">
                <button onClick={() => setEditCentro(null)} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-100">Annulla</button>
                <button onClick={salvaCentro} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Salva
                </button>
              </div>
            </div>
          )}

          <div className="divide-y">
            {centri.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: c.colore }} />
                <div className="flex-1">
                  <p className="font-medium text-sm text-gray-800">{c.nome}</p>
                  {c.descrizione && <p className="text-xs text-gray-500">{c.descrizione}</p>}
                </div>
                <span className="text-xs text-gray-500">{c.capacita_ore_giorno}h/giorno</span>
                <button onClick={() => setEditCentro(c)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-gray-100">
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => eliminaCentro(c.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Template fasi */}
      {subTab === 'template' && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b">
            <span className="font-semibold text-gray-700">Template fasi</span>
            <button onClick={() => setEditTemplate({ nome: '', ordine: template.length, durata_stimata_ore: 8 })}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Plus className="h-4 w-4" /> Nuova fase
            </button>
          </div>

          {editTemplate && (
            <div className="px-5 py-4 border-b bg-blue-50/40 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700">Nome *</label>
                <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={editTemplate.nome || ''} onChange={e => setEditTemplate(p => ({ ...p, nome: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Durata stimata (ore)</label>
                <input type="number" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={editTemplate.durata_stimata_ore || 8}
                  onChange={e => setEditTemplate(p => ({ ...p, durata_stimata_ore: parseFloat(e.target.value) }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Ordine</label>
                <input type="number" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={editTemplate.ordine ?? 0}
                  onChange={e => setEditTemplate(p => ({ ...p, ordine: parseInt(e.target.value) }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Centro di lavoro</label>
                <select className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={editTemplate.centro_lavoro_id ?? ''}
                  onChange={e => setEditTemplate(p => ({ ...p, centro_lavoro_id: e.target.value ? parseInt(e.target.value) : null }))}>
                  <option value="">— Nessuno —</option>
                  {centri.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-700">Tipo commessa (vuoto = universale)</label>
                <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="es. impianto, ricambio, ..."
                  value={editTemplate.tipo_commessa || ''}
                  onChange={e => setEditTemplate(p => ({ ...p, tipo_commessa: e.target.value || null }))} />
              </div>
              <div className="col-span-2 flex gap-2 justify-end">
                <button onClick={() => setEditTemplate(null)} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-100">Annulla</button>
                <button onClick={salvaTemplate} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Salva
                </button>
              </div>
            </div>
          )}

          <div className="divide-y">
            {template.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: t.centro_colore || '#e5e7eb' }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-800">{t.nome}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{fmtOre(t.durata_stimata_ore)}</span>
                    {t.centro_nome && <span>· {t.centro_nome}</span>}
                    {t.tipo_commessa && <span>· {t.tipo_commessa}</span>}
                  </div>
                </div>
                <span className="text-xs text-gray-400">#{t.ordine}</span>
                <button onClick={() => setEditTemplate(t)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-gray-100">
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => eliminaTemplate(t.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGINA PRINCIPALE
// ─────────────────────────────────────────────────────────────

export default function ProduzionePages() {
  const [tab, setTab] = useState<'dashboard' | 'gantt' | 'config'>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [gantt, setGantt] = useState<GanttData | null>(null);
  const [loadingDash, setLoadingDash] = useState(false);
  const [loadingGantt, setLoadingGantt] = useState(false);
  const [selectedCommessa, setSelectedCommessa] = useState<number | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoadingDash(true);
    const r = await fetch(`${API_BASE}/produzione/dashboard`);
    if (r.ok) setDashboard(await r.json());
    setLoadingDash(false);
  }, []);

  const loadGantt = useCallback(async () => {
    setLoadingGantt(true);
    // Carica anche le fasi per ogni commessa
    const r = await fetch(`${API_BASE}/produzione/gantt`);
    if (r.ok) {
      const data: GanttData = await r.json();
      // Carica fasi per ogni commessa
      const commesseConFasi = await Promise.all(
        data.commesse.map(async (c) => {
          const rf = await fetch(`${API_BASE}/produzione/commesse/${c.id}/fasi`);
          if (rf.ok) {
            const d = await rf.json();
            return { ...c, fasi: d.fasi || [] };
          }
          return { ...c, fasi: [] };
        })
      );
      setGantt({ ...data, commesse: commesseConFasi });
    }
    setLoadingGantt(false);
  }, []);

  useEffect(() => {
    if (tab === 'dashboard') loadDashboard();
    if (tab === 'gantt') loadGantt();
  }, [tab]);

  async function handleGanttDrag(faseId: number, newStart: string, newEnd: string) {
    const r = await fetch(`${API_BASE}/produzione/gantt/drag`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fase_id: faseId, data_inizio_prevista: newStart, data_fine_prevista: newEnd }),
    });
    if (r.ok) {
      toast.success('Date aggiornate');
      // Aggiorna localmente senza reload completo
      setGantt(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          commesse: prev.commesse.map(c => ({
            ...c,
            fasi: (c.fasi || []).map(f =>
              f.id === faseId ? { ...f, data_inizio_prevista: newStart, data_fine_prevista: newEnd } : f
            ),
          })),
        };
      });
    } else {
      toast.error('Errore aggiornamento date');
    }
  }

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart2 className="h-4 w-4" /> },
    { id: 'gantt',     label: 'Gantt',     icon: <Calendar  className="h-4 w-4" /> },
    { id: 'config',    label: 'Config',    icon: <Settings  className="h-4 w-4" /> },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-screen-2xl mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Produzione</h1>
            <p className="text-sm text-gray-500 mt-0.5">Avanzamento commesse, schedulazione e WIP materiali</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b mb-6">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── DASHBOARD ── */}
        {tab === 'dashboard' && (
          <div className="space-y-6">
            {loadingDash ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
            ) : dashboard ? (
              <>
                {/* KPI */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <KpiCard label="In produzione" value={dashboard.kpi.commesse_in_produzione} color="amber" icon={<Wrench className="h-5 w-5" />} />
                  <KpiCard label="Completate (30gg)" value={dashboard.kpi.completate_30gg} color="emerald" icon={<CheckCircle className="h-5 w-5" />} />
                  <KpiCard label="Fasi in ritardo" value={dashboard.kpi.fasi_in_ritardo} color={dashboard.kpi.fasi_in_ritardo > 0 ? 'red' : 'blue'} icon={<AlertTriangle className="h-5 w-5" />} />
                  <KpiCard label="Fasi in corso" value={dashboard.kpi.fasi_in_corso} color="amber" icon={<Play className="h-5 w-5" />} />
                  <KpiCard label="Fasi da oggi" value={dashboard.kpi.fasi_da_iniziare_oggi} color="blue" icon={<Clock className="h-5 w-5" />} />
                  <KpiCard label="WIP da prelevare" value={dashboard.kpi.wip_da_prelevare} color={dashboard.kpi.wip_da_prelevare > 0 ? 'violet' : 'blue'} icon={<Package className="h-5 w-5" />} />
                </div>

                {/* Lista commesse */}
                <div className="bg-white border rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b">
                    <span className="font-semibold text-gray-700">Commesse attive</span>
                    <button onClick={loadDashboard} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                      <RefreshCw className="h-3.5 w-3.5" /> Aggiorna
                    </button>
                  </div>
                  <div className="divide-y">
                    {dashboard.commesse.map(c => (
                      <div key={c.id}
                        className={`px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors ${selectedCommessa === c.id ? 'bg-blue-50/40' : ''}`}
                        onClick={() => setSelectedCommessa(selectedCommessa === c.id ? null : c.id)}>
                        <div className="flex items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-gray-800">{c.numero_preventivo}</span>
                              <span className="text-sm text-gray-500 truncate">{c.customer_name}</span>
                            </div>
                            {c.data_consegna && (
                              <p className="text-xs text-gray-400 mt-0.5">Consegna: {fmtData(c.data_consegna)}</p>
                            )}
                          </div>
                          <div className="w-48 shrink-0">
                            <AvanzamentoBar av={c.avanzamento} />
                          </div>
                          <div className="flex items-center gap-1">
                            {c.avanzamento.in_corso > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded">
                                {c.avanzamento.in_corso} in corso
                              </span>
                            )}
                          </div>
                          {selectedCommessa === c.id
                            ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                            : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
                        </div>
                      </div>
                    ))}
                    {dashboard.commesse.length === 0 && (
                      <div className="px-5 py-10 text-center text-gray-400 text-sm">
                        Nessuna commessa in produzione
                      </div>
                    )}
                  </div>
                </div>

                {/* Dettaglio commessa espansa */}
                {selectedCommessa != null && (
                  <DettaglioCommessa
                    commessaId={selectedCommessa}
                    onClose={() => setSelectedCommessa(null)}
                  />
                )}
              </>
            ) : null}
          </div>
        )}

        {/* ── GANTT ── */}
        {tab === 'gantt' && (
          <div className="space-y-4">
            {loadingGantt ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
            ) : gantt ? (
              <>
                <GanttView dati={gantt} onDragEnd={handleGanttDrag} onRefresh={loadGantt} />
                <p className="text-xs text-gray-400 text-center">
                  Trascina le barre per spostare le date previste delle fasi. Le date reali non vengono modificate.
                </p>
              </>
            ) : null}
          </div>
        )}

        {/* ── CONFIG ── */}
        {tab === 'config' && <ConfigProduzione />}
      </div>
    </div>
  );
}
