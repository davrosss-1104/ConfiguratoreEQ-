import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Download, 
  FileText, 
  FileSpreadsheet, 
  FileCode, 
  File,
  Loader2,
  ChevronDown
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const API_BASE = 'http://localhost:8000';

interface ExportButtonsProps {
  preventivoId: number;
  numeroPreventivo?: string;
}

type ExportFormat = 'pdf' | 'docx' | 'xlsx' | 'xml';

const formatConfig: Record<ExportFormat, { 
  label: string; 
  icon: React.ReactNode; 
  bgColor: string;
  hoverColor: string;
}> = {
  pdf: { 
    label: 'PDF', 
    icon: <FileText className="h-4 w-4" />, 
    bgColor: 'bg-red-50 text-red-700 border-red-200',
    hoverColor: 'hover:bg-red-100'
  },
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
  xml: { 
    label: 'XML', 
    icon: <FileCode className="h-4 w-4" />, 
    bgColor: 'bg-orange-50 text-orange-700 border-orange-200',
    hoverColor: 'hover:bg-orange-100'
  },
};

export function ExportButtons({ preventivoId, numeroPreventivo }: ExportButtonsProps) {
  const [loading, setLoading] = useState<ExportFormat | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const { toast } = useToast();

  const handleExport = async (format: ExportFormat) => {
    setLoading(format);
    setShowMenu(false);
    
    try {
      const response = await fetch(`${API_BASE}/api/preventivi/${preventivoId}/export/${format}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Errore durante l\'esportazione');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `preventivo_${preventivoId}.${format}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "✅ Esportazione completata",
        description: `Preventivo esportato in formato ${formatConfig[format].label}`,
      });
      
    } catch (error: any) {
      console.error('Export error:', error);
      toast({
        title: "❌ Errore esportazione",
        description: error.message || 'Errore durante l\'esportazione',
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="relative">
      <Button 
        variant="outline" 
        className="gap-2"
        onClick={() => setShowMenu(!showMenu)}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Esporta
        <ChevronDown className="h-3 w-3" />
      </Button>
      
      {showMenu && (
        <>
          {/* Overlay per chiudere il menu */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowMenu(false)}
          />
          
          {/* Menu dropdown */}
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-xs text-gray-500 font-medium">
                Esporta {numeroPreventivo || `#${preventivoId}`}
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
                  className={`
                    w-full px-3 py-2.5 flex items-center gap-3 text-left
                    transition-colors ${config.hoverColor}
                    ${loading !== null && !isLoading ? 'opacity-50' : ''}
                  `}
                >
                  <span className={`p-1.5 rounded ${config.bgColor}`}>
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      config.icon
                    )}
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

// Versione con pulsanti inline (alternativa)
export function ExportButtonsInline({ preventivoId }: ExportButtonsProps) {
  const [loading, setLoading] = useState<ExportFormat | null>(null);
  const { toast } = useToast();

  const handleExport = async (format: ExportFormat) => {
    setLoading(format);
    
    try {
      const response = await fetch(`${API_BASE}/api/preventivi/${preventivoId}/export/${format}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Errore durante l\'esportazione');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `preventivo_${preventivoId}.${format}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "✅ Download completato",
        description: `File ${filename} scaricato`,
      });
      
    } catch (error: any) {
      toast({
        title: "❌ Errore",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex gap-1">
      {(Object.keys(formatConfig) as ExportFormat[]).map((format) => {
        const config = formatConfig[format];
        return (
          <Button
            key={format}
            variant="outline"
            size="sm"
            onClick={() => handleExport(format)}
            disabled={loading !== null}
            className={`gap-1 ${config.bgColor} ${config.hoverColor} border`}
          >
            {loading === format ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              config.icon
            )}
            <span className="text-xs">{config.label}</span>
          </Button>
        );
      })}
    </div>
  );
}

export default ExportButtons;
