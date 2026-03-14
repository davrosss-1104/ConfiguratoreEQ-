/**
 * RevisioniDrawer.tsx
 * Drawer slide-over per gestione revisioni, accessibile da qualsiasi tab.
 * Posizionare in: frontend/src/components/RevisioniDrawer.tsx
 */
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GitBranch, X, Plus, Eye, RotateCcw, ArrowUpDown,
  ChevronDown, ChevronUp, Diff, Clock, Camera, Loader2,
  PlusCircle, MinusCircle, Pencil, Settings2
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? '';
const fmt = (v: number) => v?.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }) || '€ 0,00';

interface RevisioneInfo {
  id: number;
  preventivo_id: number;
  numero_revisione: number;
  motivo: string;
  created_by: string;
  created_at: string;
}

interface DiffData {
  numero_revisione: number;
  materiali_aggiunti: any[];
  materiali_rimossi: any[];
  materiali_modificati: any[];
  totali_diff: Record<string, { rev: number; corrente: number; delta: number }>;
  config_changes: { campo: string; sezione: string; rev: string; corrente: string }[];
  summary: {
    n_aggiunti: number;
    n_rimossi: number;
    n_modificati: number;
    n_config_changes: number;
    has_totali_changes: boolean;
  };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  preventivoId: number;
  revisioneCorrente: number;
  isDirty: boolean;
}

