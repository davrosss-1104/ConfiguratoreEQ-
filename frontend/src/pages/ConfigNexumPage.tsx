import { useState, useEffect } from 'react';
import { BookOpen, Save, CheckCircle2, XCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function ConfigNexumPage() {
  const [nexumUrl,    setNexumUrl]    = useState('');
  const [nexumKey,    setNexumKey]    = useState('');
  const [showKey,     setShowKey]     = useState(false);
  const [stato,       setStato]       = useState<'idle'|'testing'|'ok'|'error'>('idle');
  const [saving,      setSaving]      = useState(false);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    // Legge i parametri attuali
    fetch(`${API_BASE}/parametri-sistema`)
      .then(r => r.ok ? r.json() : [])
      .then((params: { chiave: string; valore: string }[]) => {
        const url = params.find(p => p.chiave === 'nexum_url')?.valore ?? '';
        const key = params.find(p => p.chiave === 'nexum_api_key')?.valore ?? '';
        setNexumUrl(url);
        setNexumKey(key);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSalva = async () => {
    setSaving(true);
    try {
      // Salva i due parametri
      await Promise.all([
        fetch(`${API_BASE}/parametri-sistema/nexum_url`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valore: nexumUrl.trim(), gruppo: 'nexum', descrizione: 'URL base Nexum' }),
        }),
        fetch(`${API_BASE}/parametri-sistema/nexum_api_key`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valore: nexumKey.trim(), gruppo: 'nexum', descrizione: 'API Key Nexum' }),
        }),
      ]);
      toast.success('Configurazione Nexum salvata');
      setStato('idle');
    } catch {
      toast.error('Errore salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!nexumUrl.trim()) { toast.error('Inserire URL Nexum prima di testare'); return; }
    setStato('testing');
    try {
      const res = await fetch(`${API_BASE}/nexum/stato`);
      const data = await res.json();
      setStato(data.raggiungibile ? 'ok' : 'error');
    } catch {
      setStato('error');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-5 border-b flex items-center gap-3">
          <BookOpen className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="font-semibold text-gray-900">Integrazione Nexum</h2>
            <p className="text-sm text-gray-500">Configura la connessione al sistema knowledge Nexum</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL base Nexum</label>
            <input
              value={nexumUrl}
              onChange={e => setNexumUrl(e.target.value)}
              placeholder="http://localhost:5000"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Es: <code>http://localhost:5000</code> o <code>https://nexum.azienda.it</code>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key (opzionale)</label>
            <div className="relative">
              <input
                value={nexumKey}
                onChange={e => setNexumKey(e.target.value)}
                type={showKey ? 'text' : 'password'}
                placeholder="Lascia vuoto se Nexum non richiede autenticazione"
                className="w-full border rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Stato connessione */}
          {stato !== 'idle' && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              stato === 'testing' ? 'bg-blue-50 text-blue-700' :
              stato === 'ok'      ? 'bg-emerald-50 text-emerald-700' :
                                    'bg-red-50 text-red-700'
            }`}>
              {stato === 'testing' && <Loader2 className="h-4 w-4 animate-spin" />}
              {stato === 'ok'      && <CheckCircle2 className="h-4 w-4" />}
              {stato === 'error'   && <XCircle className="h-4 w-4" />}
              {stato === 'testing' ? 'Connessione in corso...' :
               stato === 'ok'      ? 'Nexum raggiungibile' :
                                     'Nexum non raggiungibile — verifica URL e rete'}
            </div>
          )}
        </div>

        <div className="p-5 border-t flex justify-between items-center">
          <button
            onClick={handleTest}
            disabled={stato === 'testing'}
            className="px-4 py-2 border border-gray-300 text-sm text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Testa connessione
          </button>
          <button
            onClick={handleSalva}
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salva
          </button>
        </div>
      </div>

      <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
        <p className="font-medium mb-1">Come funziona l'integrazione</p>
        <p>Quando un ticket viene aperto o modificato, ConfiguratoreEQ interroga Nexum cercando regole correlate al titolo del ticket. I risultati appaiono nel pannello "Conoscenza correlata" nella pagina dettaglio ticket.</p>
        <p className="mt-2">Nexum deve esporre l'endpoint <code className="bg-amber-100 px-1 rounded">GET /api/regole?q=...</code> e <code className="bg-amber-100 px-1 rounded">GET /api/health</code>.</p>
      </div>
    </div>
  );
}
