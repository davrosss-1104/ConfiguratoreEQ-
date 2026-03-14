import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Mail, Save, Loader2, CheckCircle2, Send, Eye, EyeOff,
  AlertCircle, ShoppingCart, Ticket, RefreshCw, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const API = '/api';

const inputClass = "w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";

const CHIAVI_EMAIL = [
  "smtp_host", "smtp_port", "smtp_user", "smtp_password",
  "smtp_use_tls", "smtp_mittente",
  "email_notifiche_attive",
  "email_notifica_assegnazione",
  "email_notifica_cambio_stato",
  "email_notifica_scadenza",
  "email_ora_invio_differito",
  "email_invio_differito",
  "email_notifica_oda_inviato",
  "email_notifica_oda_ricevuto",
  "email_destinatario_oda",
];

type Parametri = Record<string, string>;

interface LogEntry {
  id: number;
  ticket_id: number | null;
  oda_id: number | null;
  trigger: string;
  destinatari: string;
  oggetto: string;
  esito: string;
  errore: string | null;
  created_at: string;
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${value ? 'bg-blue-600' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  );
}

export default function ConfigEmailPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Parametri>({});
  const [showPassword, setShowPassword] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  const { data: parametri, isLoading } = useQuery<Parametri>({
    queryKey: ['parametri-sistema'],
    queryFn: async () => {
      const res = await fetch(`${API}/parametri-sistema`);
      if (!res.ok) throw new Error('Errore caricamento parametri');
      const lista: { chiave: string; valore: string }[] = await res.json();
      return Object.fromEntries(lista.map(p => [p.chiave, p.valore ?? '']));
    },
  });

  const { data: logEntries, refetch: refetchLog } = useQuery<LogEntry[]>({
    queryKey: ['email-log'],
    queryFn: async () => {
      const res = await fetch(`${API}/notifiche/log?limit=20`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!parametri) return;
    const iniziali: Parametri = {};
    CHIAVI_EMAIL.forEach(k => { iniziali[k] = parametri[k] ?? ''; });
    setForm(iniziali);
    setDirty(false);
  }, [parametri]);

  const set = (key: string, value: string) => {
    setForm(f => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const promises = CHIAVI_EMAIL.map(chiave =>
        fetch(`${API}/parametri-sistema/${chiave}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valore: form[chiave] ?? '' }),
        })
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      toast.success('Configurazione email salvata');
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['parametri-sistema'] });
    },
    onError: () => toast.error('Errore nel salvataggio'),
  });

  async function inviaEmailTest() {
    if (!testEmail.trim()) { toast.error('Inserisci un indirizzo email di test'); return; }
    setTestLoading(true);
    try {
      const res = await fetch(`${API}/notifiche/test-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinatario: testEmail }),
      });
      if (res.ok) {
        toast.success(`Email di test inviata a ${testEmail}`);
      } else {
        const err = await res.json();
        toast.error(`Errore: ${err.detail || 'Invio fallito'}`);
      }
    } catch {
      toast.error('Errore di connessione');
    } finally {
      setTestLoading(false);
    }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  );

  const attive = form.email_notifiche_attive === '1';

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Mail className="w-6 h-6 text-blue-500" /> Notifiche Email
          </h1>
          <p className="text-sm text-gray-500 mt-1">Configurazione SMTP e trigger per Ticketing e Ordini di Acquisto</p>
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || saveMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salva
        </button>
      </div>

      {/* Master switch */}
      <div className="bg-white rounded-xl border p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900">Notifiche email attive</p>
            <p className="text-sm text-gray-500 mt-0.5">Abilita o disabilita tutte le notifiche email</p>
          </div>
          <Toggle value={attive} onChange={v => set('email_notifiche_attive', v ? '1' : '0')} />
        </div>
        {!attive && (
          <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Le notifiche sono disabilitate. Abilita il toggle per attivarle.
          </div>
        )}
      </div>

      {/* Config SMTP */}
      <div className="bg-white rounded-xl border p-5 shadow-sm space-y-4">
        <h2 className="font-semibold text-gray-900 border-b pb-2">Configurazione SMTP</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className={labelClass}>Server SMTP (host)</label>
            <input value={form.smtp_host ?? ''} onChange={e => set('smtp_host', e.target.value)}
              placeholder="smtp.gmail.com" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Porta</label>
            <input value={form.smtp_port ?? '587'} onChange={e => set('smtp_port', e.target.value)}
              placeholder="587" type="number" className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Username / Email account</label>
            <input value={form.smtp_user ?? ''} onChange={e => set('smtp_user', e.target.value)}
              placeholder="notifiche@azienda.it" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Password</label>
            <div className="relative">
              <input
                value={form.smtp_password ?? ''}
                onChange={e => set('smtp_password', e.target.value)}
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                className={`${inputClass} pr-10`}
              />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Indirizzo mittente</label>
            <input value={form.smtp_mittente ?? ''} onChange={e => set('smtp_mittente', e.target.value)}
              placeholder="notifiche@azienda.it" className={inputClass} />
            <p className="text-xs text-gray-400 mt-1">Lascia vuoto per usare lo username</p>
          </div>
          <div className="flex items-center gap-3 mt-5">
            <Toggle
              value={form.smtp_use_tls === '1'}
              onChange={v => set('smtp_use_tls', v ? '1' : '0')}
            />
            <span className="text-sm text-gray-700">Usa TLS (STARTTLS)</span>
          </div>
        </div>
      </div>

      {/* Trigger Ticketing */}
      <div className="bg-white rounded-xl border p-5 shadow-sm space-y-3">
        <h2 className="font-semibold text-gray-900 border-b pb-2 flex items-center gap-2">
          <Ticket className="w-4 h-4 text-blue-500" /> Notifiche Ticketing
        </h2>
        <p className="text-sm text-gray-500">Email automatiche legate agli eventi dei ticket.</p>

        {[
          {
            chiave: 'email_notifica_assegnazione',
            label: 'Assegnazione ticket',
            desc: 'Email al tecnico quando gli viene assegnato un ticket (alla creazione o dalla modifica)',
          },
          {
            chiave: 'email_notifica_cambio_stato',
            label: 'Cambio stato (interno)',
            desc: 'Email al tecnico assegnato e al creatore ad ogni cambio di stato. Per ticket esterni invia anche una notifica al cliente.',
          },
          {
            chiave: 'email_notifica_scadenza',
            label: 'Ticket in scadenza',
            desc: 'Email al tecnico assegnato il giorno della scadenza, all\'ora configurata qui sotto',
          },
        ].map(({ chiave, label, desc }) => (
          <div key={chiave} className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
            <div>
              <p className="text-sm font-medium text-gray-900">{label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
            </div>
            <Toggle
              value={form[chiave] === '1'}
              onChange={v => set(chiave, v ? '1' : '0')}
            />
          </div>
        ))}

        <div className="flex items-center gap-4 pt-2">
          <label className="text-sm font-medium text-gray-700 shrink-0">Ora invio notifiche mattutine</label>
          <input
            type="time"
            value={form.email_ora_invio_differito ?? '08:00'}
            onChange={e => set('email_ora_invio_differito', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-start justify-between py-2 border-t border-gray-100 pt-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Invio differito (raggruppato)</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Se attivo, assegnazioni e cambi stato vengono raggruppati e inviati all'ora mattutina configurata sopra.
              Le notifiche al cliente e le scadenze sono sempre immediate.
            </p>
          </div>
          <Toggle
            value={form.email_invio_differito === '1'}
            onChange={v => set('email_invio_differito', v ? '1' : '0')}
          />
        </div>
      </div>

      {/* Trigger ODA */}
      <div className="bg-white rounded-xl border p-5 shadow-sm space-y-3">
        <h2 className="font-semibold text-gray-900 border-b pb-2 flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-emerald-500" /> Notifiche Ordini di Acquisto
        </h2>
        <p className="text-sm text-gray-500">Email automatiche interne agli eventi degli ODA.</p>

        <div className="mb-3">
          <label className={labelClass}>Email destinatario notifiche ODA</label>
          <input
            value={form.email_destinatario_oda ?? ''}
            onChange={e => set('email_destinatario_oda', e.target.value)}
            placeholder="ufficio.acquisti@azienda.it"
            className={inputClass}
          />
          <p className="text-xs text-gray-400 mt-1">
            Indirizzo interno che riceve le notifiche sugli ODA. Se vuoto, le notifiche ODA non vengono inviate.
          </p>
        </div>

        {[
          {
            chiave: 'email_notifica_oda_inviato',
            label: 'ODA inviato al fornitore',
            desc: 'Email interna di conferma ogni volta che un ODA viene inviato via email al fornitore',
          },
          {
            chiave: 'email_notifica_oda_ricevuto',
            label: 'ODA ricevuto / consegnato',
            desc: 'Email interna quando un ODA passa allo stato "ricevuto" o "parzialmente ricevuto"',
          },
        ].map(({ chiave, label, desc }) => (
          <div key={chiave} className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
            <div>
              <p className="text-sm font-medium text-gray-900">{label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
            </div>
            <Toggle
              value={form[chiave] === '1'}
              onChange={v => set(chiave, v ? '1' : '0')}
            />
          </div>
        ))}
      </div>

      {/* Test email */}
      <div className="bg-white rounded-xl border p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900 border-b pb-2 mb-4">Test connessione SMTP</h2>
        <div className="flex gap-3">
          <input
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="Email destinatario di test..."
            className={`${inputClass} flex-1`}
          />
          <button
            onClick={inviaEmailTest}
            disabled={testLoading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors shrink-0"
          >
            {testLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Invia test
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Invia un'email di prova per verificare che la configurazione SMTP sia corretta. Salva prima di testare.</p>
      </div>

      {/* Log ultimi invii */}
      <div className="bg-white rounded-xl border p-5 shadow-sm">
        <div className="flex items-center justify-between border-b pb-2 mb-4">
          <h2 className="font-semibold text-gray-900">Log ultimi invii</h2>
          <button onClick={() => refetchLog()} className="text-gray-400 hover:text-gray-600">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {!logEntries || logEntries.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nessuna email registrata</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {logEntries.map(entry => (
              <div key={entry.id} className="py-2.5 flex items-start gap-3">
                <div className="shrink-0 mt-0.5">
                  {entry.esito === 'inviata'
                    ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                    : <XCircle className="w-4 h-4 text-red-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-700">{entry.trigger}</span>
                    {entry.ticket_id && (
                      <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                        Ticket #{entry.ticket_id}
                      </span>
                    )}
                    {entry.oda_id && (
                      <span className="text-xs bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">
                        ODA #{entry.oda_id}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{entry.oggetto}</p>
                  {entry.errore && (
                    <p className="text-xs text-red-500 mt-0.5">{entry.errore}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(entry.created_at).toLocaleString('it-IT', {
                    day: '2-digit', month: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