export default function RevisioniDrawer({ isOpen, onClose, preventivoId, revisioneCorrente, isDirty }: Props) {
  const queryClient = useQueryClient();
  const [motivo, setMotivo] = useState('');
  const [showMotivoInput, setShowMotivoInput] = useState(false);
  const [selectedRevId, setSelectedRevId] = useState<number | null>(null);
  const [diffData, setDiffData] = useState<DiffData | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // --- Queries ---
  const { data: revisioni = [], refetch: refetchRevisioni } = useQuery<RevisioneInfo[]>({
    queryKey: ['revisioni', preventivoId],
    queryFn: async () => {
      const r = await fetch(`${API}/preventivi/${preventivoId}/revisioni`);
      return r.ok ? r.json() : [];
    },
    enabled: isOpen && preventivoId > 0,
  });

  // --- Mutations ---
  const snapshotMutation = useMutation({
    mutationFn: async (mot: string) => {
      const res = await fetch(`${API}/preventivi/${preventivoId}/revisioni`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: mot || 'Snapshot manuale' }),
      });
      if (!res.ok) throw new Error('Errore creazione snapshot');
      return res.json();
    },
    onSuccess: () => {
      refetchRevisioni();
      queryClient.invalidateQueries({ queryKey: ['preventivo', preventivoId] });
      queryClient.invalidateQueries({ queryKey: ['dirty', preventivoId] });
      setMotivo('');
      setShowMotivoInput(false);
    },
  });

  const ripristinaMutation = useMutation({
    mutationFn: async (revId: number) => {
      const r = await fetch(`${API}/preventivi/${preventivoId}/revisioni/${revId}/ripristina`, { method: 'POST' });
      if (!r.ok) throw new Error('Errore ripristino');
      return r.json();
    },
    onSuccess: () => {
      refetchRevisioni();
      queryClient.invalidateQueries({ queryKey: ['preventivo', preventivoId] });
      queryClient.invalidateQueries({ queryKey: ['materiali', preventivoId] });
      queryClient.invalidateQueries({ queryKey: ['dirty', preventivoId] });
      setSelectedRevId(null);
      setDiffData(null);
    },
  });

  // --- Diff ---
  const loadDiff = useCallback(async (revId: number) => {
    setLoadingDiff(true);
    setDiffData(null);
    setSelectedRevId(revId);
    try {
      const r = await fetch(`${API}/preventivi/${preventivoId}/revisioni/${revId}/diff`);
      if (r.ok) setDiffData(await r.json());
    } catch { }
    setLoadingDiff(false);
  }, [preventivoId]);

  const handleCreateSnapshot = () => {
    if (showMotivoInput) {
      snapshotMutation.mutate(motivo);
    } else {
      setShowMotivoInput(true);
    }
  };

  if (!isOpen) return null;

  const totalChanges = diffData ? (
    diffData.summary.n_aggiunti + diffData.summary.n_rimossi +
    diffData.summary.n_modificati + diffData.summary.n_config_changes +
    (diffData.summary.has_totali_changes ? 1 : 0)
  ) : 0;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[480px] max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-purple-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-purple-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Revisioni</h2>
              <p className="text-xs text-gray-500">
                {revisioni.length} revisioni · Corrente: <span className="font-bold text-purple-700">#{revisioneCorrente}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pulsante crea revisione */}
        <div className="px-5 py-3 border-b bg-gray-50/50">
          {showMotivoInput ? (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Motivo revisione (opzionale)..."
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && snapshotMutation.mutate(motivo)}
                className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                autoFocus
              />
              <button
                onClick={() => snapshotMutation.mutate(motivo)}
                disabled={snapshotMutation.isPending}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {snapshotMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                Salva
              </button>
              <button
                onClick={() => { setShowMotivoInput(false); setMotivo(''); }}
                className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm"
              >
                Annulla
              </button>
            </div>
          ) : (
            <button
              onClick={handleCreateSnapshot}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Camera className="w-4 h-4" />
              Crea nuova revisione
              {isDirty && (
                <span className="ml-1 w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
              )}
            </button>
          )}
        </div>

        {/* Lista revisioni */}
        <div className="flex-1 overflow-y-auto">
          {revisioni.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <Clock className="w-10 h-10 mb-3 text-gray-300" />
              <p className="text-sm">Nessuna revisione ancora</p>
              <p className="text-xs">Crea il primo snapshot per tracciare le modifiche</p>
            </div>
          ) : (
            <div className="divide-y">
              {revisioni.map(rev => {
                const isSelected = selectedRevId === rev.id;
                const isCurrent = rev.numero_revisione === revisioneCorrente;

                return (
                  <div key={rev.id} className={`transition-colors ${isSelected ? 'bg-purple-50' : 'hover:bg-gray-50'}`}>
                    {/* Row principale */}
                    <div className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          isCurrent
                            ? 'bg-purple-600 text-white ring-2 ring-purple-300'
                            : 'bg-purple-100 text-purple-800'
                        }`}>
                          #{rev.numero_revisione}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800 truncate">
                              {rev.motivo || 'Revisione'}
                            </span>
                            {isCurrent && (
                              <span className="flex-shrink-0 text-[10px] bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded font-bold">
                                CORRENTE
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">
                            {rev.created_at ? new Date(rev.created_at).toLocaleString('it-IT', {
                              day: '2-digit', month: '2-digit', year: '2-digit',
                              hour: '2-digit', minute: '2-digit'
                            }) : ''}
                            {rev.created_by && rev.created_by !== 'admin' && <span> · {rev.created_by}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => isSelected ? (setSelectedRevId(null), setDiffData(null)) : loadDiff(rev.id)}
                          className={`p-1.5 rounded transition-colors ${
                            isSelected
                              ? 'text-purple-700 bg-purple-200 hover:bg-purple-300'
                              : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
                          }`}
                          title="Confronta con stato corrente"
                        >
                          <Diff className="w-4 h-4" />
                        </button>
                        {!isCurrent && (
                          <button
                            onClick={() => {
                              if (confirm(`Ripristinare la revisione #${rev.numero_revisione}?\nLo stato attuale verrà salvato automaticamente come nuova revisione.`))
                                ripristinaMutation.mutate(rev.id);
                            }}
                            disabled={ripristinaMutation.isPending}
                            className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors disabled:opacity-50"
                            title="Ripristina questa revisione"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Diff panel (espanso) */}
                    {isSelected && (
                      <div className="px-5 pb-4">
                        {loadingDiff ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                            <span className="ml-2 text-sm text-gray-500">Calcolo differenze...</span>
                          </div>
                        ) : diffData ? (
                          <div className="bg-white border border-purple-200 rounded-lg overflow-hidden">
                            {/* Summary bar */}
                            <div className="px-4 py-2.5 bg-purple-50 border-b border-purple-200 flex items-center gap-3 text-xs">
                              <span className="font-bold text-purple-800">
                                Diff: Rev #{diffData.numero_revisione} → Corrente
                              </span>
                              {totalChanges === 0 ? (
                                <span className="text-green-600 font-medium">Nessuna differenza</span>
                              ) : (
                                <span className="text-purple-600">{totalChanges} modifiche</span>
                              )}
                            </div>

                            {/* Totali diff */}
                            {diffData.summary.has_totali_changes && (
                              <DiffSection
                                title="Totali"
                                icon={<ArrowUpDown className="w-3.5 h-3.5" />}
                                count={Object.keys(diffData.totali_diff).length}
                                isExpanded={expandedSection === 'totali'}
                                onToggle={() => setExpandedSection(expandedSection === 'totali' ? null : 'totali')}
                              >
                                <div className="space-y-1.5">
                                  {Object.entries(diffData.totali_diff).map(([k, v]) => (
                                    <div key={k} className="flex items-center justify-between text-xs">
                                      <span className="text-gray-600">{k.replace(/_/g, ' ')}</span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-red-500 line-through">{fmt(v.rev)}</span>
                                        <span className="text-gray-400">→</span>
                                        <span className="text-green-700 font-medium">{fmt(v.corrente)}</span>
                                        <span className={`text-[10px] font-bold px-1 rounded ${v.delta >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                          {v.delta >= 0 ? '+' : ''}{fmt(v.delta)}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </DiffSection>
                            )}

                            {/* Materiali aggiunti */}
                            {diffData.summary.n_aggiunti > 0 && (
                              <DiffSection
                                title="Materiali aggiunti"
                                icon={<PlusCircle className="w-3.5 h-3.5 text-green-600" />}
                                count={diffData.summary.n_aggiunti}
                                color="green"
                                isExpanded={expandedSection === 'aggiunti'}
                                onToggle={() => setExpandedSection(expandedSection === 'aggiunti' ? null : 'aggiunti')}
                              >
                                <div className="space-y-1">
                                  {diffData.materiali_aggiunti.map((m, i) => (
                                    <div key={i} className="flex items-center justify-between text-xs">
                                      <span className="text-gray-700">
                                        <span className="font-mono text-green-700">{m.codice}</span> {m.descrizione}
                                      </span>
                                      <span className="text-gray-500">×{m.quantita}</span>
                                    </div>
                                  ))}
                                </div>
                              </DiffSection>
                            )}

                            {/* Materiali rimossi */}
                            {diffData.summary.n_rimossi > 0 && (
                              <DiffSection
                                title="Materiali rimossi"
                                icon={<MinusCircle className="w-3.5 h-3.5 text-red-600" />}
                                count={diffData.summary.n_rimossi}
                                color="red"
                                isExpanded={expandedSection === 'rimossi'}
                                onToggle={() => setExpandedSection(expandedSection === 'rimossi' ? null : 'rimossi')}
                              >
                                <div className="space-y-1">
                                  {diffData.materiali_rimossi.map((m, i) => (
                                    <div key={i} className="flex items-center justify-between text-xs">
                                      <span className="text-gray-700">
                                        <span className="font-mono text-red-700">{m.codice}</span> {m.descrizione}
                                      </span>
                                      <span className="text-gray-500">×{m.quantita}</span>
                                    </div>
                                  ))}
                                </div>
                              </DiffSection>
                            )}

                            {/* Materiali modificati */}
                            {diffData.summary.n_modificati > 0 && (
                              <DiffSection
                                title="Materiali modificati"
                                icon={<Pencil className="w-3.5 h-3.5 text-amber-600" />}
                                count={diffData.summary.n_modificati}
                                color="amber"
                                isExpanded={expandedSection === 'modificati'}
                                onToggle={() => setExpandedSection(expandedSection === 'modificati' ? null : 'modificati')}
                              >
                                <div className="space-y-2">
                                  {diffData.materiali_modificati.map((m, i) => (
                                    <div key={i}>
                                      <p className="text-xs font-medium text-gray-700">
                                        <span className="font-mono text-amber-700">{m.codice}</span> {m.descrizione}
                                      </p>
                                      {Object.entries(m.changes as Record<string, { rev: number; corrente: number }>).map(([field, v]) => (
                                        <div key={field} className="flex items-center gap-2 ml-4 text-[11px]">
                                          <span className="text-gray-400 w-24">{field}</span>
                                          <span className="text-red-500">{typeof v.rev === 'number' ? v.rev.toLocaleString('it-IT') : v.rev}</span>
                                          <span className="text-gray-300">→</span>
                                          <span className="text-green-700 font-medium">
                                            {typeof v.corrente === 'number' ? v.corrente.toLocaleString('it-IT') : v.corrente}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              </DiffSection>
                            )}

                            {/* Config changes */}
                            {diffData.summary.n_config_changes > 0 && (
                              <DiffSection
                                title="Configurazione modificata"
                                icon={<Settings2 className="w-3.5 h-3.5 text-blue-600" />}
                                count={diffData.summary.n_config_changes}
                                color="blue"
                                isExpanded={expandedSection === 'config'}
                                onToggle={() => setExpandedSection(expandedSection === 'config' ? null : 'config')}
                              >
                                <div className="space-y-1.5">
                                  {diffData.config_changes.map((c, i) => (
                                    <div key={i} className="text-xs">
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-blue-700">{c.campo}</span>
                                        <span className="text-[10px] text-gray-400">{c.sezione}</span>
                                      </div>
                                      <div className="flex items-center gap-2 ml-4">
                                        <span className="text-red-500 max-w-[150px] truncate">{c.rev}</span>
                                        <span className="text-gray-300">→</span>
                                        <span className="text-green-700 font-medium max-w-[150px] truncate">{c.corrente}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </DiffSection>
                            )}

                            {totalChanges === 0 && (
                              <div className="px-4 py-4 text-center text-xs text-gray-400">
                                Lo stato corrente è identico a questa revisione
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}


// --- Sub-component: sezione collapsabile del diff ---
function DiffSection({
  title, icon, count, color = 'purple', isExpanded, onToggle, children
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  color?: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const badgeColors: Record<string, string> = {
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="border-b border-purple-100 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 text-xs hover:bg-purple-50/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-gray-700">{title}</span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${badgeColors[color] || badgeColors.purple}`}>
            {count}
          </span>
        </div>
        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
      </button>
      {isExpanded && (
        <div className="px-4 pb-3">
          {children}
        </div>
      )}
    </div>
  );
}
