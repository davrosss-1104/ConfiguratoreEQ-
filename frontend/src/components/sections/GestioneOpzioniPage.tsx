import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, Trash2, X, GripVertical, Settings, Edit2, Check,
  AlertCircle, Search, LayoutGrid, List, Zap, AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const API_BASE = 'http://localhost:8000';

// ==========================================
// INTERFACES
// ==========================================
interface Opzione {
  id: number;
  gruppo: string;
  valore: string;
  etichetta: string;
  ordine: number;
  attivo: boolean;
  descrizione?: string;
}

interface GruppoInfo {
  gruppo: string;
  totale: number;
  attive: number;
}

interface SezioneDB {
  codice: string;
  etichetta: string;
}

interface AffectedRule {
  rule_id: string;
  rule_name: string;
  enabled: boolean;
  field: string;
  value: string;
}

type SortMode = 'default' | 'alpha' | 'count';
type ViewMode = 'list' | 'grouped';

// ==========================================
// LOCALSTORAGE HELPERS
// ==========================================
const PREF_KEY = 'opzioni_suppress_rule_warning';
const isWarningSuppressed = (): boolean => {
  try { return localStorage.getItem(PREF_KEY) === 'true'; } catch { return false; }
};
const setWarningSuppressed = (v: boolean) => {
  try { localStorage.setItem(PREF_KEY, v ? 'true' : 'false'); } catch {}
};
const loadCustomMap = (): Record<string, string> => {
  try { const s = localStorage.getItem('gruppi_sezione_custom'); return s ? JSON.parse(s) : {}; } catch { return {}; }
};
const saveCustomMap = (d: Record<string, string>) => {
  try { localStorage.setItem('gruppi_sezione_custom', JSON.stringify(d)); } catch {}
};
const loadCustomLabels = (): Record<string, string> => {
  try { const s = localStorage.getItem('gruppi_labels_custom'); return s ? JSON.parse(s) : {}; } catch { return {}; }
};
const saveCustomLabels = (d: Record<string, string>) => {
  try { localStorage.setItem('gruppi_labels_custom', JSON.stringify(d)); } catch {}
};

