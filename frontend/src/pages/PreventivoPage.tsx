/**
 * PreventivoPage.tsx
 * Posizionare in: frontend/src/pages/PreventivoPage.tsx
 */
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from '@/components/Sidebar';
import { DatiCommessaForm } from "@/components/sections/DatiCommessaForm";
import { DatiPrincipaliForm } from "@/components/sections/DatiPrincipaliForm";
import { NormativeForm } from "@/components/sections/NormativeForm";
import DisposizioneVanoForm from "@/components/sections/DisposizioneVanoForm";
import OrdinePanel from "@/components/sections/OrdinePanel";
import { MaterialsTable } from "@/components/MaterialsTable";
import { CustomerNameEditor } from "@/components/CustomerNameEditor";
import { ExportButtons } from '@/components/ExportButtons';
import { getDatiCommessa, getDatiPrincipali, getNormative, getDisposizioneVano, getPreventivo } from '@/services/preventivi.service';
import { GestioneArticoliPage } from '@/components/sections/GestioneArticoliPage';
import GestioneOpzioniPage from '@/components/sections/GestioneOpzioniPage';
import GestioneCampiPage from '@/components/sections/GestioneCampiPage';
import GestioneSezioniPage from '@/components/sections/GestioneSezioniPage';
import { GestioneUtentiPage } from '@/components/sections/GestioneUtentiPage';
import RuleBuilderPage from '@/components/sections/RuleBuilderPage';
import GestioneClientiPage from '@/components/sections/GestioneClientiPage';
import GestioneBomPage from '@/components/sections/GestioneBomPage';
import DynamicSectionForm from '@/components/sections/DynamicSectionForm';
import { Building, ArrowLeft, FileText } from 'lucide-react';

// Colori sfondo per categoria
const CATEGORY_THEMES = {
  RISE: {
    pageBg: 'bg-green-100/60',
    progressBar: 'bg-green-600',
    progressText: 'text-green-700',
    badge: 'bg-green-100 text-green-800',
    sidebarAccent: '#41923a',
  },
  HOME: {
    pageBg: 'bg-amber-100/60',
    progressBar: 'bg-amber-500',
    progressText: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-800',
    sidebarAccent: '#e1a51b',
  },
  DEFAULT: {
    pageBg: 'bg-gray-50',
    progressBar: 'bg-blue-600',
    progressText: 'text-blue-600',
    badge: '',
    sidebarAccent: '#2563eb',
  },
} as const;

