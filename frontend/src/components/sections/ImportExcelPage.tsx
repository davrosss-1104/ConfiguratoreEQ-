import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ChevronRight,
  ChevronLeft, Loader2, Table2, Eye, RefreshCw, Info, X,
  ChevronDown, ChevronUp, Package, Link2, AlertTriangle,
  ExternalLink, Database, Search as SearchIcon, Zap, Settings, Unlink,
  Key, ArrowRight, Columns, Hash, Type, Plus, Trash2
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ==========================================
// TYPES
// ==========================================
interface ParseResult {
  sheets: string[];
  selected_sheet: string;
  header_row: number;
  columns: string[];
  rows: Record<string, any>[];
  total_rows: number;
}

interface FieldCandidate {
  field: string; codice: string; etichetta: string;
  sezione: string; tipo: string; score: number;
}

interface AllField {
  field: string; codice: string; etichetta: string;
  sezione: string; tipo: string;
}

interface AnalyzeResult {
  success: boolean;
  total_rows: number;
  distinct_values: Record<string, string[]>;
  field_candidates: Record<string, FieldCandidate[]>;
  all_fields: AllField[];
}

interface ValueMapping {
  tipo: 'articolo' | 'parametro' | '';
  codice_articolo?: string;
  descrizione_articolo?: string;
  articolo_id?: number;
  articoli?: Array<{
    codice: string;
    descrizione: string;
    id?: number;
    quantita: number;
  }>;
}

// Match type per colonna chiave
type MatchType = 'lte' | 'exact';
// lte = input ≤ valore tabella → seleziona prima riga con valore ≥ input
// exact = match esatto

// Field mapping: singolo campo o composito (1 colonna Excel → N campi configuratore)
interface FieldMapping {
  type: 'single' | 'composite';
  field?: string;                // per single
  fields?: string[];             // per composite
  separator?: string;            // per composite (default "_")
}

interface GeneraResult {
  success: boolean;
  data_table: string;
  rule_id: string;
  has_todo: boolean;
  rows_imported: number;
  value_mappings_count: number;
  warnings: string[];
}

interface ArticoloSearch {
  id: number; codice: string; descrizione: string;
}

