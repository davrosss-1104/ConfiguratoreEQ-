import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HelpCircle, Plus, Trash2, Loader2, UserCheck } from 'lucide-react';
import { toast } from 'sonner';

const API = '/api';

interface UtenteSupporto {
  id: number;
  utente_id: number;
  username: string;
  email?: string;
  note?: string;
  created_at: string;
}

interface Utente {
  id: number;
  username: string;
  email?: string;
  is_active: boolean;
}

export default function ConfigSupportoPage() {
  const qc = useQueryClient();
  const [nuovoUtenteId, setNuovoUtenteId] = useState('');
  const [note, setNote] = useState('');

  const { data: lista = [], isLoading } = useQuery<UtenteSupporto[]>({
    queryKey: ['utenti-supporto'],
    queryFn: async () => {
      const res = await fetch(`${API}/utenti-supporto`);
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  const { data: tuttiUtenti = [] } = useQuery<Utente[]>({
    queryKey: ['utenti-lista'],
    queryFn: async () => {
      const res = await fetch(`${API}/utenti`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      return Array.isArray(data) ? data : data.items ?? [];
    },
  });

  const aggiungiMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/utenti-supporto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utente_id: parseInt(nuovoUtenteId), note }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Errore');
    },
    onSuccess: () => {
      toast.success('Utente aggiunto alla lista di supporto');
      setNuovoUtenteId('');
      setNote('');
      qc.invalidateQueries({ queryKey: ['utenti-supporto'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rimuoviMutation = useMutation({
    mutationFn: async (utenteId: number) => {
      const res = await fetch(`${API}/utenti-supporto/${utenteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => {
      toast.success('Utente rimosso');
      qc.invalidateQueries({ queryKey: ['utenti-supporto'] });
    },
    onError: () => toast.error('Errore rimozione'),
  });

  // Utenti non ancora nella lista
  const listaIds = new Set(lista.map(u => u.utente_id));
  const utentiDisponibili = tuttiUtenti.filter(u => u.is_active !== false && !listaIds.has(u.id));

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <HelpCircle className="w-6 h-6 text-purple-600" /> Utenti di Supporto
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Gli utenti in questa lista possono ricevere richieste di supporto sui ticket e vengono notificati in caso di escalation automatica.
        </p>
      </div>

      {/* Lista attuale */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <p className="text-sm font-semibold text-gray-700">
            Utenti configurati ({lista.length})
          </p>
        </div>

        {lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-300">
            <UserCheck className="w-10 h-10 mb-3" />
            <p className="text-sm text-gray-400">Nessun utente di supporto configurato</p>
          </div>
        ) : (
          <div className="divide-y">
            {lista.map(u => (
              <div key={u.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                <div>
                  <p className="text-sm font-medium text-gray-900">{u.username}</p>
                  {u.email && <p className="text-xs text-gray-400">{u.email}</p>}
                  {u.note && <p className="text-xs text-gray-400 italic">{u.note}</p>}
                </div>
                <button
                  onClick={() => rimuoviMutation.mutate(u.utente_id)}
                  disabled={rimuoviMutation.isPending}
                  className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Aggiunta utente */}
      <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Aggiungi utente</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Utente</label>
          <select
            value={nuovoUtenteId}
            onChange={e => setNuovoUtenteId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
          >
            <option value="">Seleziona utente...</option>
            {utentiDisponibili.map(u => (
              <option key={u.id} value={u.id}>
                {u.username}{u.email ? ` (${u.email})` : ''}
              </option>
            ))}
          </select>
          {utentiDisponibili.length === 0 && tuttiUtenti.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">Tutti gli utenti attivi sono già nella lista.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Note (opzionale)</label>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Es: Responsabile tecnico senior..."
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
          />
        </div>

        <button
          onClick={() => aggiungiMutation.mutate()}
          disabled={!nuovoUtenteId || aggiungiMutation.isPending}
          className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {aggiungiMutation.isPending
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Plus className="w-4 h-4" />}
          Aggiungi
        </button>
      </div>

    </div>
  );
}
