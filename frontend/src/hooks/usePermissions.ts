/**
 * Hook per gestione permessi utente.
 * Legge i permessi dal localStorage (salvati al login) e fornisce
 * metodi helper per controllare accessi a sezioni, azioni, admin.
 * 
 * Uso:
 *   const { can, canEditSection, isAdmin } = usePermissions();
 *   if (can('preventivi.create')) { ... }
 *   if (canEditSection('dati_principali')) { ... }
 */

export interface UserPermissions {
  /** Lista codici permesso (es. ['preventivi.view', 'sezione.dati_principali.edit']) */
  permessi: string[];
  /** True se l'utente è admin (flag legacy o ruolo superadmin) */
  isAdmin: boolean;
  /** Nome del gruppo (es. 'Elettroquadri', 'Clienti') */
  gruppoNome: string | null;
  /** Codice del ruolo (es. 'commerciale_eq') */
  ruoloCodice: string | null;
  /** Nome del ruolo (es. 'Commerciale') */
  ruoloNome: string | null;
  /** Controlla se l'utente ha un permesso specifico */
  can: (permesso: string) => boolean;
  /** Controlla se l'utente può VEDERE una sezione del configuratore */
  canViewSection: (codiceSezione: string) => boolean;
  /** Controlla se l'utente può MODIFICARE una sezione del configuratore */
  canEditSection: (codiceSezione: string) => boolean;
  /** Controlla se l'utente ha accesso a una pagina admin */
  canAdmin: (area: string) => boolean;
}

export function usePermissions(): UserPermissions {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const permessi: string[] = user.permessi || [];
    const isAdmin: boolean = user.is_admin || false;
    const gruppoNome: string | null = user.gruppo_nome || null;
    const ruoloCodice: string | null = user.ruolo_codice || null;
    const ruoloNome: string | null = user.ruolo_nome || null;

    const can = (permesso: string): boolean => {
      // Admin ha sempre accesso
      if (isAdmin) return true;
      // Se permessi è vuoto (retrocompatibilità / dev bypass), permetti tutto
      if (permessi.length === 0) return true;
      return permessi.includes(permesso);
    };

    const canViewSection = (codiceSezione: string): boolean => {
      return can(`sezione.${codiceSezione}.view`);
    };

    const canEditSection = (codiceSezione: string): boolean => {
      return can(`sezione.${codiceSezione}.edit`);
    };

    const canAdmin = (area: string): boolean => {
      return can(`admin.${area}`);
    };

    return {
      permessi,
      isAdmin,
      gruppoNome,
      ruoloCodice,
      ruoloNome,
      can,
      canViewSection,
      canEditSection,
      canAdmin,
    };
  } catch {
    // Fallback sicuro: permetti tutto (evita lock-out)
    return {
      permessi: [],
      isAdmin: false,
      gruppoNome: null,
      ruoloCodice: null,
      ruoloNome: null,
      can: () => true,
      canViewSection: () => true,
      canEditSection: () => true,
      canAdmin: () => true,
    };
  }
}
