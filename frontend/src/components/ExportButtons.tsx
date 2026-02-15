/**
 * ExportButtons.tsx — Pulsanti export DOCX/XLSX/JSON per Preventivi e Ordini
 * 
 * Uso:
 *   <ExportButtons preventivoId={87} numeroPreventivo="2025/0001" />
 *   <ExportButtons ordineId={12} label="Ordine ORD-2025-001" />
 *   <ExportButtonsInline preventivoId={87} />
 *   <ExportButtonsInline ordineId={12} />
 */
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Download, FileText, FileSpreadsheet, FileCode, File, Loader2, ChevronDown
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const API_BASE = 'http://localhost:8000';

interface ExportButtonsProps {
  preventivoId?: number;
  ordineId?: number;
  numeroPreventivo?: string;
  label?: string;
}

type ExportFormat = 'docx' | 'xlsx' | 'json';

const formatConfig: Record<ExportFormat, { 
  label: string; icon: React.ReactNode; bgColor: string; hoverColor: string;
}> = {
  docx: { 
    label: 'Word', 
    icon: <File className="h-4 w-4" />, 
    bgColor: 'bg-blue-50 text-blue-700 border-blue-200',
    hoverColor: 'hover:bg-blue-100'
  },
  xlsx: { 
    label: 'Excel', 
    icon: <FileSpreadsheet className="h-4 w-4" />, 
    bgColor: 'bg-green-50 text-green-700 border-green-200',
    hoverColor: 'hover:bg-green-100'
  },
  json: { 
    label: 'JSON', 
    icon: <FileCode className="h-4 w-4" />, 
    bgColor: 'bg-orange-50 text-orange-700 border-orange-200',
    hoverColor: 'hover:bg-orange-100'
  },
};

function buildUrl(props: ExportButtonsProps, format: ExportFormat): string {
  if (props.ordineId) {
    return `${API_BASE}/ordini/${props.ordineId}/export/${format}`;
  }
  return `${API_BASE}/preventivi/${props.preventivoId}/export/${format}`;
}

function buildLabel(props: ExportButtonsProps): string {
  if (props.label) return props.label;
  if (props.ordineId) return `Ordine #${props.ordineId}`;
  return props.numeroPreventivo || `#${props.preventivoId}`;
}

async function doExport(
  props: ExportButtonsProps,
  format: ExportFormat,
  setLoading: (v: ExportFormat | null) => void,
  toast: any
) {
  setLoading(format);
  try {
    const url = buildUrl(props, format);
    const response = await fetch(url);
    
    if (!response.ok) {
      let detail = 'Errore durante l\'esportazione';
      try { detail = (await response.json()).detail || detail; } catch {}
      throw new Error(detail);
    }

    if (format === 'json') {
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = props.ordineId ? `ordine_${props.ordineId}.json` : `preventivo_${props.preventivoId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } else {
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      
      const cd = response.headers.get('Content-Disposition');
      let filename = props.ordineId
        ? `ordine_${props.ordineId}.${format}`
        : `preventivo_${props.preventivoId}.${format}`;
      if (cd) {
        const match = cd.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    }
    
    toast({
      title: "Esportazione completata",
      description: `${buildLabel(props)} esportato in ${formatConfig[format].label}`,
    });
  } catch (error: any) {
    console.error('Export error:', error);
    toast({
      title: "Errore esportazione",
      description: error.message || 'Errore durante l\'esportazione',
      variant: "destructive",
    });
  } finally {
    setLoading(null);
  }
}


// ═══════════════════════════════════════════
// VERSIONE DROPDOWN
// ═══════════════════════════════════════════
export function ExportButtons(props: ExportButtonsProps) {
  const [loading, setLoading] = useState<ExportFormat | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const { toast } = useToast();

  const handleExport = (format: ExportFormat) => {
    setShowMenu(false);
    doExport(props, format, setLoading, toast);
  };

  return (
    <div className="relative">
      <Button variant="outline" className="gap-2" onClick={() => setShowMenu(!showMenu)}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Esporta
        <ChevronDown className="h-3 w-3" />
      </Button>
      
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-xs text-gray-500 font-medium">
                Esporta {buildLabel(props)}
              </p>
            </div>
            
            {(Object.keys(formatConfig) as ExportFormat[]).map((format) => {
              const config = formatConfig[format];
              const isLoading = loading === format;
              return (
                <button
                  key={format}
                  onClick={() => handleExport(format)}
                  disabled={loading !== null}
                  className={`w-full px-3 py-2.5 flex items-center gap-3 text-left transition-colors ${config.hoverColor} ${loading !== null && !isLoading ? 'opacity-50' : ''}`}
                >
                  <span className={`p-1.5 rounded ${config.bgColor}`}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : config.icon}
                  </span>
                  <span className="font-medium text-gray-700">{config.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════
// VERSIONE INLINE (pulsanti affiancati)
// ═══════════════════════════════════════════
export function ExportButtonsInline(props: ExportButtonsProps) {
  const [loading, setLoading] = useState<ExportFormat | null>(null);
  const { toast } = useToast();

  return (
    <div className="flex gap-1">
      {(Object.keys(formatConfig) as ExportFormat[]).map((format) => {
        const config = formatConfig[format];
        return (
          <Button
            key={format}
            variant="outline"
            size="sm"
            onClick={() => doExport(props, format, setLoading, toast)}
            disabled={loading !== null}
            className={`gap-1 ${config.bgColor} ${config.hoverColor} border`}
          >
            {loading === format ? <Loader2 className="h-3 w-3 animate-spin" /> : config.icon}
            <span className="text-xs">{config.label}</span>
          </Button>
        );
      })}
    </div>
  );
}

export default ExportButtons;
