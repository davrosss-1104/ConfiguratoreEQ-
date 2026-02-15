import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, Plus, Pencil, Trash2, Loader2, Search, X, Save,
  Building2, Phone, Mail, MapPin, Percent, CreditCard, ChevronDown, ChevronUp,
  Eye, EyeOff, FileText
} from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = 'http://localhost:8000';

interface Cliente {
  id: number;
  codice: string;
  ragione_sociale: string;
  partita_iva?: string;
  codice_fiscale?: string;
  indirizzo?: string;
  cap?: string;
  citta?: string;
  provincia?: string;
  nazione?: string;
  telefono?: string;
  email?: string;
  pec?: string;
  sconto_globale?: number;
  sconto_produzione?: number;
  sconto_acquisto?: number;
  aliquota_iva?: number;
  pagamento_default?: string;
  imballo_default?: string;
  reso_fco_default?: string;
  trasporto_default?: string;
  destinazione_default?: string;
  riferimento_cliente_default?: string;
  listino?: string;
  note?: string;
  is_active: boolean;
}

const inputClass = "w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm";
const labelClass = "block text-xs font-medium text-gray-600 mb-1";

const emptyCliente: Partial<Cliente> = {
  codice: '', ragione_sociale: '', partita_iva: '', codice_fiscale: '',
  indirizzo: '', cap: '', citta: '', provincia: '', nazione: 'Italia',
  telefono: '', email: '', pec: '',
  sconto_globale: 0, sconto_produzione: 0, sconto_acquisto: 0, aliquota_iva: 22,
  pagamento_default: '', imballo_default: '', reso_fco_default: '',
  trasporto_default: '', destinazione_default: '', riferimento_cliente_default: '',
  listino: '', note: '', is_active: true,
};

