/**
 * useFieldsWithRules.ts — Hook condiviso
 * Carica le regole JSON e restituisce il Set dei codici campo
 * che compaiono in almeno una condizione di una regola attiva.
 *
 * Posizionare in: src/hooks/useFieldsWithRules.ts
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

const API_BASE = 'http://localhost:8000';

interface RuleCondition {
  field: string;
  operator: string;
  value: any;
}

interface Rule {
  id: string;
  enabled: boolean;
  conditions: RuleCondition[];
}

export function useFieldsWithRules(): Set<string> {
  const { data: rules } = useQuery<Rule[]>({
    queryKey: ['regole-fields-map'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/regole`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,   // cache 5 min — le regole cambiano raramente
    refetchOnWindowFocus: false,
  });

  return useMemo(() => {
    const fieldSet = new Set<string>();
    if (!rules) return fieldSet;
    for (const rule of rules) {
      if (!rule.enabled) continue;
      for (const cond of (rule.conditions || [])) {
        if (cond.field) fieldSet.add(cond.field);
      }
    }
    return fieldSet;
  }, [rules]);
}
