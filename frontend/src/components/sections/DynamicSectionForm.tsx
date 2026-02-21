import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Check, AlertCircle, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const API_BASE = 'http://localhost:8000';

// ==========================================
// INTERFACES
// ==========================================

interface CampoDB {
  id: number;
  codice: string;
  label: string;        // etichetta
  tipo: string;         // testo, numero, booleano, dropdown, data
  sezione: string;
  gruppo_opzioni?: string;
  ordine: number;
  attivo: boolean;
  obbligatorio: boolean;
  unita_misura?: string;
  valore_min?: number;
  valore_max?: number;
  valore_default?: string;
  descrizione?: string;
  visibile_form: boolean;
  usabile_regole: boolean;
}

interface Opzione {
  id: number;
  valore: string;
  label: string;
  ordine: number;
}

interface DynamicSectionFormProps {
  preventivoId: number;
  sezioneCode: string;
  sezioneName: string;
  onDataChange?: () => void;
}

// ==========================================
// COMPONENTE
// ==========================================

export default function DynamicSectionForm({
  preventivoId,
  sezioneCode,
  sezioneName,
  onDataChange,
}: DynamicSectionFormProps) {
  const { toast } = useToast();

  // State
  const [campi, setCampi] = useState<CampoDB[]>([]);
  const [valori, setValori] = useState<Record<string, any>>({});
  const [readonlyMap, setReadonlyMap] = useState<Record<string, boolean>>({});
  const [opzioniMap, setOpzioniMap] = useState<Record<string, Opzione[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Auto-save debounce
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef(false);
  const valoriRef = useRef(valori);
  valoriRef.current = valori;

  // ==========================================
  // LOAD DATA
  // ==========================================

  useEffect(() => {
    loadAll();
  }, [sezioneCode, preventivoId]);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      // 1. Carica definizione campi
      const campiRes = await fetch(`${API_BASE}/campi-configuratore/${sezioneCode}?solo_attivi=true`);
      const campiData: CampoDB[] = campiRes.ok ? await campiRes.json() : [];
      
      // Filtra solo visibili nel form
      const campiVisibili = campiData.filter(c => c.visibile_form !== false);
      setCampi(campiVisibili);

      // 2. Carica opzioni dropdown per ogni campo che ne ha bisogno
      const gruppi = [...new Set(campiVisibili.filter(c => c.tipo === 'dropdown' && c.gruppo_opzioni).map(c => c.gruppo_opzioni!))];
      const opzMap: Record<string, Opzione[]> = {};
      
      await Promise.all(gruppi.map(async (gruppo) => {
        try {
          const res = await fetch(`${API_BASE}/opzioni-dropdown/${gruppo}`);
          if (res.ok) {
            opzMap[gruppo] = await res.json();
          }
        } catch {}
      }));
      setOpzioniMap(opzMap);

      // 3. Carica valori salvati (il backend auto-popola i default al primo accesso)
      const valoriRes = await fetch(`${API_BASE}/preventivi/${preventivoId}/configurazione/${sezioneCode}`);
      const valoriData = valoriRes.ok ? await valoriRes.json() : {};
      const valoriSalvati = valoriData.valori || {};
      const readonlyInfo = valoriData.is_readonly || {};
      setReadonlyMap(readonlyInfo);

      // Merge: valori dal DB hanno prioritÃ , fallback su default campo o valore vuoto
      const merged: Record<string, any> = {};
      for (const campo of campiVisibili) {
        if (valoriSalvati[campo.codice] !== undefined && valoriSalvati[campo.codice] !== null) {
          // Valore dal DB (salvato dall'utente o auto-popolato come default)
          const raw = valoriSalvati[campo.codice];
          if (campo.tipo === 'numero') {
            merged[campo.codice] = parseFloat(raw) || 0;
          } else if (campo.tipo === 'booleano') {
            merged[campo.codice] = raw === 'true' || raw === '1' || raw === true;
          } else {
            merged[campo.codice] = raw;
          }
        } else if (campo.valore_default) {
          // Fallback: default del campo (non ancora auto-popolato dal backend)
          if (campo.tipo === 'numero') {
            merged[campo.codice] = parseFloat(campo.valore_default) || 0;
          } else if (campo.tipo === 'booleano') {
            merged[campo.codice] = campo.valore_default === 'true' || campo.valore_default === '1';
          } else {
            merged[campo.codice] = campo.valore_default;
          }
        } else {
          merged[campo.codice] = campo.tipo === 'booleano' ? false : campo.tipo === 'numero' ? 0 : '';
        }
      }
      setValori(merged);
    } catch (error) {
      console.error('Errore caricamento form dinamico:', error);
      toast({ title: 'Errore', description: 'Impossibile caricare il form', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // AUTO-SAVE
  // ==========================================

  const saveData = useCallback(async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setSaveStatus('saving');

    try {
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}/configurazione/${sezioneCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valori: valoriRef.current }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setSaveStatus('saved');
      onDataChange?.();
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Errore salvataggio:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      isSavingRef.current = false;
    }
  }, [preventivoId, sezioneCode, onDataChange]);

  const handleChange = useCallback((codice: string, valore: any) => {
    // Blocca modifiche su campi readonly
    if (readonlyMap[codice]) return;

    setValori(prev => {
      const next = { ...prev, [codice]: valore };
      valoriRef.current = next;
      return next;
    });

    // Debounce auto-save 3 secondi
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveData(), 3000);
  }, [saveData, readonlyMap]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // ==========================================
  // RENDER CAMPO
  // ==========================================

  const renderCampo = (campo: CampoDB) => {
    const valore = valori[campo.codice];
    const isReadonly = readonlyMap[campo.codice] || false;
    const readonlyCls = isReadonly ? 'opacity-60' : '';

    const labelEl = (
      <Label className={`text-sm font-medium text-gray-700 ${readonlyCls}`}>
        {campo.label}
        {campo.obbligatorio && <span className="text-red-500 ml-1">*</span>}
        {campo.unita_misura && <span className="text-gray-400 ml-1">({campo.unita_misura})</span>}
        {isReadonly && <Lock className="inline-block w-3 h-3 ml-1.5 text-amber-500" />}
      </Label>
    );

    switch (campo.tipo) {
      case 'dropdown': {
        const opzioni = campo.gruppo_opzioni ? (opzioniMap[campo.gruppo_opzioni] || []) : [];
        return (
          <div key={campo.codice} className={readonlyCls}>
            {labelEl}
            <Select
              value={String(valore || '')}
              onValueChange={(v) => handleChange(campo.codice, v)}
              disabled={isReadonly}
            >
              <SelectTrigger className={`mt-1 ${isReadonly ? 'bg-gray-100 cursor-not-allowed' : ''}`}>
                <SelectValue placeholder="Seleziona..." />
              </SelectTrigger>
              <SelectContent>
                {opzioni.map((opt) => (
                  <SelectItem key={opt.valore} value={opt.valore}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {campo.descrizione && <p className="text-xs text-gray-400 mt-1">{campo.descrizione}</p>}
          </div>
        );
      }

      case 'numero':
        return (
          <div key={campo.codice} className={readonlyCls}>
            {labelEl}
            <Input
              type="number"
              value={valore ?? ''}
              onChange={(e) => handleChange(campo.codice, parseFloat(e.target.value) || 0)}
              min={campo.valore_min}
              max={campo.valore_max}
              step={campo.unita_misura === 'm/s' ? 0.1 : 1}
              className={`mt-1 ${isReadonly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              disabled={isReadonly}
            />
            {campo.descrizione && <p className="text-xs text-gray-400 mt-1">{campo.descrizione}</p>}
          </div>
        );

      case 'booleano':
        return (
          <div key={campo.codice} className={`flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 ${isReadonly ? 'bg-gray-50 opacity-60' : ''}`}>
            <Checkbox
              id={campo.codice}
              checked={Boolean(valore)}
              onCheckedChange={(checked) => handleChange(campo.codice, !!checked)}
              disabled={isReadonly}
            />
            <div className="space-y-1 leading-none">
              <Label htmlFor={campo.codice} className={isReadonly ? '' : 'cursor-pointer'}>
                {campo.label}
                {campo.obbligatorio && <span className="text-red-500 ml-1">*</span>}
                {isReadonly && <Lock className="inline-block w-3 h-3 ml-1.5 text-amber-500" />}
              </Label>
              {campo.descrizione && <p className="text-xs text-gray-400">{campo.descrizione}</p>}
            </div>
          </div>
        );

      case 'data':
        return (
          <div key={campo.codice} className={readonlyCls}>
            {labelEl}
            <Input
              type="date"
              value={valore || ''}
              onChange={(e) => handleChange(campo.codice, e.target.value)}
              className={`mt-1 ${isReadonly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              disabled={isReadonly}
            />
            {campo.descrizione && <p className="text-xs text-gray-400 mt-1">{campo.descrizione}</p>}
          </div>
        );

      case 'testo':
      default:
        return (
          <div key={campo.codice} className={readonlyCls}>
            {labelEl}
            <Input
              type="text"
              value={valore || ''}
              onChange={(e) => handleChange(campo.codice, e.target.value)}
              placeholder={campo.descrizione || ''}
              className={`mt-1 ${isReadonly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              disabled={isReadonly}
            />
          </div>
        );
    }
  };

  // ==========================================
  // RENDER
  // ==========================================

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  if (campi.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{sezioneName}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-400 text-center py-8">
            Nessun campo configurato per questa sezione.
            <br />
            <span className="text-sm">Vai in Gestione Campi per aggiungere campi a "{sezioneCode}"</span>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{sezioneName}</CardTitle>
        <div className="flex items-center gap-2 text-sm">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1 text-blue-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvataggio...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-green-600">
              <Check className="h-4 w-4" />
              Salvato
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1 text-red-600">
              <AlertCircle className="h-4 w-4" />
              Errore
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campi.map(renderCampo)}
        </div>
      </CardContent>
    </Card>
  );
}
