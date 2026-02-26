/**
 * RuleTestPanel.tsx — Pannello diagnostica regole
 * Posizionare in: frontend/src/components/RuleTestPanel.tsx
 */
import { useState } from 'react';
import {
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Loader2,
  FlaskConical, Search, Package, Zap, AlertTriangle, Eye
} from 'lucide-react';

const API = 'http://localhost:8000';

interface TestReport {
  preventivo_id: number;
  context_initial: Record<string, any>;
  context_after_lookups: Record<string, any>;
  lookup_results: LookupResult[];
  material_results: MaterialResult[];
  rules_loaded: RuleInfo[];
  summary: Summary;
}

interface RuleInfo {
  id: string; enabled: boolean; priority: number;
  type: string; source: string;
}

interface ConditionDetail {
  field: string; operator: string;
  expected: any; actual: any; result: boolean;
}

interface LookupResult {
  rule_id: string; enabled: boolean;
  conditions_detail: ConditionDetail[];
  conditions_result: boolean;
  actions_result: ActionResult[];
  value_mapping_materials?: VmMaterial[];
  skip_reason?: string;
}

interface ActionResult {
  action: string; tabella: string;
  input_field?: string; input_value?: any;
  partition_field?: string; partition_value?: any;
  inputs?: any[];
  values_written: Record<string, any>;
}

interface VmMaterial {
  source: string; ctx_key: string; ctx_value: string;
  codice: string; descrizione: string; quantita: number;
}

interface MaterialResult {
  rule_id: string; enabled: boolean;
  conditions_detail: ConditionDetail[];
  conditions_result: boolean;
  materials_would_add: MaterialWould[];
  skip_reason?: string;
}

interface MaterialWould {
  codice_template: string; codice_resolved: string;
  descrizione: string; quantita: number; unresolved: boolean;
}

interface Summary {
  total_rules: number; lookup_rules: number; material_rules: number;
  active_lookups: number; active_materials: number;
  materials_would_add: number; vm_materials?: number;
  calc_values: number;
  warnings: string[]; errors: string[];
}

