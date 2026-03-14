import React, { useState, useEffect } from 'react';
import { Plus, X, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface Opzione {
  value: string;
  label: string;
}

interface SelectConAggiungiProps {
  gruppo: string;                          // es: "en_81_20_anno"
  value: string;                           // valore selezionato
  onChange: (value: string) => void;       // callback cambio valore
  placeholder?: string;                    // es: "Seleziona..."
  className?: string;                      // classe CSS aggiuntiva
  disabled?: boolean;
  fallbackOptions?: Opzione[];             // opzioni fallback se API non disponibile
  label?: string;                          // etichetta campo
  showAddButton?: boolean;                 // mostra pulsante aggiungi (default: true)
  isAdmin?: boolean;                       // se true, mostra pulsante aggiungi (default: false)
}

export function SelectConAggiungi({
  gruppo,
  value,
  onChange,
  placeholder = "Seleziona...",
  className = "",
  disabled = false,
  fallbackOptions = [],
  label,
  showAddButton = true,
  isAdmin = false,                         // Default: nascosto
}: SelectConAggiungiProps) {
  const [opzioni, setOpzioni] = useState<Opzione[]>(fallbackOptions);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carica opzioni dal database
  useEffect(() => {
    fetchOpzioni();
  }, [gruppo]);

  const fetchOpzioni = async () => {
    try {
      const response = await fetch(`${API_BASE}/opzioni-dropdown/${gruppo}`);
      if (response.ok) {
        const data = await response.json();
        if (data.length > 0) {
          setOpzioni(data.map((o: any) => ({ value: o.valore, label: o.label || o.etichetta || o.valore })));
        }
      }
    } catch (err) {
      console.error('Errore caricamento opzioni:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newValue.trim() || !newLabel.trim()) {
      setError('Compila valore ed etichetta');
      return;
    }

    // Formatta valore (lowercase, underscore)
    const formattedValue = newValue.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    // Controlla duplicato
    if (opzioni.some(o => o.value === formattedValue)) {
      setError('Valore giÃ  esistente');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/opzioni-dropdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gruppo,
          valore: formattedValue,
          etichetta: newLabel.trim(),
          ordine: opzioni.length,
          attivo: true,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Errore salvataggio');
      }

      // Ricarica opzioni
      await fetchOpzioni();

      // Seleziona la nuova opzione
      onChange(formattedValue);

      // Chiudi form
      setShowAddForm(false);
      setNewValue('');
      setNewLabel('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const label = e.target.value;
    setNewLabel(label);
    // Auto-genera valore dal label se vuoto
    if (!newValue || newValue === newLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')) {
      setNewValue(label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
    }
  };

  const selectClass = `
    w-full bg-white border border-gray-300 rounded-lg px-3 py-2 
    text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 
    transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed
    ${className}
  `;

  return (
    <div className="space-y-2">
      {label && (
        <Label className="text-sm font-medium text-gray-700">{label}</Label>
      )}
      
      <div className="flex gap-2">
        {/* Select */}
        <div className="flex-1 relative">
          <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled || loading}
            className={selectClass}
          >
            <option value="">{loading ? 'Caricamento...' : placeholder}</option>
            {opzioni.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Pulsante Aggiungi - Solo per admin */}
        {showAddButton && isAdmin && !disabled && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowAddForm(!showAddForm)}
            className="h-10 w-10 p-0 flex-shrink-0"
            title="Aggiungi nuova opzione"
          >
            {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* Form aggiunta inline */}
      {showAddForm && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-3 animate-in slide-in-from-top-2">
          <div className="text-sm font-medium text-blue-800">Aggiungi nuova opzione</div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-gray-600">Etichetta</Label>
              <Input
                value={newLabel}
                onChange={handleLabelChange}
                placeholder="Es: 2026"
                className="h-8 text-sm"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600">Valore (auto)</Label>
              <Input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                placeholder="es: 2026"
                className="h-8 text-sm font-mono"
              />
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowAddForm(false);
                setNewValue('');
                setNewLabel('');
                setError(null);
              }}
            >
              Annulla
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              disabled={saving || !newLabel.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Aggiungi
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SelectConAggiungi;