export const PreventivoPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const preventivoId = parseInt(id || '1', 10);

  if (isNaN(preventivoId)) {
    navigate('/');
    return null;
  }

  const [activeSection, setActiveSection] = useState('dati_commessa');

  const { data: preventivo } = useQuery({
    queryKey: ['preventivo', preventivoId],
    queryFn: () => getPreventivo(preventivoId),
  });

  const { data: datiCommessa } = useQuery({
    queryKey: ['datiCommessa', preventivoId],
    queryFn: () => getDatiCommessa(preventivoId),
  });

  const { data: datiPrincipali } = useQuery({
    queryKey: ['datiPrincipali', preventivoId],
    queryFn: () => getDatiPrincipali(preventivoId),
  });

  const { data: normative } = useQuery({
    queryKey: ['normative', preventivoId],
    queryFn: () => getNormative(preventivoId),
  });

  const { data: disposizioneVano } = useQuery({
    queryKey: ['disposizioneVano', preventivoId],
    queryFn: () => getDisposizioneVano(preventivoId),
  });

  // Carica dati cliente dal cliente_id del preventivo
  const clienteId = (preventivo as any)?.cliente_id;
  const { data: cliente } = useQuery({
    queryKey: ['cliente', clienteId],
    queryFn: async () => {
      const res = await fetch(`http://localhost:8000/clienti/${clienteId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!clienteId,
  });

  const rawCategoria = (preventivo as any)?.categoria as string | undefined;
  const categoria = rawCategoria && rawCategoria in CATEGORY_THEMES 
    ? rawCategoria as keyof typeof CATEGORY_THEMES 
    : undefined;
  const theme = categoria ? CATEGORY_THEMES[categoria] : CATEGORY_THEMES.DEFAULT;

  const calcolaProgresso = (): number => {
    let completati = 0;
    const sezioni = 4;
    if (datiCommessa?.numero_offerta) completati++;
    if (datiPrincipali?.numero_fermate && datiPrincipali.numero_fermate > 0) completati++;
    if (normative?.en_81_20) completati++;
    if (disposizioneVano?.posizione_quadro_lato) completati++;
    return Math.round((completati / sezioni) * 100);
  };

  const progresso = calcolaProgresso();

  const renderSection = () => {
    // *** Normalizza: sia 'dati-commessa' che 'dati_commessa' Ã¢â€ â€™ stessa chiave ***
    const section = activeSection.replace(/-/g, '_');

    switch (section) {
      case 'dati_commessa':
        return <DatiCommessaForm />;
      
      case 'dati_principali':
        return <DatiPrincipaliForm />;
      
      case 'normative':
        return <NormativeForm preventivoId={preventivoId} />;
      
      case 'disposizione_vano':
        return <DisposizioneVanoForm preventivoId={preventivoId} />;
      
      case 'argano':
      case 'quadro':
      case 'tensioni':
      case 'vano':
      case 'info_generale':
      case 'porte':
      case 'cabina':
      case 'porte_lato_a':
      case 'porte_lato_b':
      case 'operatore_a':
        return (
          <DynamicSectionForm
            key={section}
            preventivoId={preventivoId}
            sezioneCode={section}
            sezioneName={section.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            onDataChange={() => {}}
          />
        );

      case 'materiali':
        return (
          <div className="p-6 bg-white/70 rounded-lg shadow">
            <h2 className="text-2xl font-bold mb-4">Materiali</h2>
            <MaterialsTable preventivoId={preventivoId} />
          </div>
        );

      case 'gestione_clienti': return <GestioneClientiPage />;
      case 'gestione_bom': return <GestioneBomPage />;

      case 'ordine':
        return <OrdinePanel />;

      // --- Sezioni Admin (sidebar manda con trattino, normalizzato a underscore) ---
      case 'gestione_articoli':
        return <GestioneArticoliPage />;
      case 'gestione_clienti':
        return (
          <div className="p-6 bg-white/70 rounded-lg shadow">
            <h2 className="text-2xl font-bold mb-4">Gestione Clienti</h2>
            <p className="text-gray-500">Sezione in costruzione</p>
          </div>
        );
      case 'gestione_opzioni':
        return <GestioneOpzioniPage />;
      case 'gestione_campi':
        return <GestioneCampiPage />;
      case 'gestione_sezioni':
        return <GestioneSezioniPage />;
      case 'gestione_utenti':
        return <GestioneUtentiPage />;
      case 'rule_engine':
        return <RuleBuilderPage />;

      default:
        // Fallback: tutte le sezioni non gestite usano il form dinamico
        return (
          <DynamicSectionForm
            key={section}
            preventivoId={preventivoId}
            sezioneCode={section}
            sezioneName={section.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            onDataChange={() => {}}
          />
        );
    }
  };

  // Nasconde colonna materiali laterale per sezioni fullwidth
  const sectionNorm = activeSection.replace(/-/g, '_');
  const hideSideMaterials = sectionNorm === 'materiali' || sectionNorm === 'ordine'
    || sectionNorm.startsWith('gestione_') || sectionNorm === 'rule_engine';

  return (
    <div className={`flex min-h-screen ${theme.pageBg}`}>
      {/* Sidebar sinistra */}
      <div className="w-64 bg-white/80 shadow-lg">
        {categoria && (
          <div className="h-1" style={{ backgroundColor: theme.sidebarAccent }} />
        )}
        <Sidebar 
          activeSection={activeSection}
          onSectionChange={(section) => setActiveSection(section)}
          progresso={progresso}
        />
      </div>

      {/* Contenuto principale */}
      <div className="flex-1 p-6">
        {/* === TESTATA: N° Preventivo + Cliente + Status === */}
        <div className="mb-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-lg shadow px-5 py-3">
            <div className="flex items-center justify-between">
              {/* Sinistra: Back + N° + Categoria */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate('/')}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                  title="Torna alla Home"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span className="text-lg font-bold text-gray-900">
                    {(preventivo as any)?.numero_preventivo || '...'}
                  </span>
                  {categoria && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${theme.badge}`}>
                      {categoria}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    (preventivo as any)?.status === 'confermato' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {(preventivo as any)?.status === 'confermato' ? 'Confermato' 
                      : (preventivo as any)?.status === 'draft' ? 'Bozza' 
                      : (preventivo as any)?.status || '...'}
                  </span>
                </div>
              </div>

              {/* Centro: Cliente */}
              <div className="flex items-center gap-2 text-sm">
                {cliente ? (
                  <>
                    <Building className="w-4 h-4 text-green-600" />
                    <span className="font-medium text-gray-800">{cliente.ragione_sociale}</span>
                    <span className="text-gray-400">({cliente.codice})</span>
                  </>
                ) : (
                  <span className="text-gray-400 italic">Nessun cliente selezionato</span>
                )}
              </div>

              {/* Destra: Export */}
              <ExportButtons 
                preventivoId={preventivoId}
                numeroPreventivo={(preventivo as any)?.numero_preventivo}
              />
            </div>

            {/* Barra progresso compatta */}
            <div className="mt-2 flex items-center gap-3">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                <div
                  className={`${theme.progressBar} h-1.5 rounded-full transition-all duration-500`}
                  style={{ width: `${progresso}%` }}
                />
              </div>
              <span className={`text-xs font-medium ${theme.progressText}`}>
                {progresso}%
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Colonna sinistra - Sezione principale */}
          <div className="flex-1">
            {renderSection()}
          </div>

          {/* Colonna destra - Materiali */}
          {!hideSideMaterials && (
            <div className="w-96">
              <MaterialsTable 
                preventivoId={preventivoId} 
                className="sticky top-6"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