// ==========================================
// COMPONENTE PRINCIPALE
// ==========================================
export default function ImportExcelPage({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [headerRow, setHeaderRow] = useState(1);

  // Step 2
  const [keyColumns, setKeyColumns] = useState<string[]>([]);
  const [outputColumns, setOutputColumns] = useState<string[]>([]);
  const [nomeTabella, setNomeTabella] = useState('');
  const [keyConfigs, setKeyConfigs] = useState<Record<string, MatchType>>({});

  // Step 3
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [fieldMappings, setFieldMappings] = useState<Record<string, FieldMapping>>({});
  const [valueMappings, setValueMappings] = useState<Record<string, ValueMapping>>({});

  // Step 4
  const [generaResult, setGeneraResult] = useState<GeneraResult | null>(null);

  // _MAPPA detection
  const [mappaDetected, setMappaDetected] = useState(false);
  const [mappaImporting, setMappaImporting] = useState(false);
  const [mappaResult, setMappaResult] = useState<any>(null);

  const reset = () => {
    setStep(1); setFile(null); setLoading(false); setError(null);
    setParseResult(null); setSelectedSheet(''); setHeaderRow(1);
    setKeyColumns([]); setOutputColumns([]); setNomeTabella('');
    setKeyConfigs({});
    setAnalyzeResult(null); setFieldMappings({}); setValueMappings({});
    setGeneraResult(null);
    setMappaDetected(false); setMappaImporting(false); setMappaResult(null);
  };

  // ── Import via _MAPPA ──
  const doMappaImport = async () => {
    if (!file) return;
    setMappaImporting(true); setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/data-tables/upload?overwrite=true`, {
        method: 'POST', body: formData,
      });
      const data = await res.json();
      if (data.errori && data.errori.length > 0) {
        setError(data.errori.join('\n'));
      }
      setMappaResult(data);
    } catch (e: any) {
      setError(e.message || 'Errore di connessione');
    }
    setMappaImporting(false);
  };

  // ── Step 1: Upload & Parse ──
  const doParse = async (f: File, sheet?: string, hRow?: number) => {
    setLoading(true); setError(null);
    try {
      const formData = new FormData();
      formData.append('file', f);
      const params = new URLSearchParams();
      if (sheet) params.set('sheet', sheet);
      if (hRow) params.set('header_row', String(hRow));
      const res = await fetch(`${API_BASE}/import-excel/parse-sheet?${params}`, {
        method: 'POST', body: formData,
      });
      const data: ParseResult = await res.json();
      setParseResult(data);
      // Detect _MAPPA sheet
      const hasMappa = data.sheets.some(s => s === '_MAPPA');
      setMappaDetected(hasMappa);
      setMappaResult(null);
      if (!selectedSheet && data.selected_sheet) setSelectedSheet(data.selected_sheet);
    } catch (e: any) {
      setError(e.message || 'Errore di connessione');
    }
    setLoading(false);
  };

  // ── Step 2→3: Analyze ──
  const doAnalyze = async () => {
    if (!file) return;
    setLoading(true); setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('config_json', JSON.stringify({
        sheet: selectedSheet || parseResult?.selected_sheet,
        header_row: headerRow,
        key_columns: keyColumns,
        output_columns: outputColumns,
      }));
      const res = await fetch(`${API_BASE}/import-excel/analyze-v3`, {
        method: 'POST', body: formData,
      });
      const data: AnalyzeResult = await res.json();
      if (data.success) {
        setAnalyzeResult(data);
        // Auto-fill field mappings con miglior candidato
        const autoMappings: Record<string, FieldMapping> = {};
        for (const [col, candidates] of Object.entries(data.field_candidates)) {
          if (candidates.length > 0 && candidates[0].score >= 60) {
            autoMappings[col] = { type: 'single', field: candidates[0].field };
          }
        }
        setFieldMappings(prev => ({ ...autoMappings, ...prev }));
        setStep(3);
      } else {
        setError('Errore nell\'analisi');
      }
    } catch (e: any) {
      setError(e.message || 'Errore di connessione');
    }
    setLoading(false);
  };

  // ── Step 3→4: Genera ──
  const doGenera = async () => {
    if (!file) return;
    setLoading(true); setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('config_json', JSON.stringify({
        nome_tabella: nomeTabella,
        sheet: selectedSheet || parseResult?.selected_sheet,
        header_row: headerRow,
        key_columns: keyColumns,
        output_columns: outputColumns,
        key_configs: keyConfigs,
        field_mappings: fieldMappings,
        value_mappings: valueMappings,
        conditions: [],
      }));
      const res = await fetch(`${API_BASE}/import-excel/genera-v3`, {
        method: 'POST', body: formData,
      });
      const data: GeneraResult = await res.json();
      setGeneraResult(data);
      setStep(4);
    } catch (e: any) {
      setError(e.message || 'Errore di connessione');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Importa Lookup Table</h1>
          <p className="text-gray-600 text-sm mt-1">
            Carica un file Excel, definisci chiavi e output, mappa i valori agli articoli
          </p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 mt-6">
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { n: 1, label: 'Upload & Anteprima' },
            { n: 2, label: 'Struttura tabella' },
            { n: 3, label: 'Mapping' },
            { n: 4, label: 'Risultato' },
          ].map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="w-4 h-4 text-gray-300" />}
              <StepBadge num={s.n} label={s.label} active={step === s.n} done={step > s.n}
                onClick={step > s.n ? () => setStep(s.n) : undefined} />
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700 whitespace-pre-wrap flex-1">{error}</div>
            <button onClick={() => setError(null)}><X className="w-4 h-4 text-red-400" /></button>
          </div>
        )}

        {step === 1 && (
          <Step1Upload file={file} setFile={setFile} parseResult={parseResult}
            selectedSheet={selectedSheet} setSelectedSheet={s => { setSelectedSheet(s); if (file) doParse(file, s, headerRow); }}
            headerRow={headerRow} setHeaderRow={h => { setHeaderRow(h); if (file) doParse(file, selectedSheet, h); }}
            loading={loading} onParse={f => doParse(f)} onNext={() => setStep(2)}
            mappaDetected={mappaDetected} mappaImporting={mappaImporting} mappaResult={mappaResult}
            onMappaImport={doMappaImport} onReset={reset} onNavigate={onNavigate} />
        )}
        {step === 2 && parseResult && (
          <Step2Structure parseResult={parseResult}
            keyColumns={keyColumns} setKeyColumns={setKeyColumns}
            outputColumns={outputColumns} setOutputColumns={setOutputColumns}
            nomeTabella={nomeTabella} setNomeTabella={setNomeTabella}
            keyConfigs={keyConfigs} setKeyConfigs={setKeyConfigs}
            loading={loading} onBack={() => setStep(1)} onNext={doAnalyze} />
        )}
        {step === 3 && analyzeResult && (
          <Step3Mapping analyzeResult={analyzeResult} keyColumns={keyColumns}
            fieldMappings={fieldMappings} setFieldMappings={setFieldMappings}
            valueMappings={valueMappings} setValueMappings={setValueMappings}
            loading={loading} onBack={() => setStep(2)} onGenera={doGenera} />
        )}
        {step === 4 && generaResult && (
          <Step4Result result={generaResult} onReset={reset} onBack={() => setStep(3)} onNavigate={onNavigate} />
        )}
      </div>
    </div>
  );
}

// ==========================================
function StepBadge({ num, label, active, done, onClick }: { num: number; label: string; active: boolean; done: boolean; onClick?: () => void }) {
  const clickable = done && onClick;
  return (
    <div onClick={clickable ? onClick : undefined}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
      active ? 'bg-blue-100 text-blue-800 font-semibold'
        : done ? 'text-green-700 hover:bg-green-50 cursor-pointer' : 'text-gray-400'
    }`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
        active ? 'bg-blue-600 text-white' : done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
      }`}>{done ? '✓' : num}</div>
      {label}
    </div>
  );
}

// ==========================================
// STEP 1: UPLOAD & ANTEPRIMA
// ==========================================
function Step1Upload({ file, setFile, parseResult, selectedSheet, setSelectedSheet, headerRow, setHeaderRow, loading, onParse, onNext, mappaDetected, mappaImporting, mappaResult, onMappaImport, onReset, onNavigate }: {
  file: File | null; setFile: (f: File | null) => void;
  parseResult: ParseResult | null;
  selectedSheet: string; setSelectedSheet: (s: string) => void;
  headerRow: number; setHeaderRow: (h: number) => void;
  loading: boolean; onParse: (f: File) => void; onNext: () => void;
  mappaDetected: boolean; mappaImporting: boolean; mappaResult: any;
  onMappaImport: () => void; onReset: () => void; onNavigate?: (section: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const handleFile = useCallback((f: File) => {
    if (f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) { setFile(f); onParse(f); }
  }, [setFile, onParse]);

  return (
    <div className="space-y-6">
      <div className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
        dragOver ? 'border-blue-400 bg-blue-50' : file ? 'border-green-300 bg-green-50' : 'border-gray-300 hover:border-gray-400'
      }`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => inputRef.current?.click()}>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileSpreadsheet className="w-8 h-8 text-green-600" />
            <div className="text-left">
              <p className="font-semibold text-gray-900">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button onClick={e => { e.stopPropagation(); setFile(null); }} className="ml-4 p-1 hover:bg-gray-200 rounded">
              <X className="w-4 h-4 text-gray-400" /></button>
          </div>
        ) : (
          <><Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">Trascinate il file Excel qui</p>
            <p className="text-sm text-gray-400 mt-1">oppure cliccate per selezionarlo</p></>
        )}
      </div>

      {parseResult && (
        <>
          {/* ── _MAPPA Detection Banner ── */}
          {mappaDetected && !mappaResult && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Database className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-amber-900">Foglio _MAPPA rilevato</p>
                  <p className="text-sm text-amber-700 mt-1">
                    Questo file contiene un foglio <strong>_MAPPA</strong> — è pensato per l'import pipeline
                    (cataloghi con righe ripetute, utilizzatori multi-uscita).
                    Il sistema legge l'indice _MAPPA e genera automaticamente le tabelle dati.
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <button onClick={onMappaImport} disabled={mappaImporting}
                      className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors disabled:opacity-50">
                      {mappaImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      {mappaImporting ? 'Importazione in corso...' : 'Importa via _MAPPA'}
                    </button>
                    <span className="text-xs text-amber-600">oppure prosegui col wizard per una ricerca semplice ↓</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── _MAPPA Import Result ── */}
          {mappaResult && (() => {
            const hasTabelle = mappaResult.tables_generated && mappaResult.tables_generated.length > 0;
            const isOk = hasTabelle; // successo se almeno una tabella generata
            return (
            <div className={`border-2 rounded-xl p-5 space-y-4 ${isOk ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
              <div className="flex items-center gap-3">
                {isOk
                  ? <CheckCircle2 className="w-6 h-6 text-green-600" />
                  : <AlertCircle className="w-6 h-6 text-red-600" />}
                <div>
                  <p className={`font-semibold ${isOk ? 'text-green-900' : 'text-red-900'}`}>
                    {isOk ? 'Import completato' : 'Errore nell\'import'}
                  </p>
                  <p className={`text-sm ${isOk ? 'text-green-700' : 'text-red-700'}`}>
                    {hasTabelle ? `${mappaResult.tables_generated.length} tabelle generate` : 'Nessuna tabella generata'}
                  </p>
                </div>
              </div>
              {hasTabelle && (
                <div className="bg-white rounded-lg border border-green-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-green-100">
                      <th className="text-left px-4 py-2 font-semibold text-green-800">Tabella</th>
                      <th className="text-left px-4 py-2 font-semibold text-green-800">File</th>
                    </tr></thead>
                    <tbody>
                      {mappaResult.tables_generated.map((nome: string, i: number) => (
                        <tr key={i} className="border-t border-green-100">
                          <td className="px-4 py-2 font-mono text-green-900">{nome}</td>
                          <td className="px-4 py-2 text-green-700">{mappaResult.files_written?.[i] || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!isOk && mappaResult.errors && mappaResult.errors.length > 0 && (
                <div className="text-sm text-red-700 bg-red-50 rounded-lg p-3">
                  {mappaResult.errors.map((e: string, i: number) => <p key={i}>❌ {e}</p>)}
                </div>
              )}
              {mappaResult.warnings && mappaResult.warnings.length > 0 && (
                <div className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
                  {mappaResult.warnings.map((w: string, i: number) => <p key={i}>⚠️ {w}</p>)}
                </div>
              )}
              <div className="flex items-center gap-3 pt-2">
                <button onClick={onReset}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition-colors">
                  <RefreshCw className="w-4 h-4" /> Importa un altro file
                </button>
                {onNavigate && (
                  <button onClick={() => onNavigate('pipeline-builder')}
                    className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                    <Zap className="w-4 h-4" /> Vai al Pipeline Builder <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );})()}

          {/* ── Normal wizard flow (sheet selector + preview) ── */}
          {!mappaResult && (<>
          <div className="bg-white border rounded-lg p-4 flex items-center gap-6">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Foglio</label>
              <select value={selectedSheet} onChange={e => setSelectedSheet(e.target.value)}
                className="border rounded-md px-3 py-1.5 text-sm">
                {parseResult.sheets.filter(s => s !== '_MAPPA').map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Riga intestazioni</label>
              <input type="number" min={1} max={20} value={headerRow}
                onChange={e => setHeaderRow(parseInt(e.target.value) || 1)}
                className="border rounded-md px-3 py-1.5 text-sm w-20" />
            </div>
            <div className="text-sm text-gray-500">
              {parseResult.columns.length} colonne • {parseResult.total_rows} righe dati
            </div>
          </div>
          {parseResult.rows.length > 0 && (
            <div className="bg-white border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b bg-gray-50 flex items-center gap-2">
                <Table2 className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Anteprima</span>
              </div>
              <div className="overflow-x-auto">
                <table className="text-xs w-full border-collapse">
                  <thead><tr className="bg-gray-100">
                    {parseResult.columns.map(col => (
                      <th key={col} className="text-left px-3 py-2 border-b font-semibold text-gray-600 whitespace-nowrap">{col}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {parseResult.rows.slice(0, 15).map((row, i) => (
                      <tr key={i} className="hover:bg-blue-50/50">
                        {parseResult.columns.map(col => (
                          <td key={col} className={`px-3 py-1.5 border-b whitespace-nowrap ${row[col] == null ? 'text-gray-300' : 'text-gray-800'}`}>
                            {row[col] != null ? String(row[col]) : '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>)}
        </>
      )}

      <div className="flex justify-end">
        {!mappaResult && (
          <button disabled={!parseResult || parseResult.columns.length === 0} onClick={onNext}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-colors ${
              parseResult ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}>Avanti <ChevronRight className="w-4 h-4" /></button>
        )}
      </div>
    </div>
  );
}

// ==========================================
// STEP 2: STRUTTURA TABELLA
// ==========================================
function Step2Structure({ parseResult, keyColumns, setKeyColumns, outputColumns, setOutputColumns, nomeTabella, setNomeTabella, keyConfigs, setKeyConfigs, loading, onBack, onNext }: {
  parseResult: ParseResult;
  keyColumns: string[]; setKeyColumns: (v: string[]) => void;
  outputColumns: string[]; setOutputColumns: (v: string[]) => void;
  nomeTabella: string; setNomeTabella: (v: string) => void;
  keyConfigs: Record<string, MatchType>; setKeyConfigs: (v: Record<string, MatchType>) => void;
  loading: boolean; onBack: () => void; onNext: () => void;
}) {
  const cols = parseResult.columns;

  const toggleKey = (col: string) => {
    if (keyColumns.includes(col)) {
      setKeyColumns(keyColumns.filter(c => c !== col));
      setOutputColumns([...outputColumns, col]);
      const next = { ...keyConfigs }; delete next[col]; setKeyConfigs(next);
    } else {
      setKeyColumns([...keyColumns, col]);
      setOutputColumns(outputColumns.filter(c => c !== col));
      const isNum = parseResult.rows.every(r => r[col] == null || typeof r[col] === 'number');
      setKeyConfigs({ ...keyConfigs, [col]: isNum ? 'lte' : 'exact' });
    }
  };

  useEffect(() => {
    if (keyColumns.length > 0 && outputColumns.length === 0) {
      setOutputColumns(cols.filter(c => !keyColumns.includes(c)));
    }
  }, [keyColumns]);

  const numericCols = useMemo(() =>
    cols.filter(col => parseResult.rows.every(r => r[col] == null || typeof r[col] === 'number')),
  [cols, parseResult.rows]);

  const canProceed = keyColumns.length > 0 && outputColumns.length > 0 && nomeTabella.trim();

  return (
    <div className="space-y-6">
      {/* Nome tabella */}
      <div className="bg-white border rounded-lg p-5">
        <label className="text-sm font-semibold text-gray-700 block mb-2">Nome tabella</label>
        <input type="text" value={nomeTabella}
          onChange={e => setNomeTabella(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
          placeholder="es. contattori_oleo" className="border rounded-md px-3 py-2 text-sm w-80" />
        <p className="text-xs text-gray-400 mt-1">Identificativo unico (usato nei JSON e nelle regole)</p>
      </div>

      {/* Selezione colonne */}
      <div className="bg-white border rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Colonne chiave e output</h3>
        <p className="text-xs text-gray-400 mb-4">
          Cliccate per alternare tra <span className="text-blue-600 font-semibold">chiave</span> (input) e <span className="text-green-600 font-semibold">output</span> (risultato).
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {cols.map(col => {
            const isKey = keyColumns.includes(col);
            const isNum = numericCols.includes(col);
            return (
              <button key={col} onClick={() => toggleKey(col)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all text-left ${
                  isKey ? 'bg-blue-100 border-blue-300 text-blue-800 ring-2 ring-blue-200'
                       : 'bg-green-50 border-green-200 text-green-800 hover:bg-green-100'
                }`}>
                <div className="flex items-center gap-2">
                  {isKey ? <Key className="w-3.5 h-3.5" /> : <Columns className="w-3.5 h-3.5" />}
                  <span className="truncate">{col}</span>
                </div>
                <div className="text-xs mt-0.5 opacity-60">
                  {isKey ? 'CHIAVE' : 'output'}{isNum && ' • numerico'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tipo match PER COLONNA */}
      {keyColumns.length > 0 && (
        <div className="bg-white border rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Tipo di match per ogni chiave</h3>
            <p className="text-xs text-gray-400 mt-1">Come confrontare il valore letto dal configuratore con la colonna della tabella.</p>
          </div>

          {keyColumns.map(col => {
            const mt = keyConfigs[col] || 'exact';
            const isNum = numericCols.includes(col);
            return (
              <div key={col} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                <div className="w-44 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-blue-600" />
                    <span className="font-mono text-sm font-bold text-gray-900">{col}</span>
                  </div>
                  {isNum && <span className="text-xs text-gray-400">numerico</span>}
                </div>
                <div className="flex gap-2 flex-1">
                  {isNum && (
                    <button onClick={() => setKeyConfigs({ ...keyConfigs, [col]: 'lte' })}
                      className={`px-3 py-2 rounded-lg border text-left transition-all flex-1 ${
                        mt === 'lte' ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-200' : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}>
                      <div className="text-sm font-semibold">≤ prima riga ≥</div>
                      <div className="text-xs text-gray-500 mt-0.5">Es: motore 7kW → riga 7.7kW</div>
                    </button>
                  )}
                  <button onClick={() => setKeyConfigs({ ...keyConfigs, [col]: 'exact' })}
                    className={`px-3 py-2 rounded-lg border text-left transition-all flex-1 ${
                      mt === 'exact' ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-200' : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}>
                    <div className="text-sm font-semibold">= esatto</div>
                    <div className="text-xs text-gray-500 mt-0.5">Match identico sul valore</div>
                  </button>
                </div>
              </div>
            );
          })}

          {keyColumns.some(c => keyConfigs[c] === 'lte') && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
              <strong>Esempio "≤ prima riga ≥":</strong> Se il motore è 7 kW e la tabella ha 4.4, 5.9, 7.7, 10 kW →
              seleziona 7.7 kW (prima riga con valore ≥ input).
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-gray-600 hover:bg-gray-100">
          <ChevronLeft className="w-4 h-4" /> Indietro</button>
        <button disabled={!canProceed || loading} onClick={onNext}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-colors ${
            canProceed && !loading ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}>
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analisi...</> : <>Avanti <ChevronRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}

// ==========================================
// STEP 3: MAPPING (campi + valori→articoli)
// ==========================================
function Step3Mapping({ analyzeResult, keyColumns, fieldMappings, setFieldMappings, valueMappings, setValueMappings, loading, onBack, onGenera }: {
  analyzeResult: AnalyzeResult; keyColumns: string[];
  fieldMappings: Record<string, FieldMapping>; setFieldMappings: (v: Record<string, FieldMapping>) => void;
  valueMappings: Record<string, ValueMapping>; setValueMappings: (v: Record<string, ValueMapping>) => void;
  loading: boolean; onBack: () => void; onGenera: () => void;
}) {
  const [tab, setTab] = useState<'fields' | 'values'>('fields');
  const mappedArticlesCount = Object.values(valueMappings).filter(v => v.tipo === 'articolo' && ((v.articoli && v.articoli.length > 0) || v.codice_articolo)).length;
  // Count only ART: columns for total
  const artDistinct = Object.entries(analyzeResult.distinct_values)
    .filter(([col]) => col.toUpperCase().startsWith('ART:') || col.toUpperCase().startsWith('ART '));
  const totalDistinct = (artDistinct.length > 0 ? artDistinct : Object.entries(analyzeResult.distinct_values))
    .reduce((s, [, v]) => s + v.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button onClick={() => setTab('fields')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium flex-1 justify-center transition-colors ${
            tab === 'fields' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}><Link2 className="w-4 h-4" /> Campi configuratore</button>
        <button onClick={() => setTab('values')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium flex-1 justify-center transition-colors ${
            tab === 'values' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}><Package className="w-4 h-4" /> Valori → Articoli
          {mappedArticlesCount > 0 && <span className="bg-green-100 text-green-700 text-xs px-1.5 rounded-full">{mappedArticlesCount}</span>}
        </button>
      </div>

      {tab === 'fields' && (
        <div className="bg-white border rounded-lg p-5 space-y-4">
          <p className="text-sm text-gray-600">
            Per ogni colonna chiave, indicate a quale campo/i del configuratore corrisponde.
            Se una colonna combina più campi (es. "diretto_50Hz" = avviamento + frequenza), usate "Campo composto".
          </p>
          {keyColumns.map(col => (
            <FieldMappingRow key={col} excelCol={col}
              candidates={analyzeResult.field_candidates[col] || []}
              allFields={analyzeResult.all_fields}
              mapping={fieldMappings[col] || { type: 'single' }}
              onChange={m => setFieldMappings({ ...fieldMappings, [col]: m })} />
          ))}
        </div>
      )}

      {tab === 'values' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-800">
              Per ogni valore distinto nelle colonne articolo (<code className="bg-blue-100 px-1 rounded">ART:</code>),
              cercate l'articolo corrispondente nell'anagrafica. Potete aggiungere più articoli per ogni valore.
            </p>
          </div>
          {(() => {
            // Mostra solo colonne ART: (o tutte se nessuna ART: trovata)
            const artEntries = Object.entries(analyzeResult.distinct_values)
              .filter(([col]) => col.toUpperCase().startsWith('ART:') || col.toUpperCase().startsWith('ART '));
            const entries = artEntries.length > 0 ? artEntries : Object.entries(analyzeResult.distinct_values);
            return entries.map(([col, values]) => (
              <ValueColumnCard key={col} column={col} values={values}
                valueMappings={valueMappings}
                onUpdate={(val, m) => setValueMappings({ ...valueMappings, [val]: m })} />
            ));
          })()}
        </div>
      )}

      {/* Warning campi compositi duplicati */}
      {Object.entries(fieldMappings).some(([, fm]) =>
        fm.type === 'composite' && fm.fields &&
        new Set(fm.fields.filter(f => f)).size < fm.fields.filter(f => f).length
      ) && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <span className="font-bold">⚠</span>
          <span>Uno o più campi compositi hanno campi duplicati. Correggi prima di generare.</span>
        </div>
      )}

      <div className="flex justify-between items-center">
        <button onClick={onBack} className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-gray-600 hover:bg-gray-100">
          <ChevronLeft className="w-4 h-4" /> Indietro</button>
        <span className="text-xs text-gray-400">{mappedArticlesCount}/{totalDistinct} valori mappati</span>
        <button disabled={loading || Object.entries(fieldMappings).some(([, fm]) =>
          fm.type === 'composite' && fm.fields &&
          new Set(fm.fields.filter((f: string) => f)).size < fm.fields.filter((f: string) => f).length
        )} onClick={onGenera}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-colors ${
            loading ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'
          }`}>
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Generazione...</> : <><Zap className="w-4 h-4" /> Genera</>}
        </button>
      </div>
    </div>
  );
}

// ==========================================
// FIELD MAPPING ROW (singolo o composito)
// ==========================================
function FieldMappingRow({ excelCol, candidates, allFields, mapping, onChange }: {
  excelCol: string; candidates: FieldCandidate[]; allFields: AllField[];
  mapping: FieldMapping; onChange: (m: FieldMapping) => void;
}) {
  const isComposite = mapping.type === 'composite';
  const fields = isComposite ? (mapping.fields || ['', '']) : [mapping.field || ''];
  const separator = mapping.separator || '_';

  const setField = (idx: number, val: string) => {
    if (isComposite) {
      const next = [...(mapping.fields || ['', ''])];
      next[idx] = val;
      onChange({ ...mapping, fields: next });
    } else {
      onChange({ ...mapping, field: val });
    }
  };

  const addField = () => {
    onChange({ type: 'composite', fields: [...fields, ''], separator });
  };

  const removeField = (idx: number) => {
    const next = fields.filter((_, i) => i !== idx);
    if (next.length <= 1) {
      onChange({ type: 'single', field: next[0] || '' });
    } else {
      onChange({ type: 'composite', fields: next, separator });
    }
  };

  const toggleComposite = () => {
    if (isComposite) {
      onChange({ type: 'single', field: fields[0] || '' });
    } else {
      onChange({ type: 'composite', fields: [fields[0] || '', ''], separator: '_' });
    }
  };

  const isMapped = isComposite
    ? fields.every(f => f && !f.startsWith('TODO'))
    : !!(mapping.field && !mapping.field.startsWith('TODO'));

  // Check campi duplicati nel composito
  const hasDuplicateFields = isComposite && fields.filter(f => f).length > 0
    && new Set(fields.filter(f => f)).size < fields.filter(f => f).length;

  return (
    <div className="p-4 bg-gray-50 rounded-lg space-y-3">
      {/* Header: nome colonna Excel + toggle composito */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-blue-600" />
          <span className="font-mono text-sm font-bold text-gray-900">{excelCol}</span>
          <ArrowRight className={`w-4 h-4 ${isMapped ? 'text-green-500' : 'text-gray-300'}`} />
          {isMapped && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        </div>
        <button onClick={toggleComposite}
          className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
            isComposite ? 'bg-purple-100 border-purple-300 text-purple-700' : 'bg-white border-gray-200 text-gray-500 hover:border-purple-300'
          }`}>
          {isComposite ? '✦ Composto' : '1 campo'}
        </button>
      </div>

      {/* Campi */}
      {fields.map((field, idx) => (
        <div key={idx} className="flex items-center gap-2">
          {isComposite && (
            <span className="text-xs text-gray-400 w-6 text-center">{idx + 1}.</span>
          )}
          <FieldPicker
            value={field}
            candidates={idx === 0 ? candidates : []}
            allFields={allFields}
            onChange={v => setField(idx, v)}
          />
          {isComposite && fields.length > 2 && (
            <button onClick={() => removeField(idx)} className="p-1 text-gray-400 hover:text-red-500">
              <Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      ))}

      {/* Composito: separatore + aggiungi */}
      {isComposite && (
        <div className="space-y-2 pt-1">
          {hasDuplicateFields && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <span className="font-bold">⚠ Errore:</span>
              <span>Ogni parte del composito deve mappare un campo diverso. Campi duplicati produrranno valori errati (es. "Diretto_Diretto" invece di "Diretto_50").</span>
            </div>
          )}
          <div className="flex items-center gap-3">
          <button onClick={addField} className="flex items-center gap-1 px-2 py-1 text-xs bg-white border rounded hover:border-blue-400 text-gray-600">
            <Plus className="w-3 h-3" /> Aggiungi campo
          </button>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Separatore:</span>
            <input type="text" value={separator}
              onChange={e => onChange({ ...mapping, separator: e.target.value })}
              className="border rounded px-2 py-0.5 text-xs w-12 text-center font-mono" />
          </div>
          <span className="text-xs text-gray-400">
            A runtime: <code className="bg-gray-200 px-1 rounded">
              {fields.map(f => f ? f.split('.').pop() : '?').join(separator)}
            </code>
          </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// FIELD PICKER (singolo campo con candidati)
// ==========================================
function FieldPicker({ value, candidates, allFields, onChange }: {
  value: string; candidates: FieldCandidate[]; allFields: AllField[];
  onChange: (v: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = showAll ? allFields.filter(f =>
    !search || f.field.toLowerCase().includes(search.toLowerCase()) ||
    (f.etichetta || '').toLowerCase().includes(search.toLowerCase())
  ) : [];

  const selectedLabel = (() => {
    const found = allFields.find(f => f.field === value);
    return found ? `${found.etichetta} (${found.field})` : value || '— non collegato —';
  })();
  const isMapped = !!value && !value.startsWith('TODO');

  return (
    <div className="flex-1">
      {candidates.length > 0 && !showAll && !isMapped && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {candidates.slice(0, 5).map(c => (
            <button key={c.field} onClick={() => onChange(c.field)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                value === c.field ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300'
              }`}>{c.etichetta || c.codice}</button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className={`flex-1 px-3 py-1.5 rounded-md text-sm border truncate ${
          isMapped ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          {isMapped && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />}
          {!isMapped && <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />}
          {selectedLabel}
        </div>
        <button onClick={() => setShowAll(!showAll)}
          className="px-2.5 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-md border border-blue-200 whitespace-nowrap">
          {showAll ? 'Chiudi' : 'Cerca'}</button>
        {isMapped && <button onClick={() => onChange('')} className="p-1 text-gray-400 hover:text-red-500 rounded"><Unlink className="w-3.5 h-3.5" /></button>}
      </div>
      {showAll && (
        <div className="mt-2 border rounded-md bg-white max-h-48 overflow-hidden shadow-lg">
          <div className="p-2 border-b">
            <input type="text" placeholder="Cerca campo..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full px-2 py-1 text-sm border rounded" autoFocus />
          </div>
          <div className="max-h-36 overflow-y-auto">
            {filtered.slice(0, 30).map(f => (
              <button key={f.field} onClick={() => { onChange(f.field); setShowAll(false); setSearch(''); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 flex justify-between ${value === f.field ? 'bg-blue-100' : ''}`}>
                <span className="font-semibold">{f.etichetta || f.codice}</span>
                <span className="text-gray-400 font-mono">{f.field}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// VALUE COLUMN CARD
// ==========================================
function ValueColumnCard({ column, values, valueMappings, onUpdate }: {
  column: string; values: string[];
  valueMappings: Record<string, ValueMapping>; onUpdate: (val: string, m: ValueMapping) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const mapped = values.filter(v => {
    const m = valueMappings[v];
    return m?.tipo === 'articolo' && ((m.articoli && m.articoli.length > 0) || m.codice_articolo);
  }).length;

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50">
        <div className="flex items-center gap-3">
          <Columns className="w-4 h-4 text-gray-500" />
          <span className="font-semibold text-sm text-gray-800">{column}</span>
          <span className="text-xs text-gray-400">{values.length} valori</span>
          {mapped > 0 && <span className="text-xs bg-green-100 text-green-700 px-1.5 rounded-full">{mapped} mappati</span>}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-1.5 border-t pt-3">
          {values.map(val => (
            <ValueRow key={val} value={val} mapping={valueMappings[val] || { tipo: '' }}
              onChange={m => onUpdate(val, m)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// VALUE ROW
// ==========================================
function ValueRow({ value, mapping, onChange }: {
  value: string; mapping: ValueMapping; onChange: (m: ValueMapping) => void;
}) {
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<ArticoloSearch[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoadingSearch(true);
    try {
      const res = await fetch(`${API_BASE}/articoli/search?q=${encodeURIComponent(q)}&limit=8`);
      setResults(await res.json());
    } catch { setResults([]); }
    setLoadingSearch(false);
  }, []);

  const onSearchChange = (q: string) => {
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q), 300);
  };

  // Normalize: get articles array (backward compat with single codice_articolo)
  const articoli = mapping.articoli && mapping.articoli.length > 0
    ? mapping.articoli
    : (mapping.codice_articolo ? [{ codice: mapping.codice_articolo, descrizione: mapping.descrizione_articolo || '', id: mapping.articolo_id, quantita: 1 }] : []);

  const addArticolo = (art: ArticoloSearch) => {
    const next = [...articoli, { codice: art.codice, descrizione: art.descrizione, id: art.id, quantita: 1 }];
    onChange({ tipo: 'articolo', articoli: next });
    setSearching(false); setSearchQuery(''); setResults([]);
  };

  const removeArticolo = (idx: number) => {
    const next = articoli.filter((_, i) => i !== idx);
    if (next.length === 0) {
      onChange({ tipo: '' });
    } else {
      onChange({ tipo: 'articolo', articoli: next });
    }
  };

  const updateQuantita = (idx: number, q: number) => {
    const next = [...articoli];
    next[idx] = { ...next[idx], quantita: Math.max(1, q) };
    onChange({ tipo: 'articolo', articoli: next });
  };

  const isArticolo = mapping.tipo === 'articolo' && articoli.length > 0;

  return (
    <div className="py-1">
      <div className="flex items-start gap-3">
        <span className="w-28 flex-shrink-0 font-mono text-sm font-semibold bg-gray-100 px-2 py-0.5 rounded text-gray-800 truncate mt-0.5" title={value}>{value}</span>
        <ArrowRight className={`w-3.5 h-3.5 flex-shrink-0 mt-1 ${isArticolo ? 'text-green-500' : mapping.tipo === 'parametro' ? 'text-blue-400' : 'text-gray-300'}`} />
        <div className="flex-1 min-w-0 space-y-1">
          {/* Articoli mappati */}
          {isArticolo && articoli.map((art, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <span className="flex-1 px-2.5 py-1 bg-green-50 border border-green-200 rounded text-xs text-green-800 truncate">
                <Package className="w-3 h-3 inline mr-1" />{art.codice} — {art.descrizione}
              </span>
              <div className="flex items-center gap-0.5">
                <span className="text-[10px] text-gray-400">qtà</span>
                <input type="number" min={1} value={art.quantita} onChange={e => updateQuantita(idx, parseInt(e.target.value) || 1)}
                  className="w-12 text-center text-xs border rounded px-1 py-0.5" />
              </div>
              <button onClick={() => removeArticolo(idx)} className="p-0.5 text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}

          {/* Aggiungi altro articolo (se già ha articoli) */}
          {isArticolo && !searching && (
            <button onClick={() => { setSearching(true); setSearchQuery(value); doSearch(value); }}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-green-600 hover:bg-green-50 rounded border border-dashed border-green-300">
              <Plus className="w-3 h-3" /> Aggiungi articolo
            </button>
          )}

          {/* Parametro */}
          {mapping.tipo === 'parametro' && (
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">Parametro</span>
              <button onClick={() => onChange({ tipo: '' })} className="p-0.5 text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* Non mappato — bottoni azione */}
          {!mapping.tipo && !searching && (
            <div className="flex items-center gap-2">
              <button onClick={() => { setSearching(true); setSearchQuery(value); doSearch(value); }}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-white border rounded hover:border-blue-400 text-gray-600">
                <SearchIcon className="w-3 h-3" /> Cerca articolo</button>
              <button onClick={() => onChange({ tipo: 'parametro' })}
                className="px-2 py-1 text-xs bg-white border rounded hover:border-blue-400 text-gray-500">Parametro</button>
            </div>
          )}

          {/* Search box */}
          {searching && (
            <div className="relative">
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <SearchIcon className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" value={searchQuery} onChange={e => onSearchChange(e.target.value)}
                    placeholder="Cerca codice o descrizione..."
                    className="w-full pl-7 pr-2 py-1.5 text-xs border rounded focus:border-blue-400 focus:ring-1 focus:ring-blue-200" autoFocus />
                </div>
                <button onClick={() => { setSearching(false); setSearchQuery(''); setResults([]); }}><X className="w-3.5 h-3.5 text-gray-400" /></button>
              </div>
              {(results.length > 0 || loadingSearch) && (
                <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow-lg max-h-40 overflow-y-auto">
                  {loadingSearch && <div className="p-2 text-xs text-gray-400 text-center"><Loader2 className="w-3 h-3 animate-spin inline mr-1" />Ricerca...</div>}
                  {results.map(art => (
                    <button key={art.id} onClick={() => addArticolo(art)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 border-b last:border-0">
                      <span className="font-semibold">{art.codice}</span>
                      <span className="text-gray-500 ml-2">{art.descrizione}</span>
                    </button>
                  ))}
                  {!loadingSearch && results.length === 0 && searchQuery.length >= 2 && (
                    <div className="p-2 text-xs text-gray-400 text-center">Nessun risultato</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// STEP 4: RISULTATO
// ==========================================
function Step4Result({ result, onReset, onBack, onNavigate }: { result: GeneraResult; onReset: () => void; onBack: () => void; onNavigate?: (section: string) => void }) {
  return (
    <div className="space-y-6">
      <div className={`rounded-lg p-6 flex items-start gap-4 ${
        result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
      }`}>
        {result.success ? <CheckCircle2 className="w-8 h-8 text-green-600 flex-shrink-0" />
                        : <AlertCircle className="w-8 h-8 text-red-600 flex-shrink-0" />}
        <div>
          <h2 className={`text-lg font-bold ${result.success ? 'text-green-800' : 'text-red-800'}`}>
            {result.success ? 'Importazione completata!' : 'Errore'}</h2>
          {result.success && (
            <div className="text-green-700 mt-2 space-y-1 text-sm">
              <p>• Data table <code className="bg-green-100 px-1 rounded font-mono">{result.data_table}.json</code> ({result.rows_imported} righe)</p>
              <p>• Regola <code className="bg-green-100 px-1 rounded font-mono">{result.rule_id}</code> {result.has_todo ? '(bozza)' : 'pronta'}</p>
              {result.value_mappings_count > 0 && <p>• {result.value_mappings_count} valori → articoli</p>}
            </div>
          )}
        </div>
      </div>
      {result.warnings?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          {result.warnings.map((w, i) => <p key={i} className="text-sm text-amber-700">• {w}</p>)}
        </div>
      )}
      <div className="flex justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-gray-600 hover:bg-gray-100">
            <ChevronLeft className="w-4 h-4" /> Indietro</button>
          <button onClick={onReset} className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-gray-600 hover:bg-gray-100">
            <RefreshCw className="w-4 h-4" /> Nuova importazione</button>
        </div>
        <button onClick={() => onNavigate?.('rule-engine')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-blue-600 hover:bg-blue-50">
          <ExternalLink className="w-4 h-4" /> Apri Rule Engine</button>
      </div>
    </div>
  );
}