export function GestioneClientiPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Partial<Cliente> | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    anagrafica: true, contatti: true, indirizzo: true, sconti: false, condizioni: false, note: false
  });

  const { data: clienti = [], isLoading } = useQuery({
    queryKey: ['clienti', searchQuery],
    queryFn: async () => {
      const url = searchQuery
        ? `${API_BASE}/clienti/search?q=${encodeURIComponent(searchQuery)}`
        : `${API_BASE}/clienti`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Errore caricamento clienti');
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<Cliente>) => {
      const isEdit = !!data.id;
      const res = await fetch(
        `${API_BASE}/clienti${isEdit ? `/${data.id}` : ''}`,
        { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
      );
      if (!res.ok) throw new Error(`Errore ${isEdit ? 'aggiornamento' : 'creazione'}`);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clienti'] });
      toast.success(variables.id ? 'Cliente aggiornato' : 'Cliente creato');
      setShowForm(false);
      setEditingCliente(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/clienti/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });
      if (!res.ok) throw new Error('Errore disattivazione');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clienti'] });
      toast.success('Cliente disattivato');
    },
  });

  const handleNew = () => {
    setEditingCliente({ ...emptyCliente });
    setShowForm(true);
    setExpandedSections({ anagrafica: true, contatti: true, indirizzo: true, sconti: false, condizioni: false, note: false });
  };

  const handleEdit = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/clienti/${id}`);
      const cliente = await res.json();
      setEditingCliente(cliente);
      setShowForm(true);
      setExpandedSections({ anagrafica: true, contatti: true, indirizzo: true, sconti: true, condizioni: true, note: true });
    } catch { toast.error('Errore caricamento cliente'); }
  };

  const handleSave = () => {
    if (!editingCliente?.ragione_sociale?.trim()) { toast.error('Ragione sociale obbligatoria'); return; }
    saveMutation.mutate(editingCliente);
  };

  const handleField = (field: string, value: any) => {
    setEditingCliente(prev => prev ? { ...prev, [field]: value } : null);
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredClienti = showInactive ? clienti : clienti.filter((c: Cliente) => c.is_active !== false);

  const FormSection = ({ id, title, icon, children }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode }) => (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button type="button" onClick={() => toggleSection(id)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">{icon}{title}</div>
        {expandedSections[id] ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {expandedSections[id] && <div className="p-4">{children}</div>}
    </div>
  );

  return (
    <div className="bg-white/70 rounded-lg shadow">
      {/* HEADER */}
      <div className="px-6 py-4 border-b bg-gray-50/70 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" /> Gestione Clienti
          </h2>
          <p className="text-sm text-gray-600">{filteredClienti.length} client{filteredClienti.length === 1 ? 'e' : 'i'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowInactive(!showInactive)}
            className={`px-3 py-2 rounded-lg text-sm flex items-center gap-1 transition-colors ${showInactive ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {showInactive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {showInactive ? 'Tutti' : 'Solo attivi'}
          </button>
          <button onClick={handleNew}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
            <Plus className="w-4 h-4" /> Nuovo Cliente
          </button>
        </div>
      </div>

      <div className="flex">
        {/* LISTA */}
        <div className={`${showForm ? 'w-2/5 border-r' : 'w-full'} transition-all`}>
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cerca per nome, codice, P.IVA..." className={`${inputClass} pl-10 pr-8`} />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-gray-400" /></button>}
            </div>
          </div>
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
            ) : filteredClienti.length === 0 ? (
              <div className="text-center py-12 text-gray-500">{searchQuery ? 'Nessun risultato' : 'Nessun cliente'}</div>
            ) : (
              filteredClienti.map((c: Cliente) => (
                <div key={c.id} onClick={() => handleEdit(c.id)}
                  className={`px-4 py-3 border-b cursor-pointer transition-colors hover:bg-blue-50/50 ${editingCliente?.id === c.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''} ${!c.is_active ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate">{c.ragione_sociale}</span>
                        {!c.is_active && <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-700 font-medium">INATTIVO</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                        {c.codice && <span className="font-mono">{c.codice}</span>}
                        {c.citta && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.citta}{c.provincia ? ` (${c.provincia})` : ''}</span>}
                        {c.email && <span className="flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{c.email}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <button onClick={e => { e.stopPropagation(); handleEdit(c.id); }} className="p-1.5 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                      {c.is_active && (
                        <button onClick={e => { e.stopPropagation(); if (confirm(`Disattivare "${c.ragione_sociale}"?`)) deleteMutation.mutate(c.id); }}
                          className="p-1.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* FORM */}
        {showForm && editingCliente && (
          <div className="w-3/5 overflow-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
            <div className="px-4 py-3 border-b bg-white sticky top-0 z-10 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                {editingCliente.id ? `Modifica: ${editingCliente.ragione_sociale}` : 'Nuovo Cliente'}
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowForm(false); setEditingCliente(null); }}
                  className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Annulla</button>
                <button onClick={handleSave} disabled={saveMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50">
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salva
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <FormSection id="anagrafica" title="Anagrafica" icon={<Building2 className="w-4 h-4 text-blue-500" />}>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>Codice</label>
                    <input value={editingCliente.codice || ''} onChange={e => handleField('codice', e.target.value)} placeholder="CLI001" className={`${inputClass} font-mono`} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>Ragione Sociale *</label>
                    <input value={editingCliente.ragione_sociale || ''} onChange={e => handleField('ragione_sociale', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Partita IVA</label>
                    <input value={editingCliente.partita_iva || ''} onChange={e => handleField('partita_iva', e.target.value)} placeholder="12345678901" className={`${inputClass} font-mono`} />
                  </div>
                  <div>
                    <label className={labelClass}>Codice Fiscale</label>
                    <input value={editingCliente.codice_fiscale || ''} onChange={e => handleField('codice_fiscale', e.target.value)} className={`${inputClass} font-mono`} />
                  </div>
                  <div>
                    <label className={labelClass}>Listino</label>
                    <input value={editingCliente.listino || ''} onChange={e => handleField('listino', e.target.value)} placeholder="Standard" className={inputClass} />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={editingCliente.is_active !== false} onChange={e => handleField('is_active', e.target.checked)} className="rounded border-gray-300" />
                      <span className="text-sm text-gray-700">Attivo</span>
                    </label>
                  </div>
                </div>
              </FormSection>

              <FormSection id="contatti" title="Contatti" icon={<Phone className="w-4 h-4 text-green-500" />}>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className={labelClass}>Telefono</label><input value={editingCliente.telefono || ''} onChange={e => handleField('telefono', e.target.value)} type="tel" className={inputClass} /></div>
                  <div><label className={labelClass}>Email</label><input value={editingCliente.email || ''} onChange={e => handleField('email', e.target.value)} type="email" className={inputClass} /></div>
                  <div><label className={labelClass}>PEC</label><input value={editingCliente.pec || ''} onChange={e => handleField('pec', e.target.value)} type="email" className={inputClass} /></div>
                  <div className="col-span-3">
                    <label className={labelClass}>Riferimento Cliente Default</label>
                    <input value={editingCliente.riferimento_cliente_default || ''} onChange={e => handleField('riferimento_cliente_default', e.target.value)} placeholder="Persona di riferimento" className={inputClass} />
                  </div>
                </div>
              </FormSection>

              <FormSection id="indirizzo" title="Indirizzo" icon={<MapPin className="w-4 h-4 text-red-500" />}>
                <div className="grid grid-cols-6 gap-3">
                  <div className="col-span-4"><label className={labelClass}>Indirizzo</label><input value={editingCliente.indirizzo || ''} onChange={e => handleField('indirizzo', e.target.value)} className={inputClass} /></div>
                  <div><label className={labelClass}>CAP</label><input value={editingCliente.cap || ''} onChange={e => handleField('cap', e.target.value)} maxLength={5} className={`${inputClass} font-mono`} /></div>
                  <div><label className={labelClass}>Prov.</label><input value={editingCliente.provincia || ''} onChange={e => handleField('provincia', e.target.value.toUpperCase())} maxLength={2} className={`${inputClass} font-mono uppercase`} /></div>
                  <div className="col-span-3"><label className={labelClass}>Città</label><input value={editingCliente.citta || ''} onChange={e => handleField('citta', e.target.value)} className={inputClass} /></div>
                  <div className="col-span-3"><label className={labelClass}>Nazione</label><input value={editingCliente.nazione || ''} onChange={e => handleField('nazione', e.target.value)} className={inputClass} /></div>
                </div>
              </FormSection>

              <FormSection id="sconti" title="Sconti e IVA" icon={<Percent className="w-4 h-4 text-amber-500" />}>
                <div className="grid grid-cols-4 gap-3">
                  <div><label className={labelClass}>Sconto Globale %</label><input type="number" step="0.1" min="0" max="100" value={editingCliente.sconto_globale || 0} onChange={e => handleField('sconto_globale', parseFloat(e.target.value) || 0)} className={inputClass} /></div>
                  <div><label className={labelClass}>Sconto Produzione %</label><input type="number" step="0.1" min="0" max="100" value={editingCliente.sconto_produzione || 0} onChange={e => handleField('sconto_produzione', parseFloat(e.target.value) || 0)} className={inputClass} /></div>
                  <div><label className={labelClass}>Sconto Acquisto %</label><input type="number" step="0.1" min="0" max="100" value={editingCliente.sconto_acquisto || 0} onChange={e => handleField('sconto_acquisto', parseFloat(e.target.value) || 0)} className={inputClass} /></div>
                  <div><label className={labelClass}>Aliquota IVA %</label><input type="number" step="1" min="0" max="100" value={editingCliente.aliquota_iva || 22} onChange={e => handleField('aliquota_iva', parseFloat(e.target.value) || 22)} className={inputClass} /></div>
                </div>
              </FormSection>

              <FormSection id="condizioni" title="Condizioni Commerciali Default" icon={<CreditCard className="w-4 h-4 text-purple-500" />}>
                <p className="text-xs text-gray-500 mb-3">Valori pre-compilati nei nuovi preventivi per questo cliente</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelClass}>Pagamento</label><input value={editingCliente.pagamento_default || ''} onChange={e => handleField('pagamento_default', e.target.value)} placeholder="30 gg d.f." className={inputClass} /></div>
                  <div><label className={labelClass}>Imballo</label><input value={editingCliente.imballo_default || ''} onChange={e => handleField('imballo_default', e.target.value)} placeholder="Cartone" className={inputClass} /></div>
                  <div><label className={labelClass}>Reso F.co</label><input value={editingCliente.reso_fco_default || ''} onChange={e => handleField('reso_fco_default', e.target.value)} placeholder="Stabilimento" className={inputClass} /></div>
                  <div><label className={labelClass}>Trasporto</label><input value={editingCliente.trasporto_default || ''} onChange={e => handleField('trasporto_default', e.target.value)} placeholder="Corriere" className={inputClass} /></div>
                  <div className="col-span-2"><label className={labelClass}>Destinazione</label><input value={editingCliente.destinazione_default || ''} onChange={e => handleField('destinazione_default', e.target.value)} placeholder="Indirizzo di consegna" className={inputClass} /></div>
                </div>
              </FormSection>

              <FormSection id="note" title="Note" icon={<FileText className="w-4 h-4 text-gray-500" />}>
                <textarea value={editingCliente.note || ''} onChange={e => handleField('note', e.target.value)} rows={4} placeholder="Note interne sul cliente..." className={`${inputClass} resize-none`} />
              </FormSection>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GestioneClientiPage;
