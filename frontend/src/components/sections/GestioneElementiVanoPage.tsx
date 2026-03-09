import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, Check, GripVertical } from 'lucide-react';

const API = (window as any).__API_BASE__ || 'http://localhost:8000';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface ElementoVano {
  id?: number;
  id_elemento: string;
  nome: string;
  emoji: string;
  colore_bg: string;
  colore_border: string;
  solo_esterno: boolean;
  solo_interno: boolean;
  ha_distanza: boolean;
  descrizione?: string;
  attivo: boolean;
  ordine: number;
}

const COLORI_BG = [
  'bg-purple-200', 'bg-yellow-200', 'bg-green-200', 'bg-blue-200',
  'bg-red-200', 'bg-gray-200', 'bg-orange-200', 'bg-pink-200',
  'bg-teal-200', 'bg-indigo-200', 'bg-cyan-200', 'bg-lime-200',
];
const COLORI_BORDER = [
  'border-purple-400', 'border-yellow-400', 'border-green-400', 'border-blue-400',
  'border-red-400', 'border-gray-400', 'border-orange-400', 'border-pink-400',
  'border-teal-400', 'border-indigo-400', 'border-cyan-400', 'border-lime-400',
];

// Griglia emoji divisa per categoria
const EMOJI_GRUPPI: { label: string; emoji: string[] }[] = [
  {
    label: 'Impianti elettrici',
    emoji: ['🔲', '📊', '🔋', '⚡', '🔌', '💡', '🔦', '🖥️', '📡', '🔧', '⚙️', '🔩'],
  },
  {
    label: 'Segnalazione / allarme',
    emoji: ['🔔', '🚨', '📢', '🔕', '🔈', '📣', '🚦', '🔴', '🟡', '🟢', '⭕', '❗'],
  },
  {
    label: 'Meccanica / idraulica',
    emoji: ['🔧', '🪛', '🔩', '⚙️', '🪤', '🛢️', '💧', '🌊', '🪝', '🏗️', '🔨', '⛏️'],
  },
  {
    label: 'Generico',
    emoji: ['📦', '🗃️', '📁', '🏷️', '🔖', '📌', '📍', '🗺️', '🧩', '🔑', '🔐', '❓'],
  },
];

