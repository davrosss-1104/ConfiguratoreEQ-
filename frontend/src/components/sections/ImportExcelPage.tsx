import { useState, useCallback, useRef } from 'react';
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ChevronRight,
  ChevronLeft, Loader2, Table2, Eye, Download, RefreshCw, Info, X,
  ChevronDown, ChevronUp, Package, Link2, AlertTriangle
} from 'lucide-react';

const API_BASE = 'http://localhost:8000';

// ==========================================
// TYPES
// ==========================================
interface FascaCalcolata {
  valore: number;
  da: number;
  a: number;
}

interface TablePreview {
  foglio: string;
  tipo: string;
  nome_tabella: string;
  colonna_chiave: string;
  tipo_chiave: string;
  partizionato_per: string | null;
  valore_partizione: string | null;
  righe: number;
  colonne_tecniche: string[];
  colonne_articoli: string[];
  anteprima: Record<string, any>[];
  fasce_calcolate?: FascaCalcolata[];
}

interface PreviewResult {
  success: boolean;
  filename: string;
  mappa: TablePreview[];
  errors: string[];
  warnings: string[];
}

interface RuleDetail {
  rule_id: string;
  has_todo: boolean;
  is_draft?: boolean;
  input_field: string;
  input_score: number;
  partition_field: string;
  partition_score: number;
}

interface GeneraResult {
  success: boolean;
  tables_generated: string[];
  rules_generated: string[];
  rules_details: RuleDetail[];
  files_written: string[];
  errors: string[];
  warnings: string[];
  original_saved?: string;
}

// ==========================================
// COMPONENTE PRINCIPALE
// ==========================================
export default function ImportExcelPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<GeneraResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep(1);
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Importa da Excel</h1>
          <p className="text-gray-600 text-sm mt-1">
            Carica un file Excel con foglio _MAPPA per generare tabelle lookup e regole
          </p>
        </div>
      </header>

      {/* Stepper */}
      <div className="max-w-5xl mx-auto px-6 mt-6">
        <div className="flex items-center gap-2">
          <StepIndicator num={1} label="Upload" active={step === 1} done={step > 1} />
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <StepIndicator num={2} label="Verifica" active={step === 2} done={step > 2} />
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <StepIndicator num={3} label="Risultato" active={step === 3} done={false} />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-6">
        {step === 1 && (
          <StepUpload
            file={file}
            setFile={setFile}
            loading={loading}
            error={error}
            onNext={async (f) => {
              setLoading(true);
              setError(null);
              try {
                const formData = new FormData();
                formData.append('file', f);
                const res = await fetch(`${API_BASE}/import-excel/preview`, {
                  method: 'POST',
                  body: formData,
                });
                const data: PreviewResult = await res.json();
                if (data.success) {
                  setPreview(data);
                  setStep(2);
                } else {
                  setError(data.errors?.join('\n') || 'Errore nella validazione');
                }
              } catch (e: any) {
                setError(e.message || 'Errore di connessione');
              } finally {
                setLoading(false);
              }
            }}
          />
        )}

        {step === 2 && preview && (
          <StepVerifica
            preview={preview}
            file={file!}
            loading={loading}
            onBack={() => setStep(1)}
            onGenera={async () => {
              setLoading(true);
              setError(null);
              try {
                const formData = new FormData();
                formData.append('file', file!);
                const res = await fetch(`${API_BASE}/import-excel/genera`, {
                  method: 'POST',
                  body: formData,
                });
                const data: GeneraResult = await res.json();
                setResult(data);
                setStep(3);
              } catch (e: any) {
                setError(e.message || 'Errore di connessione');
              } finally {
                setLoading(false);
              }
            }}
          />
        )}

        {step === 3 && result && (
          <StepRisultato result={result} onReset={reset} />
        )}
      </div>
    </div>
  );
}

// ==========================================
// STEP INDICATOR
// ==========================================
function StepIndicator({ num, label, active, done }: {
  num: number; label: string; active: boolean; done: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
      active ? 'bg-blue-50 text-blue-700' :
      done ? 'text-green-700' : 'text-gray-400'
    }`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold ${
        active ? 'bg-blue-600 text-white' :
        done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
      }`}>
        {done ? '✓' : num}
      </div>
      <span className="font-medium text-sm">{label}</span>
    </div>
  );
}

