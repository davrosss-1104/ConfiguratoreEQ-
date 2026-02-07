import { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:8000/api';

export interface Opzione {
  id: number;
  gruppo: string;
  valore: string;
  etichetta: string;
  ordine: number;
  attivo: boolean;
}

// Cache delle opzioni per evitare richieste multiple
const opzioniCache: Map<string, Opzione[]> = new Map();
const pendingRequests: Map<string, Promise<Opzione[]>> = new Map();

/**
 * Hook per caricare le opzioni dropdown da un gruppo specifico
 * @param gruppo - Nome del gruppo (es: 'tipo_impianto', 'forza_motrice')
 * @param fallback - Opzioni di fallback in caso di errore
 */
export function useOpzioni(
  gruppo: string | null, 
  fallback: { value: string; label: string }[] = []
) {
  const [opzioni, setOpzioni] = useState<{ value: string; label: string }[]>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gruppo) {
      setOpzioni(fallback);
      setLoading(false);
      return;
    }

    // Check cache first
    const cached = opzioniCache.get(gruppo);
    if (cached) {
      setOpzioni(cached.map(o => ({ value: o.valore, label: o.etichetta })));
      setLoading(false);
      return;
    }

    // Check if request is already pending
    const pending = pendingRequests.get(gruppo);
    if (pending) {
      pending.then(data => {
        setOpzioni(data.map(o => ({ value: o.valore, label: o.etichetta })));
        setLoading(false);
      });
      return;
    }

    // Make new request
    const fetchPromise = fetch(`${API_BASE}/opzioni-dropdown/${gruppo}`)
      .then(response => {
        if (!response.ok) throw new Error('Errore caricamento opzioni');
        return response.json();
      })
      .then((data: Opzione[]) => {
        opzioniCache.set(gruppo, data);
        pendingRequests.delete(gruppo);
        return data;
      });

    pendingRequests.set(gruppo, fetchPromise);

    fetchPromise
      .then(data => {
        setOpzioni(data.map(o => ({ value: o.valore, label: o.etichetta })));
        setError(null);
      })
      .catch(err => {
        console.error(`Errore caricamento opzioni ${gruppo}:`, err);
        setError(err.message);
        setOpzioni(fallback);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [gruppo]);

  return { opzioni, loading, error };
}

/**
 * Hook per caricare multiple gruppi di opzioni
 * @param gruppi - Array di nomi gruppo
 */
export function useOpzioniMultiple(gruppi: string[]) {
  const [opzioniMap, setOpzioniMap] = useState<Record<string, { value: string; label: string }[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (gruppi.length === 0) {
      setLoading(false);
      return;
    }

    const loadAll = async () => {
      const results: Record<string, { value: string; label: string }[]> = {};
      
      await Promise.all(gruppi.map(async (gruppo) => {
        try {
          // Check cache
          const cached = opzioniCache.get(gruppo);
          if (cached) {
            results[gruppo] = cached.map(o => ({ value: o.valore, label: o.etichetta }));
            return;
          }

          const response = await fetch(`${API_BASE}/opzioni-dropdown/${gruppo}`);
          if (!response.ok) throw new Error('Errore');
          
          const data: Opzione[] = await response.json();
          opzioniCache.set(gruppo, data);
          results[gruppo] = data.map(o => ({ value: o.valore, label: o.etichetta }));
        } catch (err) {
          console.error(`Errore caricamento ${gruppo}:`, err);
          results[gruppo] = [];
        }
      }));

      setOpzioniMap(results);
      setLoading(false);
    };

    loadAll();
  }, [gruppi.join(',')]);

  return { opzioniMap, loading };
}

/**
 * Funzione per invalidare la cache (da usare dopo modifiche admin)
 */
export function invalidateOpzioniCache(gruppo?: string) {
  if (gruppo) {
    opzioniCache.delete(gruppo);
  } else {
    opzioniCache.clear();
  }
}

/**
 * Funzione per precaricare tutti i gruppi comuni
 */
export async function preloadOpzioni() {
  const gruppiComuni = [
    'tipo_impianto',
    'forza_motrice',
    'tensione_luce',
    'tensione_manovra',
    'tensione_freno',
    'trazione',
    'pagamento',
    'imballo',
    'trasporto',
    'direttiva',
    'tipo_manovra',
    'logica_processore',
    'porte_cabina',
    'porte_piano',
    'fornitore_operatore',
  ];

  await Promise.all(gruppiComuni.map(async (gruppo) => {
    if (opzioniCache.has(gruppo)) return;
    
    try {
      const response = await fetch(`${API_BASE}/opzioni-dropdown/${gruppo}`);
      if (response.ok) {
        const data = await response.json();
        opzioniCache.set(gruppo, data);
      }
    } catch (err) {
      console.error(`Errore preload ${gruppo}:`, err);
    }
  }));
}