const VUOTO: Omit<ElementoVano, 'id'> = {
  id_elemento: '',
  nome: '',
  emoji: '📦',
  colore_bg: 'bg-gray-200',
  colore_border: 'border-gray-400',
  solo_esterno: false,
  solo_interno: false,
  ha_distanza: true,
  descrizione: '',
  attivo: true,
  ordine: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

const api = {
  getAll: async (): Promise<ElementoVano[]> => {
    const r = await fetch(`${API}/elementi-vano`);
    if (!r.ok) throw new Error('Errore caricamento');
    return r.json();
  },
  create: async (data: Omit<ElementoVano, 'id'>): Promise<{ id: number }> => {
    const r = await fetch(`${API}/elementi-vano`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || 'Errore creazione');
    }
    return r.json();
  },
  update: async (id: number, data: Partial<ElementoVano>): Promise<void> => {
    const r = await fetch(`${API}/elementi-vano/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || 'Errore aggiornamento');
    }
  },
  delete: async (id: number): Promise<void> => {
    const r = await fetch(`${API}/elementi-vano/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('Errore eliminazione');
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// EMOJI PICKER
// ─────────────────────────────────────────────────────────────────────────────

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
}

function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const [gruppoAperto, setGruppoAperto] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-600">Emoji icona</label>

      {/* Campo testo libero + anteprima */}
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="📦"
          className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-2xl text-center"
          maxLength={4}
        />
        <span className="text-xs text-gray-400">oppure scegli dalla griglia:</span>
      </div>

      {/* Gruppi collassabili */}
      <div className="space-y-1">
        {EMOJI_GRUPPI.map(gruppo => (
          <div key={gruppo.label}>
            <button
              type="button"
              onClick={() => setGruppoAperto(gruppoAperto === gruppo.label ? null : gruppo.label)}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <span>{gruppoAperto === gruppo.label ? '▾' : '▸'}</span>
              {gruppo.label}
            </button>
            {gruppoAperto === gruppo.label && (
              <div className="flex flex-wrap gap-1 mt-1 p-2 bg-white rounded-lg border border-gray-100">
                {gruppo.emoji.map(e => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => onChange(e)}
                    className={`w-9 h-9 text-xl rounded-lg transition-all hover:scale-110
                      ${value === e
                        ? 'bg-blue-100 ring-2 ring-blue-400 scale-110'
                        : 'hover:bg-gray-100'
                      }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM INLINE
// ─────────────────────────────────────────────────────────────────────────────

interface FormProps {
  initial: Omit<ElementoVano, 'id'> & { id?: number };
  onSave: (v: Omit<ElementoVano, 'id'> & { id?: number }) => void;
  onCancel: () => void;
  isSaving: boolean;
}

function ElementoForm({ initial, onSave, onCancel, isSaving }: FormProps) {
  const [form, setForm] = useState({ ...initial });
  const set = (k: keyof typeof form, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const previewClass = `${form.colore_bg} ${form.colore_border}`;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-blue-900">
        {form.id ? `Modifica: ${form.id_elemento}` : 'Nuovo elemento'}
      </h3>

      {/* Riga 1: ID + Nome */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            ID elemento *
            <span className="text-gray-400 font-normal ml-1">(usato nelle variabili: vano.id_presente)</span>
          </label>
          <input
            value={form.id_elemento}
            onChange={e => set('id_elemento', e.target.value.replace(/\s+/g, ''))}
            placeholder="es: CentrOleo"
            disabled={!!form.id}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono disabled:bg-gray-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nome visualizzato *</label>
          <input
            value={form.nome}
            onChange={e => set('nome', e.target.value)}
            placeholder="es: Centralina Oleodinamica"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>

      {/* Emoji picker */}
      <EmojiPicker value={form.emoji} onChange={e => set('emoji', e)} />

      {/* Riga 2: Colore */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Colore sfondo</label>
          <div className="flex flex-wrap gap-1.5">
            {COLORI_BG.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => set('colore_bg', c)}
                className={`w-7 h-7 rounded border-2 ${c} ${form.colore_bg === c ? 'border-gray-900 scale-110' : 'border-transparent hover:border-gray-400'}`}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Colore bordo</label>
          <div className="flex flex-wrap gap-1.5">
            {COLORI_BORDER.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => set('colore_border', c)}
                className={`w-7 h-7 rounded border-4 bg-white ${c} ${form.colore_border === c ? 'scale-110 ring-2 ring-gray-900' : 'hover:scale-105'}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Anteprima */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500">Anteprima:</span>
        <div className={`w-16 h-16 rounded-lg border-2 flex flex-col items-center justify-center ${previewClass}`}>
          <span className="text-2xl">{form.emoji || '📦'}</span>
          <span className="text-xs font-bold text-gray-700">{form.id_elemento || 'ID'}</span>
        </div>
      </div>

      {/* Riga 3: Vincoli + descrizione */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-600">Vincoli di posizionamento</label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.solo_esterno}
              onChange={e => { set('solo_esterno', e.target.checked); if (e.target.checked) set('solo_interno', false); }}
              className="w-4 h-4 accent-orange-500" />
            <span className="text-sm">Solo esterno (lati A/B/C/D)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.solo_interno}
              onChange={e => { set('solo_interno', e.target.checked); if (e.target.checked) set('solo_esterno', false); }}
              className="w-4 h-4 accent-blue-500" />
            <span className="text-sm">Solo interno al vano</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.ha_distanza}
              onChange={e => set('ha_distanza', e.target.checked)}
              className="w-4 h-4 accent-green-500" />
            <span className="text-sm">Ha campo distanza (m)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.attivo}
              onChange={e => set('attivo', e.target.checked)}
              className="w-4 h-4 accent-blue-600" />
            <span className="text-sm">Attivo (visibile nella palette Disposizione Vano)</span>
          </label>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Descrizione (opzionale)</label>
          <textarea
            value={form.descrizione || ''}
            onChange={e => set('descrizione', e.target.value)}
            rows={4}
            placeholder="Note sull'elemento..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
          />
        </div>
      </div>

      {/* Nota variabili generate */}
      {form.id_elemento && (
        <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500">
          <p className="font-medium text-gray-700 mb-1">Variabili generate automaticamente nel contesto:</p>
          <code className="block">vano.{form.id_elemento.toLowerCase()}_presente</code>
          <code className="block">vano.{form.id_elemento.toLowerCase()}_lato</code>
          <code className="block">vano.{form.id_elemento.toLowerCase()}_segmento</code>
          {form.ha_distanza && <code className="block">vano.{form.id_elemento.toLowerCase()}_distanza</code>}
        </div>
      )}

      {/* Azioni */}
      <div className="flex gap-3 pt-2 border-t border-blue-200">
        <button
          type="button"
          onClick={() => onSave(form)}
          disabled={isSaving || !form.id_elemento || !form.nome}
          className="flex items-center gap-1.5 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-40 hover:bg-blue-700"
        >
          <Check size={14} />
          {isSaving ? 'Salvataggio...' : (form.id ? 'Salva modifiche' : 'Crea elemento')}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg">
          Annulla
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGINA PRINCIPALE
// ─────────────────────────────────────────────────────────────────────────────

export default function GestioneElementiVanoPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<(Omit<ElementoVano, 'id'> & { id?: number }) | null>(null);

  const { data: elementi = [], isLoading } = useQuery({
    queryKey: ['elementi-vano-admin'],
    queryFn: api.getAll,
  });

  const saveMutation = useMutation({
    mutationFn: async (v: Omit<ElementoVano, 'id'> & { id?: number }) => {
      if (v.id) return api.update(v.id, v);
      return api.create(v as Omit<ElementoVano, 'id'>);
    },
    onSuccess: () => {
      toast.success(editing?.id ? 'Elemento aggiornato' : 'Elemento creato');
      qc.invalidateQueries({ queryKey: ['elementi-vano-admin'] });
      qc.invalidateQueries({ queryKey: ['elementi-vano'] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(id),
    onSuccess: () => {
      toast.success('Elemento eliminato');
      qc.invalidateQueries({ queryKey: ['elementi-vano-admin'] });
      qc.invalidateQueries({ queryKey: ['elementi-vano'] });
    },
    onError: () => toast.error('Errore eliminazione'),
  });

  const handleNew = () => setEditing({ ...VUOTO, ordine: elementi.length * 10 });
  const handleEdit = (el: ElementoVano) => setEditing({ ...el });
  const handleDelete = (el: ElementoVano) => {
    if (confirm(`Eliminare "${el.nome}" (${el.id_elemento})?`)) deleteMutation.mutate(el.id!);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Elementi Vano</h1>
          <p className="text-gray-500 text-sm mt-1">
            Gestisci gli elementi posizionabili nella pianta del vano di corsa.
            Ogni elemento genera automaticamente variabili <code className="bg-gray-100 px-1 rounded text-xs">vano.*</code> nel contesto delle regole.
          </p>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700"
        >
          <Plus size={16} /> Nuovo elemento
        </button>
      </div>

      {/* Form editing */}
      {editing && (
        <ElementoForm
          initial={editing}
          onSave={v => saveMutation.mutate(v)}
          onCancel={() => setEditing(null)}
          isSaving={saveMutation.isPending}
        />
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Caricamento...</div>
      ) : elementi.length === 0 && !editing ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">Nessun elemento configurato</p>
          <p className="text-sm">Crea il primo elemento per iniziare</p>
        </div>
      ) : (
        <div className="space-y-2">
          {elementi.map(el => (
            <div
              key={el.id}
              className={`bg-white rounded-xl border shadow-sm p-4 flex items-center gap-4 ${!el.attivo ? 'opacity-60' : ''}`}
            >
              <GripVertical size={16} className="text-gray-300 shrink-0" />

              <div className={`w-12 h-12 rounded-lg border-2 flex flex-col items-center justify-center shrink-0 ${el.colore_bg} ${el.colore_border}`}>
                <span className="text-lg">{el.emoji}</span>
                <span className="text-[9px] font-bold text-gray-700 leading-none">{el.id_elemento}</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900">{el.nome}</span>
                  <code className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{el.id_elemento}</code>
                  {el.solo_esterno && <span className="text-xs bg-orange-100 text-orange-700 rounded px-1.5 py-0.5">solo esterno</span>}
                  {el.solo_interno && <span className="text-xs bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">solo interno</span>}
                  {!el.attivo && <span className="text-xs bg-yellow-100 text-yellow-700 rounded px-1.5 py-0.5">disattivo</span>}
                </div>
                {el.descrizione && <p className="text-xs text-gray-400 mt-0.5 truncate">{el.descrizione}</p>}
                <p className="text-xs text-gray-400 mt-0.5">
                  Variabili: <code className="bg-gray-50">vano.{el.id_elemento.toLowerCase()}_presente</code>
                  {el.ha_distanza && <>, <code className="bg-gray-50">vano.{el.id_elemento.toLowerCase()}_distanza</code></>}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => handleEdit(el)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded" title="Modifica">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => handleDelete(el)} className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Elimina">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
