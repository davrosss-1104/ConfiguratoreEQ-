import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Settings, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { SelectConAggiungi } from './SelectConAggiungi';

const API_BASE = 'http://localhost:8000';

interface Campo {
  id: number;
  codice: string;
  etichetta: string;
  tipo: string;
  sezione: string;
  gruppo_dropdown?: string;
  unita_misura?: string;
  valore_min?: number;
  valore_max?: number;
  valore_default?: string;
  descrizione?: string;
  obbligatorio: boolean;
  ordine: number;
  opzioni?: { value: string; label: string }[];
}

interface CampiPersonalizzatiProps {
  sezione: string;                         // es: "normative", "dati_principali"
  preventivoId: number;
  valori: Record<string, any>;             // valori correnti
  onChange: (codice: string, valore: any) => void;
  isAdmin?: boolean;
  titolo?: string;                         // titolo sezione (opzionale, se vuoto = inline)
  mostraSempre?: boolean;                  // mostra anche se non ci sono campi (default: false)
  inline?: boolean;                        // se true, nessun wrapper/header (default: false)
}

export function CampiPersonalizzati({
  sezione,
  preventivoId,
  valori,
  onChange,
  isAdmin = false,
  titolo,
  mostraSempre = false,
  inline = false,
}: CampiPersonalizzatiProps) {
  const [campi, setCampi] = useState<Campo[]>([]);
  const [loading, setLoading] = useState(true);

  // Carica campi personalizzati per questa sezione
  useEffect(() => {
    fetchCampi();
  }, [sezione]);

  const fetchCampi = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/api/campi-configuratore/${sezione}?solo_attivi=true&include_opzioni=true`
      );
      if (response.ok) {
        const data = await response.json();
        // Filtra solo i campi "personalizzati" (quelli con codice che include "custom_")
        setCampi(data.filter((c: Campo) => c.codice.includes('.custom_') || c.codice.startsWith('custom_')));
      }
    } catch (error) {
      console.error('Errore caricamento campi:', error);
    } finally {
      setLoading(false);
    }
  };

  // Stile distintivo per campi custom
  const customFieldClass = "relative bg-gradient-to-r from-blue-50 to-transparent border-l-2 border-l-blue-400 pl-3 py-2 rounded-r-lg";

  const renderCampo = (campo: Campo) => {
    const codice = campo.codice;
    const valore = valori[codice] ?? campo.valore_default ?? '';

    const wrapper = (children: React.ReactNode) => (
      <div key={codice} className={customFieldClass}>
        {children}
      </div>
    );

    switch (campo.tipo) {
      case 'dropdown':
        return wrapper(
          <SelectConAggiungi
            gruppo={campo.gruppo_dropdown || codice}
            value={String(valore || '')}
            onChange={(v) => onChange(codice, v)}
            label={
              <span className="flex items-center gap-1">
                {campo.etichetta}
                {campo.obbligatorio && <span className="text-red-500">*</span>}
              </span>
            }
            placeholder="Seleziona..."
            isAdmin={isAdmin}
          />
        );

      case 'numero':
        return wrapper(
          <div>
            <Label className="text-sm font-medium text-gray-700 flex items-center gap-1">
              {campo.etichetta}
              {campo.unita_misura && (
                <span className="text-gray-400">({campo.unita_misura})</span>
              )}
              {campo.obbligatorio && <span className="text-red-500">*</span>}
            </Label>
            <Input
              type="number"
              value={valore}
              onChange={(e) => onChange(codice, parseFloat(e.target.value) || 0)}
              min={campo.valore_min}
              max={campo.valore_max}
              className="mt-1 bg-white"
            />
            {campo.descrizione && (
              <p className="text-xs text-gray-500 mt-1">{campo.descrizione}</p>
            )}
          </div>
        );

      case 'booleano':
        return (
          <div key={codice} className={`${customFieldClass} flex items-center gap-3`}>
            <Checkbox
              id={codice}
              checked={Boolean(valore)}
              onCheckedChange={(checked) => onChange(codice, checked)}
            />
            <Label htmlFor={codice} className="text-sm font-medium text-gray-700 cursor-pointer">
              {campo.etichetta}
            </Label>
            {campo.descrizione && (
              <span className="text-xs text-gray-500">({campo.descrizione})</span>
            )}
          </div>
        );

      case 'testo':
      default:
        return wrapper(
          <div>
            <Label className="text-sm font-medium text-gray-700 flex items-center gap-1">
              {campo.etichetta}
              {campo.obbligatorio && <span className="text-red-500">*</span>}
            </Label>
            <Input
              type="text"
              value={valore}
              onChange={(e) => onChange(codice, e.target.value)}
              placeholder={campo.descrizione || ''}
              className="mt-1 bg-white"
            />
          </div>
        );
    }
  };

  // Non mostrare nulla se non ci sono campi (a meno che mostraSempre=true)
  if (!loading && campi.length === 0 && !mostraSempre) {
    return null;
  }

  // Modalità inline: solo i campi, nessun wrapper
  if (inline) {
    if (loading) return null;
    return (
      <>
        {campi.map(renderCampo)}
      </>
    );
  }

  // Modalità con header (compatibilità con vecchio comportamento)
  return (
    <div className="mt-4">
      {/* Header compatto */}
      {(campi.length > 0 || isAdmin) && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-blue-400 rounded-full"></div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {titolo || 'Campi Aggiuntivi'}
            </h3>
            {campi.length > 0 && (
              <span className="text-xs text-gray-400">({campi.length})</span>
            )}
          </div>
          
          {/* Pulsante gestione - solo admin */}
          {isAdmin && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => window.open(`#gestione-campi?sezione=${sezione}`, '_self')}
              className="h-6 text-xs text-gray-400 hover:text-blue-600 px-2"
            >
              <Settings className="h-3 w-3 mr-1" />
              Gestisci
            </Button>
          )}
        </div>
      )}

      {/* Contenuto */}
      {loading ? (
        <div className="text-sm text-gray-500 py-2">Caricamento...</div>
      ) : campi.length === 0 ? (
        isAdmin && (
          <div className="text-sm text-gray-400 py-2 flex items-center gap-2">
            <span>Nessun campo personalizzato</span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs"
              onClick={() => window.open(`#gestione-campi?sezione=${sezione}`, '_self')}
            >
              <Plus className="h-3 w-3 mr-1" />
              Aggiungi
            </Button>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {campi.map(renderCampo)}
        </div>
      )}
    </div>
  );
}

export default CampiPersonalizzati;
