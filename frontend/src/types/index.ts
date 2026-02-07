// Tipi per il preventivo
export interface Preventivo {
  id: number;
  numero_preventivo?: string;
  stato?: string;
  data_creazione?: string;
  data_modifica?: string;
  dati_commessa?: DatiCommessa;
  dati_principali?: DatiPrincipali;
  info_generale?: InfoGenerale;
  porte_lato_a?: PorteLato;
  porte_lato_b?: PorteLato;
  porte_lato_c?: PorteLato;
  normative?: Normative;
  materiali?: Materiale[];
  totale?: number;
}

export interface DatiCommessa {
  cliente?: string;
  sede?: string;
  commessa?: string;
  cliente_non_codificato?: string;
  indirizzo_non_codificato?: string;
}

export interface DatiPrincipali {
  stops?: number;                   // Numero fermate (2-20)
  services?: number;                // Numero servizi
  speed?: number;                   // Velocità (m/s)
  travel?: number;                  // Corsa totale (metri)
  maneuver_type?: string;          // Tipo manovra
  accesses?: number;               // Numero accessi (1-3)
  processor_logic?: string;        // Logica processore
}

export interface InfoGenerale {
  numero_fermate?: number;
  velocita_ms?: number;
  tipo_manovra?: string;
  numero_accessi?: number;
  logica_processore?: string;
}

export interface PorteLato {
  porte_cabina?: string;
  porte_piano?: string;
  predisposizione_fotocellula?: boolean;
  tensione?: string;
  pattino_retrattile?: string;
}

export interface Normative {
  direttiva?: string;
  normativa_dm_236?: boolean;
  normativa_81_20?: string;
  normativa_81_28?: string;
  normativa_81_70?: string;
  normativa_10411?: string;
  emendamento_a3?: boolean;
}

export interface Materiale {
  id?: number;
  articolo?: string;
  descrizione?: string;
  quantita?: number;
  prezzo_materiale?: number;
  prezzo_manodopera?: number;
  prezzo_totale?: number;
  kit?: boolean;
}

// Tipi per le regole
export interface RegolaAttiva {
  id: string;
  nome: string;
  descrizione?: string;
  trigger: string;
  campiNascosti: string[];
  campiMostrati: string[];
  materialiAggiunti: MaterialeAggiunto[];
  isNew?: boolean;
}

export interface MaterialeAggiunto {
  descrizione: string;
  prezzo: number;
  quantita?: number;
}

// Tipi per lo stato dell'app
export type DBStatus = 'connected' | 'disconnected' | 'error';