// ==========================================
// STEP 1: UPLOAD
// ==========================================
function StepUpload({ file, setFile, loading, error, onNext }: {
  file: File | null;
  setFile: (f: File | null) => void;
  loading: boolean;
  error: string | null;
  onNext: (f: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((f: File) => {
    if (f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) {
      setFile(f);
    }
  }, [setFile]);

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
          dragOver ? 'border-blue-400 bg-blue-50' :
          file ? 'border-green-300 bg-green-50' :
          'border-gray-300 hover:border-gray-400 bg-white'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileSpreadsheet className="w-8 h-8 text-green-600" />
            <div className="text-left">
              <p className="font-semibold text-gray-900">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
              className="ml-4 p-1 hover:bg-gray-200 rounded"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">Trascinate il file Excel qui</p>
            <p className="text-sm text-gray-400 mt-1">oppure cliccate per selezionarlo</p>
            <p className="text-xs text-gray-400 mt-3">
              Il file deve contenere un foglio chiamato <code className="bg-gray-100 px-1 rounded font-mono">_MAPPA</code>
            </p>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-700 whitespace-pre-wrap">{error}</div>
        </div>
      )}

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold mb-1">Come preparare il file Excel</p>
          <ul className="space-y-1 text-blue-700">
            <li>• Aggiungete un foglio <code className="bg-blue-100 px-1 rounded font-mono text-xs">_MAPPA</code> che descrive la struttura dei dati</li>
            <li>• I fogli dati devono avere intestazioni nella prima riga e dati dalla seconda</li>
            <li>• Le colonne con prefisso <code className="bg-blue-100 px-1 rounded font-mono text-xs">ART:</code> vengono trattate come codici articolo</li>
          </ul>
        </div>
      </div>

      {/* Next button */}
      <div className="flex justify-end">
        <button
          disabled={!file || loading}
          onClick={() => file && onNext(file)}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-colors ${
            file && !loading
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Analisi in corso...</>
          ) : (
            <><Eye className="w-4 h-4" /> Analizza file</>
          )}
        </button>
      </div>
    </div>
  );
}

// ==========================================
// STEP 2: VERIFICA
// ==========================================
function StepVerifica({ preview, file, loading, onBack, onGenera }: {
  preview: PreviewResult;
  file: File;
  loading: boolean;
  onBack: () => void;
  onGenera: () => void;
}) {
  // Raggruppa per nome_tabella
  const grouped: Record<string, TablePreview[]> = {};
  for (const t of preview.mappa) {
    if (!grouped[t.nome_tabella]) grouped[t.nome_tabella] = [];
    grouped[t.nome_tabella].push(t);
  }

  return (
    <div className="space-y-6">
      {/* Riepilogo */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <FileSpreadsheet className="w-5 h-5 text-green-600" />
          <div>
            <p className="font-semibold text-gray-900">{preview.filename}</p>
            <p className="text-sm text-gray-500">
              {Object.keys(grouped).length} tabella/e trovata/e, {preview.mappa.length} foglio/i dati
            </p>
          </div>
        </div>
      </div>

      {/* Tabelle trovate */}
      {Object.entries(grouped).map(([nome, tables]) => (
        <TableCard key={nome} nome={nome} tables={tables} />
      ))}

      {/* Warnings */}
      {preview.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="font-semibold text-amber-800 flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4" /> Avvisi
          </p>
          {preview.warnings.map((w, i) => (
            <p key={i} className="text-sm text-amber-700">• {w}</p>
          ))}
        </div>
      )}

      {/* Buttons */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Indietro
        </button>
        <button
          disabled={loading}
          onClick={onGenera}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-colors ${
            loading
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generazione in corso...</>
          ) : (
            <><Download className="w-4 h-4" /> Genera tabelle e regole</>
          )}
        </button>
      </div>
    </div>
  );
}