export default function RuleTestPanel({ preventivoId }: { preventivoId: number }) {
  const [report, setReport] = useState<TestReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [sections, setSections] = useState({
    summary: true, lookups: true, calc: false, materials: true, context: false
  });

  const toggle = (s: keyof typeof sections) =>
    setSections(prev => ({ ...prev, [s]: !prev[s] }));

  const runTest = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/preventivi/${preventivoId}/test-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReport(await res.json());
      setExpanded(true);
    } catch (e: any) {
      alert('Errore test regole: ' + e.message);
    }
    setLoading(false);
  };

  const calcValues = report?.context_after_lookups || {};
  const allVmMaterials = (report?.lookup_results || [])
    .flatMap(r => r.value_mapping_materials || []);

  return (
    <div className="bg-white border-2 border-purple-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3 flex items-center justify-between bg-purple-50 hover:bg-purple-100 transition-colors cursor-pointer select-none">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-purple-600" />
          <span className="font-semibold text-purple-900">Test Regole</span>
          {report && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              (report.summary.errors?.length > 0) ? 'bg-red-100 text-red-700' :
              report.summary.materials_would_add > 0 ? 'bg-green-100 text-green-700' :
              'bg-amber-100 text-amber-700'
            }`}>
              {report.summary.materials_would_add} materiali
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={e => { e.stopPropagation(); runTest(); }}
            disabled={loading}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              loading ? 'bg-gray-200 text-gray-400' : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}>
            {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />Test...</>
                     : <><Zap className="w-3.5 h-3.5 inline mr-1" />Esegui Test</>}
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 text-purple-400" />
                    : <ChevronDown className="w-4 h-4 text-purple-400" />}
        </div>
      </div>

      {expanded && report && (
        <div className="p-5 space-y-4">
          {/* SUMMARY */}
          <Section title="Riepilogo" open={sections.summary} toggle={() => toggle('summary')}
            icon={<Eye className="w-4 h-4" />}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Regole totali" value={report.summary.total_rules} />
              <StatCard label="Lookup attive" value={`${report.summary.active_lookups}/${report.summary.lookup_rules}`}
                color={report.summary.active_lookups > 0 ? 'green' : 'gray'} />
              <StatCard label="Mat. attive" value={`${report.summary.active_materials}/${report.summary.material_rules}`}
                color={report.summary.active_materials > 0 ? 'green' : 'gray'} />
              <StatCard label="Materiali totali" value={report.summary.materials_would_add}
                color={report.summary.materials_would_add > 0 ? 'green' : 'amber'} />
            </div>
            {report.summary.warnings?.length > 0 && (
              <div className="mt-3 space-y-1">
                {report.summary.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {w}
                  </div>
                ))}
              </div>
            )}
            {report.summary.errors?.length > 0 && (
              <div className="mt-3 space-y-1">
                {report.summary.errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-red-700 bg-red-50 rounded px-2 py-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {e}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* LOOKUP RULES */}
          <Section title={`Regole Lookup (${report.lookup_results.length})`}
            open={sections.lookups} toggle={() => toggle('lookups')}
            icon={<Search className="w-4 h-4" />}>
            {report.lookup_results.map((lr, idx) => (
              <RuleCard key={`${lr.rule_id}-${idx}`} ruleId={lr.rule_id} pass={lr.conditions_result}
                disabled={!lr.enabled} skip={lr.skip_reason}>
                {/* Condizioni */}
                {lr.conditions_detail.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {lr.conditions_detail.map((c, i) => (
                      <ConditionRow key={i} {...c} />
                    ))}
                  </div>
                )}
                {lr.conditions_detail.length === 0 && lr.conditions_result && (
                  <p className="text-xs text-gray-500 italic mb-2">Nessuna condizione (sempre attiva)</p>
                )}
                {/* Actions */}
                {lr.actions_result.map((ar, i) => (
                  <div key={i} className="bg-gray-50 rounded p-2 mt-1 text-xs">
                    <div className="font-semibold text-gray-700 mb-1">
                      ⚡ {ar.action} → {ar.tabella}
                    </div>
                    {ar.inputs && (
                      <div className="mb-1 space-y-0.5">
                        {ar.inputs.map((inp: any, j: number) => (
                          <div key={j} className="text-gray-600">
                            {inp.type === 'composite' ? `[${(inp.field || []).join(' + ')}]` : inp.field}
                            <span className="text-gray-400 mx-1">({inp.match})</span>
                            → <span className="font-mono font-semibold text-blue-700">{String(inp.resolved ?? 'null')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {ar.input_field && (
                      <div className="text-gray-600 mb-1">
                        {ar.input_field} → <span className="font-mono font-semibold text-blue-700">{String(ar.input_value ?? 'null')}</span>
                        {ar.partition_field && (<>
                          {' | '}{ar.partition_field} → <span className="font-mono font-semibold text-blue-700">{String(ar.partition_value ?? 'null')}</span>
                        </>)}
                      </div>
                    )}
                    {Object.keys(ar.values_written || {}).length > 0 ? (
                      <div className="mt-1 border-t pt-1 space-y-0.5">
                        {Object.entries(ar.values_written).map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <span className="text-gray-500 truncate">{k}</span>
                            <span className="font-mono font-semibold text-green-700">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-amber-600 mt-1">⚠ Nessun valore scritto</div>
                    )}
                    {/* Debug info */}
                    {ar.debug_warnings?.length > 0 && (
                      <div className="mt-1 border-t pt-1 space-y-0.5">
                        {ar.debug_warnings.map((w: string, wi: number) => (
                          <div key={wi} className="text-xs text-orange-600 font-mono">{w}</div>
                        ))}
                      </div>
                    )}
                    {ar.debug_table_tipo && (
                      <div className="text-xs text-gray-400 mt-1">
                        Tabella: tipo={ar.debug_table_tipo}, partizioni={JSON.stringify(ar.debug_table_partizioni)}
                      </div>
                    )}
                    {ar.debug_table_found === false && (
                      <div className="text-xs text-red-600 mt-1 font-semibold">❌ Data table non trovata!</div>
                    )}
                  </div>
                ))}
                {/* Value mapping materials */}
                {(lr.value_mapping_materials?.length ?? 0) > 0 && (
                  <div className="mt-2 bg-green-50 border border-green-200 rounded p-2">
                    <div className="text-xs font-semibold text-green-800 mb-1">
                      <Package className="w-3.5 h-3.5 inline mr-1" />
                      Materiali da value_mappings ({lr.value_mapping_materials!.length})
                    </div>
                    {lr.value_mapping_materials!.map((vm, i) => (
                      <div key={i} className="text-xs text-green-700 flex items-center gap-2 py-0.5">
                        <span className="text-gray-500">{vm.ctx_value}</span> →
                        <span className="font-mono font-semibold">{vm.codice}</span>
                        <span className="text-gray-500">{vm.descrizione}</span>
                      </div>
                    ))}
                  </div>
                )}
              </RuleCard>
            ))}
          </Section>

          {/* _CALC VALUES */}
          {Object.keys(calcValues).length > 0 && (
            <Section title={`Valori _calc (${Object.keys(calcValues).length})`}
              open={sections.calc} toggle={() => toggle('calc')}
              icon={<Zap className="w-4 h-4" />}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                {Object.entries(calcValues).sort().map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-xs py-0.5">
                    <span className="text-gray-500 truncate flex-1" title={k}>{k.replace('_calc.', '')}</span>
                    <span className="font-mono font-semibold text-blue-700 flex-shrink-0">{String(v)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* MATERIAL RULES */}
          <Section title={`Regole Materiali (${report.material_results.length})`}
            open={sections.materials} toggle={() => toggle('materials')}
            icon={<Package className="w-4 h-4" />}>
            {report.material_results.map((mr, idx) => (
              <RuleCard key={`${mr.rule_id}-${idx}`} ruleId={mr.rule_id} pass={mr.conditions_result}
                disabled={!mr.enabled} skip={mr.skip_reason}>
                {mr.conditions_detail.map((c, i) => (
                  <ConditionRow key={i} {...c} />
                ))}
                {mr.materials_would_add.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {mr.materials_would_add.map((m, i) => (
                      <div key={i} className={`text-xs flex items-center gap-2 px-2 py-1 rounded ${
                        m.unresolved ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                      }`}>
                        <Package className="w-3 h-3" />
                        <span className="font-mono font-semibold">{m.codice_resolved}</span>
                        <span className="text-gray-500">×{m.quantita}</span>
                        {m.unresolved && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                      </div>
                    ))}
                  </div>
                )}
              </RuleCard>
            ))}
            {report.material_results.length === 0 && (
              <p className="text-xs text-gray-400 italic">Nessuna regola materiale trovata</p>
            )}
          </Section>

          {/* CONTEXT (collapsible) */}
          <Section title={`Context completo (${Object.keys(report.context_initial).length} chiavi)`}
            open={sections.context} toggle={() => toggle('context')}
            icon={<Eye className="w-4 h-4" />}>
            <ContextTable data={report.context_initial} />
          </Section>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────

function Section({ title, open, toggle, icon, children }: {
  title: string; open: boolean; toggle: () => void;
  icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <button onClick={toggle}
        className="w-full px-3 py-2 flex items-center gap-2 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700">
        {icon}
        <span className="flex-1 text-left">{title}</span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
}

function StatCard({ label, value, color = 'gray' }: {
  label: string; value: any; color?: string;
}) {
  const colors: Record<string, string> = {
    green: 'bg-green-50 text-green-800 border-green-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    red: 'bg-red-50 text-red-800 border-red-200',
    gray: 'bg-gray-50 text-gray-800 border-gray-200',
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${colors[color] || colors.gray}`}>
      <div className="text-xs opacity-75">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

