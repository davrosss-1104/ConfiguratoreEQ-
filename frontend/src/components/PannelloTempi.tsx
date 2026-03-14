/**
 * PannelloTempi.tsx
 * 
 * Componente colonna destra del ticket — timer live + lista sessioni + stima.
 * 
 * Uso in TicketDettaglioPage.tsx:
 *   import PannelloTempi from '@/components/PannelloTempi';
 *   // Nella colonna destra, dopo PannelloEscalation:
 *   <PannelloTempi
 *     ticketId={ticket.id}
 *     assegnatoId={ticket.assegnato_a}
 *     terminale={terminale}
 *     currentUserId={currentUser?.id}
 *     isAdmin={currentUser?.is_admin}
 *   />
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Timer, Play, Square, Plus, Trash2, Edit2, Save, X,
  ChevronDown, Clock, Euro, Lock, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = '/api';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(minuti: number | null | undefined): string {
  if (minuti === null || minuti === undefined) return '—';
  if (minuti < 60) return `${minuti} min`;
  const h = Math.floor(minuti / 60);
  const m = minuti % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function fmtDatetime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

// ── Timelive counter ──────────────────────────────────────────────────────────

function LiveCounter({ inizio }: { inizio: string }) {
  const [minuti, setMinuti] = useState(0);
  useEffect(() => {
    const calc = () => {
      const ms = Date.now() - new Date(inizio).getTime();
      setMinuti(Math.floor(ms / 60000));
    };
    calc();
    const id = setInterval(calc, 15000);
    return () => clearInterval(id);
  }, [inizio]);
  return <span className="font-mono text-amber-600">{fmt(minuti)}</span>;
}

// ── form nuova sessione manuale ───────────────────────────────────────────────

function FormSessione({
  ticketId,
  userId,
  onCreata,
  onAnnulla,
}: {
  ticketId: number;
  userId?: number;
  onCreata: () => void;
  onAnnulla: () => void;
}) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const defaultDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const [data,        setData]        = useState(defaultDate);
  const [inizio,      setInizio]      = useState('');
  const [fine,        setFine]        = useState(defaultTime);
  const [note,        setNote]        = useState('');
  const [fatturabile, setFatturabile] = useState(true);
  const [saving,      setSaving]      = useState(false);

  const handleSalva = async () => {
    if (!inizio || !fine) { toast.error('Orario inizio e fine obbligatori'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/tickets/${ticketId}/sessioni`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inizio:      `${data}T${inizio}:00`,
          fine:        `${data}T${fine}:00`,
          note:        note || undefined,
          fatturabile,
          utente_id:   userId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Errore');
      toast.success('Sessione aggiunta');
      onCreata();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  return (
    <div className="bg-gray-50 rounded-lg border p-3 space-y-2 text-sm">
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-gray-500 mb-0.5 block">Data</label>
          <input type="date" value={data} onChange={e => setData(e.target.value)}
            className="w-full border rounded px-2 py-1 text-xs" />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-500 mb-0.5 block">Inizio</label>
          <input type="time" value={inizio} onChange={e => setInizio(e.target.value)}
            className="w-full border rounded px-2 py-1 text-xs" />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-500 mb-0.5 block">Fine</label>
          <input type="time" value={fine} onChange={e => setFine(e.target.value)}
            className="w-full border rounded px-2 py-1 text-xs" />
        </div>
      </div>
      <input
        type="text"
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Note (opzionale)"
        className="w-full border rounded px-2 py-1 text-xs"
      />
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={fatturabile} onChange={e => setFatturabile(e.target.checked)}
          className="rounded" />
        <span className="text-xs text-gray-600">Fatturabile</span>
      </label>
      <div className="flex gap-2 pt-1">
        <button onClick={handleSalva} disabled={saving}
          className="flex-1 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-1">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Salva
        </button>
        <button onClick={onAnnulla}
          className="flex-1 py-1.5 border text-xs rounded hover:bg-gray-100 flex items-center justify-center gap-1">
          <X className="h-3 w-3" /> Annulla
        </button>
      </div>
    </div>
  );
}

// ── Pannello principale ───────────────────────────────────────────────────────

interface Props {
  ticketId:     number;
  assegnatoId?: number | null;
  terminale:    boolean;
  currentUserId?: number;
  isAdmin?:     boolean;
}

export default function PannelloTempi({
  ticketId,
  assegnatoId,
  terminale,
  currentUserId,
  isAdmin,
}: Props) {
  const [aperto,          setAperto]          = useState(false);
  const [dati,            setDati]            = useState<any>(null);
  const [loading,         setLoading]         = useState(false);
  const [timerLoading,    setTimerLoading]    = useState(false);
  const [showForm,        setShowForm]        = useState(false);
  const [editingId,       setEditingId]       = useState<number | null>(null);
  const [editNote,        setEditNote]        = useState('');
  const [editFatturabile, setEditFatturabile] = useState(true);
  const [stimaEdit,       setStimaEdit]       = useState(false);
  const [stimaVal,        setStimaVal]        = useState('');

  const puoOperare = isAdmin || currentUserId === assegnatoId;

  const carica = useCallback(async () => {
    if (!aperto) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/tickets/${ticketId}/sessioni`);
      if (res.ok) setDati(await res.json());
    } catch { /* silenzioso */ }
    setLoading(false);
  }, [ticketId, aperto]);

  useEffect(() => { carica(); }, [carica]);

  const sessione_aperta = dati?.sessioni?.find((s: any) => s.in_corso && s.utente_id === currentUserId);

  const handleStart = async () => {
    setTimerLoading(true);
    try {
      const res = await fetch(`${API_BASE}/tickets/${ticketId}/sessioni/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utente_id: currentUserId, fatturabile: true }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Errore');
      toast.success('Timer avviato');
      carica();
    } catch (e: any) { toast.error(e.message); }
    setTimerLoading(false);
  };

  const handleStop = async () => {
    setTimerLoading(true);
    try {
      const res = await fetch(`${API_BASE}/tickets/${ticketId}/sessioni/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utente_id: currentUserId }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Errore');
      const data = await res.json();
      toast.success(`Timer fermato — ${fmt(data.durata_minuti)}`);
      carica();
    } catch (e: any) { toast.error(e.message); }
    setTimerLoading(false);
  };

  const handleDelete = async (sid: number) => {
    if (!confirm('Eliminare questa sessione?')) return;
    try {
      await fetch(`${API_BASE}/tickets/${ticketId}/sessioni/${sid}`, { method: 'DELETE' });
      toast.success('Sessione eliminata');
      carica();
    } catch { toast.error('Errore'); }
  };

  const handleEditSave = async (sid: number) => {
    try {
      await fetch(`${API_BASE}/tickets/${ticketId}/sessioni/${sid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: editNote, fatturabile: editFatturabile }),
      });
      toast.success('Aggiornata');
      setEditingId(null);
      carica();
    } catch { toast.error('Errore'); }
  };

  const handleStimaAggiorna = async () => {
    const minuti = parseInt(stimaVal);
    if (isNaN(minuti) || minuti < 0) { toast.error('Valore non valido'); return; }
    try {
      await fetch(`${API_BASE}/tickets/${ticketId}/tempo-previsto`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minuti }),
      });
      toast.success('Stima aggiornata');
      setStimaEdit(false);
      carica();
    } catch { toast.error('Errore'); }
  };

  const totale     = dati?.totale_minuti ?? 0;
    const previsto   = dati?.tempo_previsto_minuti;
  const delta      = previsto !== null && previsto !== undefined ? totale - previsto : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => { setAperto(v => !v); }}
        className="w-full flex items-center justify-between p-4 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-blue-500" />
          <span>Tempi di lavoro</span>
          {dati && totale > 0 && (
            <span className="text-xs font-normal text-gray-500">({fmt(totale)})</span>
          )}
          {sessione_aperta && (
            <span className="flex items-center gap-1 text-xs text-amber-600 animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 inline-block" />
              In corso
            </span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${aperto ? 'rotate-180' : ''}`} />
      </button>

      {aperto && (
        <div className="border-t">
          {loading && !dati ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
            </div>
          ) : (
            <div className="p-4 space-y-3">

              {/* Stima prevista */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Stima prevista:</span>
                {stimaEdit ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min="0" value={stimaVal}
                      onChange={e => setStimaVal(e.target.value)}
                      placeholder="min"
                      className="border rounded px-2 py-0.5 w-20 text-xs"
                      onKeyDown={e => e.key === 'Enter' && handleStimaAggiorna()}
                      autoFocus
                    />
                    <button onClick={handleStimaAggiorna} className="text-green-600 hover:text-green-700"><Save className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setStimaEdit(false)} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-gray-700">{fmt(previsto)}</span>
                    {puoOperare && !terminale && (
                      <button onClick={() => { setStimaEdit(true); setStimaVal(previsto ? String(previsto) : ''); }}
                        className="text-gray-300 hover:text-gray-500">
                        <Edit2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Totali */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Totale', val: dati?.totale_minuti, color: 'text-gray-800' },
                  { label: 'Fatturab.', val: dati?.fatturabili_minuti, color: 'text-emerald-700' },
                  { label: 'Interno', val: dati?.interni_minuti, color: 'text-gray-500' },
                ].map(item => (
                  <div key={item.label} className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className={`text-sm font-bold ${item.color}`}>{fmt(item.val)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>

              {/* Delta stima vs effettivo */}
              {delta !== null && (
                <p className={`text-xs text-center font-medium ${
                  delta > 0 ? 'text-red-500' : delta < 0 ? 'text-emerald-600' : 'text-gray-500'
                }`}>
                  {delta === 0 ? '✓ In linea con la stima' :
                   delta > 0 ? `▲ ${fmt(delta)} sopra la stima` :
                               `▼ ${fmt(Math.abs(delta))} sotto la stima`}
                </p>
              )}

              {/* Timer live */}
              {puoOperare && !terminale && (
                <div className="border rounded-lg p-3 bg-gray-50">
                  {sessione_aperta ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Sessione in corso:</span>
                        <LiveCounter inizio={sessione_aperta.inizio} />
                      </div>
                      <p className="text-xs text-gray-400">Iniziata alle {fmtTime(sessione_aperta.inizio)}</p>
                      <button
                        onClick={handleStop}
                        disabled={timerLoading}
                        className="w-full flex items-center justify-center gap-2 py-1.5 bg-red-500 text-white text-xs rounded hover:bg-red-600 disabled:opacity-40"
                      >
                        {timerLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                        Stoppa timer
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleStart}
                      disabled={timerLoading}
                      className="w-full flex items-center justify-center gap-2 py-1.5 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700 disabled:opacity-40"
                    >
                      {timerLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      Avvia timer
                    </button>
                  )}
                </div>
              )}

              {/* Aggiungi sessione manuale */}
              {puoOperare && !terminale && !showForm && (
                <button
                  onClick={() => setShowForm(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 border border-dashed text-xs text-gray-400 hover:text-gray-600 hover:border-gray-400 rounded-lg transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Aggiungi sessione manuale
                </button>
              )}

              {showForm && (
                <FormSessione
                  ticketId={ticketId}
                  userId={currentUserId}
                  onCreata={() => { setShowForm(false); carica(); }}
                  onAnnulla={() => setShowForm(false)}
                />
              )}

              {/* Lista sessioni */}
              {dati?.sessioni && dati.sessioni.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sessioni</p>
                  {dati.sessioni.map((s: any) => (
                    <div key={s.id} className={`rounded-lg border p-2.5 ${s.in_corso ? 'border-amber-200 bg-amber-50' : 'bg-gray-50'}`}>
                      {editingId === s.id ? (
                        <div className="space-y-1.5">
                          <input
                            type="text" value={editNote} onChange={e => setEditNote(e.target.value)}
                            placeholder="Note" className="w-full border rounded px-2 py-1 text-xs"
                          />
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input type="checkbox" checked={editFatturabile} onChange={e => setEditFatturabile(e.target.checked)} />
                            Fatturabile
                          </label>
                          <div className="flex gap-1.5">
                            <button onClick={() => handleEditSave(s.id)}
                              className="flex-1 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">
                              Salva
                            </button>
                            <button onClick={() => setEditingId(null)}
                              className="flex-1 py-1 border text-xs rounded hover:bg-gray-100">
                              Annulla
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {s.in_corso ? (
                                <LiveCounter inizio={s.inizio} />
                              ) : (
                                <span className="text-xs font-semibold text-gray-800">{fmt(s.durata_minuti)}</span>
                              )}
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                s.fatturabile ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'
                              }`}>
                                {s.fatturabile ? 'Fatturabile' : 'Interno'}
                              </span>
                            </div>
                            {puoOperare && (
                              <div className="flex gap-1">
                                <button onClick={() => { setEditingId(s.id); setEditNote(s.note || ''); setEditFatturabile(!!s.fatturabile); }}
                                  className="text-gray-300 hover:text-gray-600 p-0.5">
                                  <Edit2 className="h-3 w-3" />
                                </button>
                                <button onClick={() => handleDelete(s.id)}
                                  className="text-gray-300 hover:text-red-500 p-0.5">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                            <span>{s.utente_nome || '—'}</span>
                            <span>·</span>
                            <span>{fmtTime(s.inizio)}{s.fine ? `–${fmtTime(s.fine)}` : ' → in corso'}</span>
                            <span>·</span>
                            <span>{new Date(s.inizio).toLocaleDateString('it-IT', {day:'2-digit',month:'2-digit'})}</span>
                          </div>
                          {s.note && <p className="text-xs text-gray-500 mt-0.5 italic">{s.note}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}
        </div>
      )}
    </div>
  );
}