// ==========================================
// TABLE CARD (preview di una tabella)
// ==========================================
function TableCard({ nome, tables }: { nome: string; tables: TablePreview[] }) {
  const [expanded, setExpanded] = useState(false);
  const [showPreview, setShowPreview] = useState<string | null>(null);

  const first = tables[0];
  const tipoLabel = {
    lookup_range: 'Lookup per range numerico',
    catalogo: 'Catalogo prodotti',
    costanti: 'Tabella costanti',
  }[first.tipo] || first.tipo;

  const totalRows = tables.reduce((s, t) => s + t.righe, 0);
  const hasArt = tables.some(t => t.colonne_articoli.length > 0);

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <Table2 className="w-5 h-5 text-blue-600" />
          <div>
            <p className="font-semibold text-gray-900">{nome}</p>
            <p className="text-sm text-gray-500">
              {tipoLabel} • {totalRows} righe totali • {tables.length} foglio/i
              {hasArt && (
                <span className="ml-2 inline-flex items-center gap-1 text-green-700">
                  <Package className="w-3.5 h-3.5" /> con codici articolo
                </span>
              )}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </div>

      {/* Dettaglio */}
      {expanded && (
        <div className="border-t px-4 pb-4">
          {tables.map((t) => (
            <div key={t.foglio} className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-medium text-gray-800 text-sm">
                    Foglio: <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{t.foglio}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t.righe} righe • Chiave: {t.colonna_chiave} ({t.tipo_chiave})
                    {t.partizionato_per && ` • Partizione: ${t.partizionato_per}=${t.valore_partizione}`}
                  </p>
                </div>
                <button
                  onClick={() => setShowPreview(showPreview === t.foglio ? null : t.foglio)}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {showPreview === t.foglio ? 'Nascondi' : 'Anteprima'}
                </button>
              </div>

              {/* Colonne */}
              <div className="flex flex-wrap gap-1 mb-2">
                {t.colonne_tecniche.map((col) => (
                  <span key={col} className={`text-xs px-2 py-0.5 rounded-full ${
                    col === t.colonna_chiave
                      ? 'bg-blue-100 text-blue-800 font-semibold'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {col}
                  </span>
                ))}
                {t.colonne_articoli.map((col) => (
                  <span key={col} className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                    {col}
                  </span>
                ))}
              </div>

              {/* Fasce calcolate (per lookup_range) */}
              {showPreview === t.foglio && t.fasce_calcolate && (
                <div className="mt-2 bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Fasce calcolate:</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1">
                    {t.fasce_calcolate.map((f, i) => (
                      <div key={i} className="text-xs bg-white border rounded px-2 py-1">
                        <span className="font-semibold">{f.valore}</span>
                        <span className="text-gray-400 ml-1">[{f.da}, {f.a ?? '∞'})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Anteprima dati */}
              {showPreview === t.foglio && t.anteprima.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        {t.colonne_tecniche.map((col) => (
                          <th key={col} className={`text-left px-2 py-1.5 border font-semibold ${
                            col === t.colonna_chiave ? 'text-blue-700 bg-blue-50' : 'text-gray-600'
                          }`}>
                            {col}
                          </th>
                        ))}
                        {t.colonne_articoli.map((col) => (
                          <th key={col} className="text-left px-2 py-1.5 border font-semibold text-green-700 bg-green-50">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {t.anteprima.map((row, i) => (
                        <tr key={i} className="hover:bg-blue-50">
                          {t.colonne_tecniche.map((col) => (
                            <td key={col} className={`px-2 py-1 border ${
                              row[col] == null ? 'text-gray-300 italic' : 'text-gray-800'
                            }`}>
                              {row[col] != null ? String(row[col]) : '—'}
                            </td>
                          ))}
                          {t.colonne_articoli.map((col) => (
                            <td key={col} className={`px-2 py-1 border ${
                              row._articoli?.[col] ? 'text-green-800 font-mono' : 'text-gray-300'
                            }`}>
                              {row._articoli?.[col] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {t.righe > 5 && (
                    <p className="text-xs text-gray-400 mt-1">
                      Mostrate prime 5 di {t.righe} righe
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// STEP 3: RISULTATO
// ==========================================
function StepRisultato({ result, onReset }: {
  result: GeneraResult;
  onReset: () => void;
}) {
  const hasAnyTodo = result.rules_details?.some(r => r.has_todo) ?? false;
  const allMatched = result.rules_details?.length > 0 && !hasAnyTodo;

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className={`rounded-lg p-6 flex items-start gap-4 ${
        result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
      }`}>
        {result.success ? (
          <CheckCircle2 className="w-8 h-8 text-green-600 flex-shrink-0" />
        ) : (
          <AlertCircle className="w-8 h-8 text-red-600 flex-shrink-0" />
        )}
        <div>
          <h2 className={`text-lg font-bold ${result.success ? 'text-green-800' : 'text-red-800'}`}>
            {result.success ? 'Generazione completata' : 'Errori durante la generazione'}
          </h2>
          {result.success && (
            <p className="text-green-700 mt-1">
              {result.tables_generated.length} tabella/e e {result.rules_generated.length} regola/e generate con successo.
            </p>
          )}
        </div>
      </div>

      {/* Files generati */}
      {result.success && (
        <div className="bg-white border rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-3">File generati</h3>

          {result.tables_generated.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-600 mb-2">Tabelle dati</p>
              {result.tables_generated.map((t) => (
                <div key={t} className="flex items-center gap-2 py-1.5">
                  <Table2 className="w-4 h-4 text-blue-500" />
                  <code className="text-sm font-mono text-gray-800">{t}.json</code>
                </div>
              ))}
            </div>
          )}

          {result.rules_generated.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-600 mb-2">Regole lookup</p>
              {result.rules_details?.map((rd) => (
                <div key={rd.rule_id} className="py-2 border-b last:border-b-0">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className={`w-4 h-4 ${rd.is_draft ? 'text-amber-500' : 'text-green-500'}`} />
                    <code className="text-sm font-mono text-gray-800">{rd.rule_id}</code>
                    {rd.is_draft ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                        bozza materiali · disabilitata
                      </span>
                    ) : rd.has_todo ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                        da completare
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                        campi collegati
                      </span>
                    )}
                  </div>
                  {/* Dettaglio matching */}
                  <div className="ml-6 mt-1 space-y-0.5">
                    {rd.is_draft ? (
                      <p className="text-xs text-amber-600">
                        {rd.input_field} — Abilitatela dopo aver verificato condizioni e codici articolo
                      </p>
                    ) : (
                      <>
                        <MatchingLine
                          label="Input"
                          field={rd.input_field}
                          score={rd.input_score}
                        />
                        {rd.partition_field && (
                          <MatchingLine
                            label="Partizione"
                            field={rd.partition_field}
                            score={rd.partition_score}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prossimi passi */}
      {result.success && (
        <div className={`border rounded-lg p-4 ${
          hasAnyTodo ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'
        }`}>
          <p className={`font-semibold flex items-center gap-2 mb-2 ${
            hasAnyTodo ? 'text-amber-800' : 'text-blue-800'
          }`}>
            {hasAnyTodo ? (
              <><AlertTriangle className="w-4 h-4" /> Attenzione</>
            ) : (
              <><Info className="w-4 h-4" /> Prossimi passi</>
            )}
          </p>
          <ul className={`space-y-1 text-sm ${hasAnyTodo ? 'text-amber-700' : 'text-blue-700'}`}>
            <li>• Le tabelle lookup sono state generate e sono pronte per l'uso</li>
            {allMatched ? (
              <>
                <li>• Le regole lookup sono state create con i campi del configuratore collegati automaticamente</li>
                <li>• Verificate i collegamenti nel Rule Designer e correggete se necessario</li>
              </>
            ) : hasAnyTodo ? (
              <>
                <li>• Alcune regole hanno campi <code className="bg-amber-100 px-1 rounded font-mono text-xs">TODO.*</code> non trovati nel configuratore</li>
                <li>• Aprite le regole nel Rule Designer per collegare manualmente i campi mancanti</li>
              </>
            ) : (
              <li>• Aprite le regole nel Rule Designer per verificare i collegamenti</li>
            )}
            <li>• Le regole materiali sono state create come <strong>bozze disabilitate</strong> — abilitatele dopo aver verificato condizioni e codici articolo</li>
            <li>• Se servono scenari diversi (es: diretto vs stella-triangolo), duplicate la regola materiali e aggiungete le condizioni appropriate</li>
          </ul>
        </div>
      )}

      {/* Errori */}
      {result.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="font-semibold text-red-800 mb-2">Errori</p>
          {result.errors.map((e, i) => (
            <p key={i} className="text-sm text-red-700">• {e}</p>
          ))}
        </div>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="font-semibold text-amber-800 mb-2">Avvisi</p>
          {result.warnings.map((w, i) => (
            <p key={i} className="text-sm text-amber-700">• {w}</p>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-gray-600 hover:bg-gray-100 border transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Importa un altro file
        </button>
      </div>
    </div>
  );
}

// ==========================================
// MATCHING LINE (dettaglio collegamento campo)
// ==========================================
function MatchingLine({ label, field, score }: {
  label: string;
  field: string;
  score: number;
}) {
  const isTodo = field.startsWith('TODO.');
  const confidence = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-gray-500 w-16">{label}:</span>
      {isTodo ? (
        <>
          <code className="font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">{field}</code>
          <span className="text-amber-600">— nessun campo trovato</span>
        </>
      ) : (
        <>
          <Link2 className="w-3 h-3 text-green-500" />
          <code className="font-mono text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">{field}</code>
          <span className={`px-1.5 py-0.5 rounded-full font-medium ${
            confidence === 'high' ? 'bg-green-100 text-green-700' :
            confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
            'bg-orange-100 text-orange-700'
          }`}>
            {confidence === 'high' ? 'ottimo' : confidence === 'medium' ? 'buono' : 'da verificare'}
          </span>
        </>
      )}
    </div>
  );
}
