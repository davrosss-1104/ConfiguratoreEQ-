import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Settings2, 
  ExternalLink, 
  RefreshCw, 
  AlertCircle,
  CheckCircle2,
  Loader2,
  Maximize2,
  Minimize2
} from 'lucide-react';

// URL del Rule Designer (solo frontend, nessun backend)
// Per cambiare porta: crea frontend/.env con PORT=3001
const RULE_DESIGNER_URL = 'http://localhost:3001';

export default function RuleEnginePage() {
  const [isLoaded, setIsLoaded] = useState<boolean | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // Gestisce il caricamento dell'iframe
  const handleIframeLoad = () => {
    setIsLoaded(true);
  };

  const handleIframeError = () => {
    setIsLoaded(false);
  };

  // Refresh iframe
  const refreshIframe = () => {
    setIframeKey(prev => prev + 1);
    setIsLoaded(null);
  };

  // Apri in nuova finestra
  const openInNewWindow = () => {
    window.open(RULE_DESIGNER_URL, '_blank', 'width=1400,height=900');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
            <Settings2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Rule Designer</h2>
            <p className="text-sm text-slate-500">
              Creazione visuale regole per calcolo automatico materiali e prezzi
            </p>
          </div>
        </div>

        {/* Azioni */}
        <div className="flex items-center gap-3">
          {/* Status */}
          {isLoaded === true && (
            <Badge className="gap-1 bg-green-100 text-green-700 hover:bg-green-100">
              <CheckCircle2 className="h-3 w-3" />
              Caricato
            </Badge>
          )}
          {isLoaded === false && (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              Non raggiungibile
            </Badge>
          )}
          {isLoaded === null && (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Caricamento...
            </Badge>
          )}

          <Button 
            variant="outline" 
            size="sm" 
            onClick={refreshIframe}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Ricarica
          </Button>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4 mr-1" />
            ) : (
              <Maximize2 className="h-4 w-4 mr-1" />
            )}
            {isFullscreen ? 'Riduci' : 'Espandi'}
          </Button>

          <Button 
            variant="default" 
            size="sm" 
            onClick={openInNewWindow}
          >
            <ExternalLink className="h-4 w-4 mr-1" />
            Apri in nuova finestra
          </Button>
        </div>
      </div>

      {/* Messaggio se non raggiungibile */}
      {isLoaded === false && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">
                  Rule Designer non raggiungibile
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  Assicurati che Rule Designer sia avviato:
                </p>
                <div className="mt-2 p-2 bg-amber-100 rounded font-mono text-xs text-amber-900">
                  <p>cd C:\Users\david\Desktop\Python\rule_engine_mvp\frontend</p>
                  <p>npm start</p>
                </div>
                <p className="text-sm text-amber-700 mt-2">
                  URL: <code className="bg-amber-100 px-1 rounded">{RULE_DESIGNER_URL}</code>
                </p>
                <p className="text-xs text-amber-600 mt-2">
                  <strong>Nota:</strong> Rule Designer è 100% frontend, non richiede backend.
                  <br />
                  Per cambiare porta: crea <code className="bg-amber-100 px-1 rounded">frontend/.env</code> con <code className="bg-amber-100 px-1 rounded">PORT=3001</code>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info card */}
      <Card className="bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200">
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="bg-white">Import</Badge>
                <span className="text-slate-600">SQLite/Excel/CSV</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="bg-white">Formule</Badge>
                <span className="text-slate-600">Calcoli</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="bg-white">Lookup</Badge>
                <span className="text-slate-600">Tabelle</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="bg-white">BOM</Badge>
                <span className="text-slate-600">IF-THEN-ELSE</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="bg-white">Export</Badge>
                <span className="text-slate-600">JSON</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Iframe con Rule Designer */}
      <Card className={`overflow-hidden ${isFullscreen ? 'fixed inset-4 z-50' : ''}`}>
        <CardHeader className="py-2 px-4 bg-slate-50 border-b flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-slate-600">
            Rule Designer - Editor Visuale Regole
          </CardTitle>
          {isFullscreen && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsFullscreen(false)}
            >
              <Minimize2 className="h-4 w-4 mr-1" />
              Chiudi fullscreen
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <iframe
            key={iframeKey}
            src={RULE_DESIGNER_URL}
            className={`w-full border-0 ${isFullscreen ? 'h-[calc(100vh-120px)]' : 'h-[700px]'}`}
            title="Rule Designer"
            allow="clipboard-read; clipboard-write"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
          />
        </CardContent>
      </Card>
    </div>
  );
}