// ==========================================
// COMPONENT
// ==========================================
export default function GestioneOpzioniPage() {
  const { toast } = useToast();

  // Core
  const [gruppi, setGruppi] = useState<GruppoInfo[]>([]);
  const [selectedGruppo, setSelectedGruppo] = useState<string | null>(null);
  const [opzioni, setOpzioni] = useState<Opzione[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Opzione>>({});
  const [originalValore, setOriginalValore] = useState('');
  const [newOpzione, setNewOpzione] = useState<Partial<Opzione> | null>(null);

  // UI
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [showNewGruppo, setShowNewGruppo] = useState(false);
  const [newGruppo, setNewGruppo] = useState({ codice: '', etichetta: '', sezione: '' });

  // Dynamic sections
  const [sezioniDB, setSezioniDB] = useState<SezioneDB[]>([]);
  const [gruppiSezioneMap, setGruppiSezioneMap] = useState<Record<string, { sezione_codice: string; sezione_etichetta: string }>>({});
  const [customSezMap, setCustomSezMap] = useState<Record<string, string>>(loadCustomMap);

  // Custom gruppo labels
  const [customLabels, setCustomLabels] = useState<Record<string, string>>(loadCustomLabels);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  // Rule warning modal
  const [ruleWarn, setRuleWarn] = useState<{
    show: boolean; rules: AffectedRule[]; oldVal: string; newVal: string; saving: boolean; dontAsk: boolean;
  }>({ show: false, rules: [], oldVal: '', newVal: '', saving: false, dontAsk: false });

  // ══════════════════════════════════
  // LOAD
  // ══════════════════════════════════
  useEffect(() => { fetchGruppi(); fetchDynamic(); }, []);
  useEffect(() => { if (selectedGruppo) fetchOpzioni(selectedGruppo); setEditingTitle(false); }, [selectedGruppo]);

  const fetchGruppi = async () => {
    try { const r = await fetch(`${API_BASE}/opzioni-dropdown/gruppi`); setGruppi(await r.json()); setLoading(false); }
    catch { toast({ title: 'Errore', description: 'Impossibile caricare i gruppi', variant: 'destructive' }); }
  };

  const fetchOpzioni = async (g: string) => {
    try { const r = await fetch(`${API_BASE}/opzioni-dropdown/${g}?solo_attive=false`); setOpzioni(await r.json()); } catch {}
  };

  const fetchDynamic = async () => {
    try {
      const [sezRes, mapRes] = await Promise.all([
        fetch(`${API_BASE}/campi-configuratore/sezioni`),
        fetch(`${API_BASE}/opzioni-dropdown/gruppi-sezioni-map`),
      ]);
      if (sezRes.ok) setSezioniDB(await sezRes.json());
      if (mapRes.ok) setGruppiSezioneMap(await mapRes.json());
    } catch {}
  };

  // Helpers
  const getSez = useCallback((g: string): string => {
    if (customSezMap[g]) return customSezMap[g];
    if (gruppiSezioneMap[g]) return gruppiSezioneMap[g].sezione_etichetta;
    return 'Altro';
  }, [customSezMap, gruppiSezioneMap]);

  const getLabel = useCallback((g: string): string => {
    if (customLabels[g]) return customLabels[g];
    return g.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }, [customLabels]);

  const saveLabel = (codice: string, label: string) => {
    const u = { ...customLabels, [codice]: label };
    setCustomLabels(u); saveCustomLabels(u);
  };

  const sezioniList = useMemo(() => {
    const s = new Set(sezioniDB.map(x => x.etichetta));
    s.add('Altro');
    Object.values(customSezMap).forEach(v => s.add(v));
    return Array.from(s);
  }, [sezioniDB, customSezMap]);

  const saveSez = (cod: string, sez: string) => {
    const u = { ...customSezMap, [cod]: sez };
    setCustomSezMap(u); saveCustomMap(u);
  };

  // Filtered & grouped
  const filtered = useMemo(() => {
    let r = [...gruppi];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      r = r.filter(g => g.gruppo.toLowerCase().includes(q) || getLabel(g.gruppo).toLowerCase().includes(q) || getSez(g.gruppo).toLowerCase().includes(q));
    }
    if (sortMode === 'alpha') r.sort((a, b) => getLabel(a.gruppo).localeCompare(getLabel(b.gruppo)));
    else if (sortMode === 'count') r.sort((a, b) => b.totale - a.totale);
    return r;
  }, [gruppi, searchQuery, sortMode, getLabel, getSez]);

  const grouped = useMemo(() => {
    const map: Record<string, GruppoInfo[]> = {};
    filtered.forEach(g => { const s = getSez(g.gruppo); (map[s] ??= []).push(g); });
    const dbOrder = sezioniDB.map(s => s.etichetta);
    const res: { sezione: string; gruppi: GruppoInfo[] }[] = [];
    dbOrder.forEach(s => { if (map[s]) { res.push({ sezione: s, gruppi: map[s] }); delete map[s]; } });
    Object.entries(map).forEach(([s, g]) => res.push({ sezione: s, gruppi: g }));
    return res;
  }, [filtered, getSez, sezioniDB]);

  // ══════════════════════════════════
  // EDIT WITH RULE CHECK
  // ══════════════════════════════════
  const handleEdit = (o: Opzione) => { setEditingId(o.id); setEditForm({ ...o }); setOriginalValore(o.valore); };
  const handleCancelEdit = () => { setEditingId(null); setEditForm({}); setOriginalValore(''); };

  const handleSaveEdit = async () => {
    if (!editingId || !selectedGruppo) return;
    const changed = editForm.valore && editForm.valore !== originalValore;

    if (changed && !isWarningSuppressed()) {
      try {
        const r = await fetch(`${API_BASE}/regole/check-value-usage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gruppo: selectedGruppo, valore: originalValore }),
        });
        if (r.ok) {
          const d = await r.json();
          if (d.count > 0) {
            setRuleWarn({ show: true, rules: d.affected_rules, oldVal: originalValore, newVal: editForm.valore!, saving: false, dontAsk: false });
            return;
          }
        }
      } catch {}
    }
    await doSave(false);
  };

  const doSave = async (cascade: boolean) => {
    if (!editingId || !selectedGruppo) return;
    try {
      const r = await fetch(`${API_BASE}/opzioni-dropdown/${editingId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm),
      });
      if (!r.ok) throw new Error();

      if (cascade && ruleWarn.oldVal && ruleWarn.newVal) {
        try {
          const cr = await fetch(`${API_BASE}/regole/cascade-update-value`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gruppo: selectedGruppo, old_value: ruleWarn.oldVal, new_value: ruleWarn.newVal }),
          });
          if (cr.ok) { const cd = await cr.json(); if (cd.count > 0) toast({ title: `⚡ ${cd.count} regola/e aggiornata/e` }); }
        } catch { toast({ title: 'Attenzione', description: 'Opzione salvata ma errore aggiornamento regole', variant: 'destructive' }); }
      }

      toast({ title: '✅ Salvato' });
      setEditingId(null); setEditForm({}); setOriginalValore('');
      setRuleWarn({ show: false, rules: [], oldVal: '', newVal: '', saving: false, dontAsk: false });
      fetchOpzioni(selectedGruppo); fetchGruppi();
    } catch { toast({ title: 'Errore', variant: 'destructive' }); }
  };

  const onWarnCascade = async () => {
    setRuleWarn(p => ({ ...p, saving: true }));
    if (ruleWarn.dontAsk) setWarningSuppressed(true);
    await doSave(true);
  };
  const onWarnSaveOnly = async () => {
    setRuleWarn(p => ({ ...p, saving: true }));
    if (ruleWarn.dontAsk) setWarningSuppressed(true);
    await doSave(false);
  };
  const onWarnCancel = () => setRuleWarn({ show: false, rules: [], oldVal: '', newVal: '', saving: false, dontAsk: false });

  // ══════════════════════════════════
  // OTHER CRUD
  // ══════════════════════════════════
  const handleToggleAttivo = async (o: Opzione) => {
    try {
      await fetch(`${API_BASE}/opzioni-dropdown/${o.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attivo: !o.attivo }) });
      if (selectedGruppo) fetchOpzioni(selectedGruppo); fetchGruppi();
    } catch {}
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questa opzione?')) return;
    try { await fetch(`${API_BASE}/opzioni-dropdown/${id}`, { method: 'DELETE' }); toast({ title: '✅ Eliminato' }); if (selectedGruppo) fetchOpzioni(selectedGruppo); fetchGruppi(); } catch {}
  };

  const handleStartNew = (g: string) => setNewOpzione({ gruppo: g, valore: '', etichetta: '', ordine: opzioni.length, attivo: true });

  const handleSaveNew = async () => {
    if (!newOpzione?.valore || !newOpzione?.etichetta) { toast({ title: 'Errore', description: 'Compila valore ed etichetta', variant: 'destructive' }); return; }
    try {
      const r = await fetch(`${API_BASE}/opzioni-dropdown`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newOpzione) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail); }
      toast({ title: '✅ Creato' }); setNewOpzione(null); if (selectedGruppo) fetchOpzioni(selectedGruppo); fetchGruppi();
    } catch (e: any) { toast({ title: 'Errore', description: e.message, variant: 'destructive' }); }
  };

  const handleCreateGruppo = async () => {
    const cod = newGruppo.codice.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!cod) { toast({ title: 'Errore', description: 'Inserisci un codice', variant: 'destructive' }); return; }
    if (gruppi.some(g => g.gruppo === cod)) { toast({ title: 'Errore', description: 'Gruppo già esistente', variant: 'destructive' }); return; }
    try {
      const r = await fetch(`${API_BASE}/opzioni-dropdown`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gruppo: cod, valore: 'esempio', etichetta: 'Esempio (da modificare)', ordine: 0, attivo: true }) });
      if (!r.ok) throw new Error();
      if (newGruppo.sezione) saveSez(cod, newGruppo.sezione);
      toast({ title: '✅ Creato', description: `Gruppo "${newGruppo.etichetta || cod}"` });
      setShowNewGruppo(false); setNewGruppo({ codice: '', etichetta: '', sezione: '' }); fetchGruppi(); setSelectedGruppo(cod);
    } catch { toast({ title: 'Errore', variant: 'destructive' }); }
  };

  // Drag & Drop
  const handleDragStart = (e: React.DragEvent, id: number) => { setDraggedId(id); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e: React.DragEvent, id: number) => { e.preventDefault(); if (draggedId !== id) setDragOverId(id); };
  const handleDragLeave = () => setDragOverId(null);
  const handleDragEnd = () => { setDraggedId(null); setDragOverId(null); };
  const handleDrop = async (e: React.DragEvent, targetId: number) => {
    e.preventDefault(); setDragOverId(null);
    if (!draggedId || draggedId === targetId || !selectedGruppo) return;
    const di = opzioni.findIndex(o => o.id === draggedId), ti = opzioni.findIndex(o => o.id === targetId);
    if (di === -1 || ti === -1) return;
    const n = [...opzioni]; const [rm] = n.splice(di, 1); n.splice(ti, 0, rm);
    setOpzioni(n.map((o, i) => ({ ...o, ordine: i })));
    try { await fetch(`${API_BASE}/opzioni-dropdown/${selectedGruppo}/riordina`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(n.map((o, i) => ({ id: o.id, ordine: i }))) }); toast({ title: '✅ Riordinato' }); }
    catch { fetchOpzioni(selectedGruppo); }
    setDraggedId(null);
  };

  // ══════════════════════════════════
  // RENDER
  // ══════════════════════════════════
  const renderGruppoItem = (g: GruppoInfo, i: number) => (
    <div key={`${g.gruppo}-${i}`}
      className={`px-4 py-3 cursor-pointer transition-colors ${selectedGruppo === g.gruppo ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50'}`}
      onClick={() => setSelectedGruppo(g.gruppo)}>
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{getLabel(g.gruppo)}</span>
        <Badge variant="secondary" className="text-xs">{g.attive}/{g.totale}</Badge>
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{g.gruppo}</div>
    </div>
  );

  if (loading) return <div className="p-6 flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Settings className="h-6 w-6" /> Gestione Opzioni Dropdown</h1>
          <p className="text-gray-600 mt-1">Configura i valori dei menu a tendina utilizzati nei form</p>
        </div>
        {isWarningSuppressed() && (
          <Button size="sm" variant="outline" onClick={() => { setWarningSuppressed(false); toast({ title: 'Riattivato', description: 'Warning regole riattivato' }); }} className="text-xs gap-1">
            <RefreshCw className="h-3 w-3" /> Riattiva warning regole
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ═══ GRUPPI ═══ */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Gruppi</CardTitle>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => setShowNewGruppo(true)}><Plus className="h-3 w-3 mr-1" /> Nuovo</Button>
                <Button size="sm" variant={viewMode === 'grouped' ? 'secondary' : 'ghost'} className="h-7 w-7 p-0" onClick={() => setViewMode('grouped')}><LayoutGrid className="h-4 w-4" /></Button>
                <Button size="sm" variant={viewMode === 'list' ? 'secondary' : 'ghost'} className="h-7 w-7 p-0" onClick={() => setViewMode('list')}><List className="h-4 w-4" /></Button>
              </div>
            </div>

            {showNewGruppo && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg space-y-3">
                <div className="text-sm font-medium text-green-800">Nuovo Gruppo</div>
                <div>
                  <Label className="text-xs">Nome</Label>
                  <Input value={newGruppo.etichetta} onChange={(e) => { const v = e.target.value; setNewGruppo({ ...newGruppo, etichetta: v, codice: v.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') }); }} placeholder="Es: Tipo Cabina" className="h-8 text-sm" autoFocus />
                </div>
                <div>
                  <Label className="text-xs">Codice (auto)</Label>
                  <Input value={newGruppo.codice} onChange={(e) => setNewGruppo({ ...newGruppo, codice: e.target.value.toLowerCase().replace(/\s+/g, '_') })} className="h-8 text-sm font-mono" />
                </div>
                <div>
                  <Label className="text-xs">Sezione</Label>
                  <select value={newGruppo.sezione} onChange={(e) => setNewGruppo({ ...newGruppo, sezione: e.target.value })} className="w-full h-8 text-sm border rounded px-2">
                    <option value="">Seleziona...</option>
                    {sezioniList.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setShowNewGruppo(false); setNewGruppo({ codice: '', etichetta: '', sezione: '' }); }}>Annulla</Button>
                  <Button size="sm" onClick={handleCreateGruppo} disabled={!newGruppo.codice.trim()} className="bg-green-600 hover:bg-green-700"><Check className="h-4 w-4 mr-1" /> Crea</Button>
                </div>
              </div>
            )}

            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input placeholder="Cerca gruppo..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-gray-400" /></button>}
            </div>

            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-500">Ordina:</span>
              {(['default', 'alpha', 'count'] as SortMode[]).map(m => (
                <button key={m} onClick={() => setSortMode(m)} className={`text-xs px-2 py-1 rounded ${sortMode === m ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                  {m === 'default' ? 'Default' : m === 'alpha' ? 'A-Z' : '# Opzioni'}
                </button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="p-0 max-h-[60vh] overflow-y-auto">
            {viewMode === 'grouped' ? (
              <div>
                {grouped.map(({ sezione, gruppi: gs }) => (
                  <div key={sezione}>
                    <div className="px-4 py-2 bg-gray-100 text-xs font-semibold text-gray-600 uppercase tracking-wide sticky top-0">{sezione}</div>
                    <div className="divide-y">{gs.map(renderGruppoItem)}</div>
                  </div>
                ))}
                {grouped.length === 0 && <div className="p-4 text-center text-gray-500 text-sm">Nessun risultato</div>}
              </div>
            ) : (
              <div className="divide-y">{filtered.map(renderGruppoItem)}{filtered.length === 0 && <div className="p-4 text-center text-gray-500 text-sm">Nessun risultato</div>}</div>
            )}
          </CardContent>
        </Card>

        {/* ═══ OPZIONI ═══ */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              {selectedGruppo ? (
                editingTitle ? (
                  <div className="flex items-center gap-2">
                    <Input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)}
                      className="h-8 text-lg font-semibold w-64"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { saveLabel(selectedGruppo, titleDraft); setEditingTitle(false); }
                        if (e.key === 'Escape') setEditingTitle(false);
                      }} />
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { saveLabel(selectedGruppo, titleDraft); setEditingTitle(false); }}>
                      <Check className="h-4 w-4 text-green-600" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingTitle(false)}>
                      <X className="h-4 w-4 text-gray-400" />
                    </Button>
                  </div>
                ) : (
                  <CardTitle className="text-lg cursor-pointer group flex items-center gap-2"
                    onClick={() => { setEditingTitle(true); setTitleDraft(getLabel(selectedGruppo)); }}>
                    {getLabel(selectedGruppo)}
                    <Edit2 className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                  </CardTitle>
                )
              ) : (
                <CardTitle className="text-lg">Seleziona un gruppo</CardTitle>
              )}
              {selectedGruppo && <p className="text-xs text-gray-500 mt-1">Sezione: {getSez(selectedGruppo)}</p>}
            </div>
            {selectedGruppo && <Button size="sm" onClick={() => handleStartNew(selectedGruppo)} disabled={newOpzione !== null}><Plus className="h-4 w-4 mr-1" /> Aggiungi</Button>}
          </CardHeader>
          <CardContent>
            {!selectedGruppo ? (
              <div className="text-center py-12 text-gray-500"><AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>Seleziona un gruppo dalla lista</p></div>
            ) : (
              <div className="space-y-2">
                {/* New */}
                {newOpzione && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
                    <div className="text-sm font-medium text-green-800 mb-3">Nuova Opzione</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Valore (DB) <span className="text-red-500">*</span></Label>
                        <Input value={newOpzione.valore || ''} onChange={(e) => setNewOpzione({ ...newOpzione, valore: e.target.value.toLowerCase().replace(/\s+/g, '_') })} placeholder="es: verniciato" className={`h-8 text-sm ${!newOpzione.valore ? 'border-red-300' : ''}`} autoFocus />
                      </div>
                      <div>
                        <Label className="text-xs">Etichetta (UI) <span className="text-red-500">*</span></Label>
                        <Input value={newOpzione.etichetta || ''} onChange={(e) => setNewOpzione({ ...newOpzione, etichetta: e.target.value })} placeholder="es: Verniciato" className={`h-8 text-sm ${!newOpzione.etichetta ? 'border-red-300' : ''}`} />
                      </div>
                      <div>
                        <Label className="text-xs">Ordine</Label>
                        <Input type="number" value={newOpzione.ordine || 0} onChange={(e) => setNewOpzione({ ...newOpzione, ordine: parseInt(e.target.value) })} className="h-8 text-sm" />
                      </div>
                      <div className="flex items-end gap-2">
                        <Button size="sm" onClick={handleSaveNew} className="bg-green-600 hover:bg-green-700" disabled={!newOpzione.valore?.trim() || !newOpzione.etichetta?.trim()}><Check className="h-4 w-4 mr-1" /> Salva</Button>
                        <Button size="sm" variant="outline" onClick={() => setNewOpzione(null)}><X className="h-4 w-4" /></Button>
                      </div>
                    </div>
                    {(!newOpzione.valore?.trim() || !newOpzione.etichetta?.trim()) && <p className="text-xs text-red-500 mt-2">Compila valore ed etichetta</p>}
                  </div>
                )}

                {opzioni.length > 1 && <div className="text-xs text-gray-500 mb-2 flex items-center gap-1"><GripVertical className="h-3 w-3" /> Trascina per riordinare</div>}

                {/* Table */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 w-8">#</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Valore</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Etichetta</th>
                        <th className="px-3 py-2 text-center font-medium text-gray-600 w-20">Stato</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600 w-24">Azioni</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {opzioni.map((o) => (
                        <React.Fragment key={o.id}>
                          <tr draggable={editingId !== o.id} onDragStart={(e) => handleDragStart(e, o.id)} onDragOver={(e) => handleDragOver(e, o.id)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, o.id)} onDragEnd={handleDragEnd}
                            className={`${!o.attivo ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'} ${draggedId === o.id ? 'opacity-50 bg-blue-50' : ''} ${dragOverId === o.id ? 'border-t-2 border-blue-500' : ''} ${editingId === o.id ? 'bg-blue-50' : ''} cursor-move transition-all`}>
                            <td className="px-3 py-2"><GripVertical className="h-4 w-4 text-gray-400" /></td>
                            <td className="px-3 py-2"><code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{o.valore}</code></td>
                            <td className="px-3 py-2">{o.etichetta}</td>
                            <td className="px-3 py-2 text-center">
                              <button onClick={() => handleToggleAttivo(o)} className={`px-2 py-0.5 rounded text-xs font-medium ${o.attivo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}>
                                {o.attivo ? 'Attivo' : 'Inattivo'}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => editingId === o.id ? handleCancelEdit() : handleEdit(o)} className="h-7 w-7 p-0">
                                  {editingId === o.id ? <X className="h-3.5 w-3.5 text-gray-500" /> : <Edit2 className="h-3.5 w-3.5 text-gray-500" />}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDelete(o.id)} className="h-7 w-7 p-0 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </td>
                          </tr>

                          {editingId === o.id && (
                            <tr className="bg-blue-50">
                              <td colSpan={5} className="px-3 py-3">
                                <div className="grid grid-cols-3 gap-3">
                                  <div>
                                    <Label className="text-xs">Valore (DB)</Label>
                                    <Input value={editForm.valore || ''} onChange={(e) => setEditForm({ ...editForm, valore: e.target.value.toLowerCase().replace(/\s+/g, '_') })} className="h-8 text-sm font-mono" />
                                    {editForm.valore !== originalValore && (
                                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><Zap className="h-3 w-3" /> Valore modificato — verrà controllato impatto regole</p>
                                    )}
                                  </div>
                                  <div>
                                    <Label className="text-xs">Etichetta (UI)</Label>
                                    <Input value={editForm.etichetta || ''} onChange={(e) => setEditForm({ ...editForm, etichetta: e.target.value })} className="h-8 text-sm" />
                                  </div>
                                  <div className="flex items-end gap-2">
                                    <Button size="sm" onClick={handleSaveEdit} className="bg-blue-600 hover:bg-blue-700"><Check className="h-4 w-4 mr-1" /> Salva</Button>
                                    <Button size="sm" variant="outline" onClick={handleCancelEdit}>Annulla</Button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                      {opzioni.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-500">Nessuna opzione</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Info */}
      <Card className="mt-6 bg-blue-50 border-blue-200">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Come funziona</p>
              <ul className="list-disc ml-4 space-y-1 text-blue-700">
                <li><strong>Valore:</strong> codice salvato nel database (es: <code>gearless_mrl</code>)</li>
                <li><strong>Etichetta:</strong> testo mostrato nei menu (es: "Gearless MRL")</li>
                <li><strong>Riordina:</strong> trascina le righe per cambiare ordine</li>
                <li><strong>⚡ Regole:</strong> modificando un valore usato nelle regole, il sistema avvisa e può aggiornare automaticamente</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ RULE WARNING MODAL ═══ */}
      {ruleWarn.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center"><AlertTriangle className="h-5 w-5 text-amber-600" /></div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Valore usato nelle regole</h3>
                  <p className="text-sm text-gray-500">Il valore <code className="bg-gray-100 px-1 rounded">{ruleWarn.oldVal}</code> è usato in {ruleWarn.rules.length} regola/e</p>
                </div>
              </div>

              <div className="mb-4 bg-gray-50 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-gray-600 uppercase">Regole impattate:</p>
                {ruleWarn.rules.map((r) => (
                  <div key={r.rule_id} className="flex items-center gap-2 text-sm">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    <span className="font-mono text-xs">{r.rule_id}</span>
                    <span className="text-gray-400">→</span>
                    <span className="text-xs">campo <code>{r.field}</code> = <code>{r.value}</code></span>
                    {!r.enabled && <Badge variant="secondary" className="text-xs">disabilitata</Badge>}
                  </div>
                ))}
              </div>

              <div className="text-sm text-gray-700 mb-4">
                Cambio: <code className="bg-red-50 px-1 rounded text-red-700">{ruleWarn.oldVal}</code> → <code className="bg-green-50 px-1 rounded text-green-700">{ruleWarn.newVal}</code>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-500 mb-6 cursor-pointer">
                <input type="checkbox" checked={ruleWarn.dontAsk} onChange={(e) => setRuleWarn(p => ({ ...p, dontAsk: e.target.checked }))} className="rounded" />
                Non chiedermelo più
              </label>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={onWarnCancel} disabled={ruleWarn.saving}>Annulla</Button>
                <Button variant="outline" onClick={onWarnSaveOnly} disabled={ruleWarn.saving}>Salva solo opzione</Button>
                <Button onClick={onWarnCascade} disabled={ruleWarn.saving} className="bg-amber-600 hover:bg-amber-700 text-white gap-1">
                  {ruleWarn.saving ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <Zap className="h-4 w-4" />}
                  Aggiorna anche regole
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
