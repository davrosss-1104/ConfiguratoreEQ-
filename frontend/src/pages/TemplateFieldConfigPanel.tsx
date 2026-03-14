/**
 * TemplateFieldConfigPanel.tsx
 * 
 * Pannello per configurare, per ogni template, i flag di ogni campo:
 *   - readonly: campo bloccato nel form (l'utente non può modificarlo)
 *   - includi_preventivo: il campo appare nel documento PDF
 *   - mostra_default: se non modificato, appare nella sezione "Valori Standard"
 * 
 * Usa gli endpoint:
 *   GET  /templates/{id}/field-config
 *   PUT  /templates/{id}/field-config
 */
import { useState, useEffect, useCallback, useMemo } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface FieldInfo {
  codice: string;
  etichetta: string;
  sezione: string;
  tipo: string;
  valore_default: string | null;
  readonly: boolean;
  includi_preventivo: boolean;
  mostra_default: boolean;
}

interface FieldConfigMap {
  [codice: string]: {
    readonly?: boolean;
    includi_preventivo?: boolean;
    mostra_default?: boolean;
  };
}

interface Props {
  templateId: number;
}

export default function TemplateFieldConfigPanel({ templateId }: Props) {
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [originalConfig, setOriginalConfig] = useState<FieldConfigMap>({});
  const [localConfig, setLocalConfig] = useState<FieldConfigMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [filterSection, setFilterSection] = useState<string>('');
  const [search, setSearch] = useState('');

  // Carica dati
  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`${API_BASE}/templates/${templateId}/field-config`)
      .then(res => {
        if (!res.ok) throw new Error('Errore caricamento');
        return res.json();
      })
      .then(data => {
        setFields(data.fields || []);
        setOriginalConfig(data.raw_config || {});
        // Inizializza localConfig dai dati ricevuti
        const cfg: FieldConfigMap = {};
        for (const f of (data.fields || [])) {
          if (f.readonly || !f.includi_preventivo || f.mostra_default) {
            cfg[f.codice] = {
              readonly: f.readonly,
              includi_preventivo: f.includi_preventivo,
              mostra_default: f.mostra_default,
            };
          }
        }
        setLocalConfig(cfg);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [templateId]);

  // Sezioni uniche
  const sezioni = useMemo(() => {
    const set = new Set(fields.map(f => f.sezione));
    return Array.from(set);
  }, [fields]);

  // Campi filtrati
  const filteredFields = useMemo(() => {
    let result = fields;
    if (filterSection) {
      result = result.filter(f => f.sezione === filterSection);
    }
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(f =>
        f.codice.toLowerCase().includes(s) ||
        f.etichetta.toLowerCase().includes(s)
      );
    }
    return result;
  }, [fields, filterSection, search]);

  // Modifica flag locale
  const toggleFlag = useCallback((codice: string, flag: 'readonly' | 'includi_preventivo' | 'mostra_default') => {
    setSaved(false);
    setLocalConfig(prev => {
      const current = prev[codice] || { readonly: false, includi_preventivo: true, mostra_default: false };
      const newVal = flag === 'includi_preventivo'
        ? !(current.includi_preventivo ?? true)
        : !current[flag];
      const updated = { ...current, [flag]: newVal };

      // Se tutti i flag sono ai default, rimuovi dalla config
      if (!updated.readonly && (updated.includi_preventivo ?? true) && !updated.mostra_default) {
        const next = { ...prev };
        delete next[codice];
        return next;
      }
      return { ...prev, [codice]: updated };
    });
  }, []);

  // Flag corrente per un campo
  const getFlag = useCallback((codice: string, flag: 'readonly' | 'includi_preventivo' | 'mostra_default'): boolean => {
    const cfg = localConfig[codice];
    if (!cfg) {
      return flag === 'includi_preventivo' ? true : false;
    }
    if (flag === 'includi_preventivo') return cfg.includi_preventivo ?? true;
    return cfg[flag] ?? false;
  }, [localConfig]);

  // Salva
  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/templates/${templateId}/field-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_config: localConfig }),
      });
      if (!res.ok) throw new Error('Errore salvataggio');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Azioni batch
  const setAllInSection = (sezione: string, flag: 'readonly' | 'includi_preventivo' | 'mostra_default', value: boolean) => {
    setSaved(false);
    setLocalConfig(prev => {
      const next = { ...prev };
      for (const f of fields.filter(f => f.sezione === sezione)) {
        const current = next[f.codice] || { readonly: false, includi_preventivo: true, mostra_default: false };
        const updated = { ...current, [flag]: value };
        if (!updated.readonly && (updated.includi_preventivo ?? true) && !updated.mostra_default) {
          delete next[f.codice];
        } else {
          next[f.codice] = updated;
        }
      }
      return next;
    });
  };

  // Conteggi
  const configuredCount = Object.keys(localConfig).length;
  const readonlyCount = Object.values(localConfig).filter(c => c.readonly).length;
  const excludedCount = Object.values(localConfig).filter(c => c.includi_preventivo === false).length;
  const showDefaultCount = Object.values(localConfig).filter(c => c.mostra_default).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <span className="ml-3 text-sm text-gray-500">Caricamento configurazione campi...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            Configura il comportamento di ogni campo per questo template.
          </p>
          <div className="flex gap-4 mt-2 text-xs text-gray-400">
            <span>{fields.length} campi totali</span>
            <span>|</span>
            <span className="text-amber-600">{readonlyCount} readonly</span>
            <span className="text-red-500">{excludedCount} esclusi da PDF</span>
            <span className="text-emerald-600">{showDefaultCount} in "Valori Standard"</span>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            saved
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          } disabled:opacity-50`}
        >
          {saving ? 'Salvataggio...' : saved ? '✓ Salvato' : 'Salva Configurazione'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>
      )}

      {/* Filtri */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca campo..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterSection}
          onChange={e => setFilterSection(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tutte le sezioni</option>
          {sezioni.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Tabella campi */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Campo</th>
              <th className="text-left px-3 py-3 font-medium text-gray-600 w-28">Sezione</th>
              <th className="text-center px-3 py-3 font-medium text-gray-600 w-24">
                <div className="flex flex-col items-center">
                  <svg className="w-4 h-4 text-amber-500 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <span className="text-xs">Readonly</span>
                </div>
              </th>
              <th className="text-center px-3 py-3 font-medium text-gray-600 w-24">
                <div className="flex flex-col items-center">
                  <svg className="w-4 h-4 text-blue-500 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span className="text-xs">Nel PDF</span>
                </div>
              </th>
              <th className="text-center px-3 py-3 font-medium text-gray-600 w-24">
                <div className="flex flex-col items-center">
                  <svg className="w-4 h-4 text-emerald-500 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                  <span className="text-xs">Val. Std.</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sezioni
              .filter(sez => !filterSection || sez === filterSection)
              .map(sez => {
                const campiSez = filteredFields.filter(f => f.sezione === sez);
                if (campiSez.length === 0) return null;
                return (
                  <SectionGroup
                    key={sez}
                    sezione={sez}
                    campi={campiSez}
                    getFlag={getFlag}
                    toggleFlag={toggleFlag}
                    setAllInSection={setAllInSection}
                  />
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Legenda */}
      <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-500 space-y-1">
        <p><strong className="text-amber-600">Readonly</strong> — Il campo appare nel form ma l'utente non può modificarlo (tipico: valori che definiscono la linea di prodotto)</p>
        <p><strong className="text-blue-600">Nel PDF</strong> — Il campo viene incluso nel documento preventivo generato</p>
        <p><strong className="text-emerald-600">Val. Std.</strong> — Se l'utente non modifica il valore, viene riportato nella sezione "Valori Standard Applicati" del preventivo</p>
      </div>
    </div>
  );
}


// ==========================================
// Sotto-componente: gruppo sezione con header
// ==========================================
function SectionGroup({
  sezione,
  campi,
  getFlag,
  toggleFlag,
  setAllInSection,
}: {
  sezione: string;
  campi: FieldInfo[];
  getFlag: (codice: string, flag: 'readonly' | 'includi_preventivo' | 'mostra_default') => boolean;
  toggleFlag: (codice: string, flag: 'readonly' | 'includi_preventivo' | 'mostra_default') => void;
  setAllInSection: (sezione: string, flag: 'readonly' | 'includi_preventivo' | 'mostra_default', value: boolean) => void;
}) {
  const allReadonly = campi.every(f => getFlag(f.codice, 'readonly'));
  const allInPdf = campi.every(f => getFlag(f.codice, 'includi_preventivo'));
  const allShowDef = campi.every(f => getFlag(f.codice, 'mostra_default'));

  return (
    <>
      {/* Section header */}
      <tr className="bg-blue-50/50 border-t border-b border-gray-100">
        <td className="px-4 py-2 font-semibold text-gray-700 text-xs uppercase tracking-wider" colSpan={2}>
          {sezione.replace(/_/g, ' ')}
          <span className="ml-2 text-gray-400 font-normal">({campi.length})</span>
        </td>
        <td className="text-center px-3 py-2">
          <input
            type="checkbox"
            checked={allReadonly}
            onChange={() => setAllInSection(sezione, 'readonly', !allReadonly)}
            className="rounded border-gray-300 text-amber-500 focus:ring-amber-500"
            title="Tutti readonly"
          />
        </td>
        <td className="text-center px-3 py-2">
          <input
            type="checkbox"
            checked={allInPdf}
            onChange={() => setAllInSection(sezione, 'includi_preventivo', !allInPdf)}
            className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            title="Tutti nel PDF"
          />
        </td>
        <td className="text-center px-3 py-2">
          <input
            type="checkbox"
            checked={allShowDef}
            onChange={() => setAllInSection(sezione, 'mostra_default', !allShowDef)}
            className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
            title="Tutti in Valori Standard"
          />
        </td>
      </tr>
      {/* Field rows */}
      {campi.map(field => (
        <tr key={field.codice} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
          <td className="px-4 py-2.5">
            <div className="flex flex-col">
              <span className="font-medium text-gray-800">{field.etichetta}</span>
              <span className="text-xs text-gray-400 font-mono">{field.codice}</span>
            </div>
          </td>
          <td className="px-3 py-2.5 text-xs text-gray-400">{field.tipo}</td>
          <td className="text-center px-3 py-2.5">
            <input
              type="checkbox"
              checked={getFlag(field.codice, 'readonly')}
              onChange={() => toggleFlag(field.codice, 'readonly')}
              className="rounded border-gray-300 text-amber-500 focus:ring-amber-500"
            />
          </td>
          <td className="text-center px-3 py-2.5">
            <input
              type="checkbox"
              checked={getFlag(field.codice, 'includi_preventivo')}
              onChange={() => toggleFlag(field.codice, 'includi_preventivo')}
              className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
          </td>
          <td className="text-center px-3 py-2.5">
            <input
              type="checkbox"
              checked={getFlag(field.codice, 'mostra_default')}
              onChange={() => toggleFlag(field.codice, 'mostra_default')}
              className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
            />
          </td>
        </tr>
      ))}
    </>
  );
}