function RuleCard({ ruleId, pass, disabled, skip, children }: {
  ruleId: string; pass: boolean; disabled: boolean; skip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-3 mb-2 ${
      disabled ? 'bg-gray-50 border-gray-200 opacity-60' :
      pass ? 'bg-green-50/50 border-green-200' : 'bg-red-50/50 border-red-200'
    }`}>
      <div className="flex items-center gap-2 mb-1">
        {pass ? <CheckCircle2 className="w-4 h-4 text-green-600" />
              : <AlertCircle className="w-4 h-4 text-red-400" />}
        <span className="font-mono text-sm font-bold">{ruleId}</span>
        {disabled && <span className="text-xs bg-gray-200 text-gray-600 px-1.5 rounded">DISABLED</span>}
        {skip && <span className="text-xs text-gray-500">({skip})</span>}
      </div>
      {children}
    </div>
  );
}

function ConditionRow({ field, operator, expected, actual, result }: ConditionDetail) {
  return (
    <div className={`flex items-center gap-2 text-xs px-2 py-0.5 rounded ${
      result ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
    }`}>
      <span className={`w-4 h-4 flex items-center justify-center font-bold ${result ? 'text-green-600' : 'text-red-500'}`}>
        {result ? '✓' : '✗'}
      </span>
      <span className="font-mono">{field}</span>
      <span className="text-gray-400">{operator}</span>
      <span className="font-semibold">{expected !== undefined ? String(expected) : ''}</span>
      <span className="ml-auto text-gray-400">= <span className={`font-mono ${actual == null ? 'text-red-400 italic' : ''}`}>
        {actual != null ? String(actual) : 'null'}
      </span></span>
    </div>
  );
}

function ContextTable({ data }: { data: Record<string, any> }) {
  const [filter, setFilter] = useState('');
  const entries = Object.entries(data)
    .filter(([k, v]) => !filter || k.toLowerCase().includes(filter.toLowerCase())
      || String(v).toLowerCase().includes(filter.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div>
      <input type="text" value={filter} onChange={e => setFilter(e.target.value)}
        placeholder="Filtra chiavi..."
        className="w-full mb-2 px-2 py-1.5 text-xs border rounded" />
      <div className="max-h-60 overflow-y-auto space-y-0.5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-2 text-xs py-0.5 border-b border-gray-50">
            <span className="text-gray-500 truncate flex-1" title={k}>{k}</span>
            <span className="font-mono font-semibold text-gray-800 flex-shrink-0 max-w-[200px] truncate" title={String(v)}>
              {String(v)}
            </span>
          </div>
        ))}
        {entries.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Nessun risultato</p>}
      </div>
    </div>
  );
}
