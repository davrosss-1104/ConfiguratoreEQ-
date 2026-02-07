import api from './api';

export interface ArganoData {
  trazione?: string;
  potenza_motore_kw?: number;
  corrente_nominale_amp?: number;
  tipo_vvvf?: string;
  vvvf_nel_vano?: boolean;
  freno_tensione?: string;
  ventilazione_forzata?: string;
  tipo_teleruttore?: string;
}

export const arganoService = {
  getArgano: (preventivoId: number) =>
    api.get<ArganoData>(`/argano/${preventivoId}`),

  updateArgano: (preventivoId: number, data: ArganoData) =>
    api.put(`/argano/${preventivoId}`, data),
};
