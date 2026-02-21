import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { preventiviService, getTemplates, type ProductTemplate, type Preventivo } from '@/services/preventivi.service';

// ==========================================
// COMPONENTE PRINCIPALE
// ==========================================

export const HomePage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Query preventivi
  const { data: preventivi = [], isLoading } = useQuery<Preventivo[]>({
    queryKey: ['preventivi'],
    queryFn: () => preventiviService.getPreventivi(),
  });

  // Query templates per la categoria selezionata
  const { data: templates = [] } = useQuery<ProductTemplate[]>({
    queryKey: ['templates', selectedCategory],
    queryFn: () => getTemplates(selectedCategory || undefined),
    enabled: !!selectedCategory,
  });

  // Mutation per creare preventivo (con o senza template)
  const createMutation = useMutation({
    mutationFn: (templateId?: number) =>
      preventiviService.createPreventivo({
        status: 'draft',
        ...(templateId ? { template_id: templateId } : {}),
      }),
    onSuccess: (newPreventivo) => {
      queryClient.invalidateQueries({ queryKey: ['preventivi'] });
      navigate(`/preventivo/${newPreventivo.id}`);
    },
    onError: (error) => {
      console.error('Errore creazione preventivo:', error);
      alert('Errore nella creazione del preventivo');
    },
  });

  const handleSubcategoryClick = (template: ProductTemplate) => {
    createMutation.mutate(template.id);
  };

  const handleCategoryClick = (cat: string) => {
    setSelectedCategory(prev => prev === cat ? null : cat);
  };

  // Colori per categoria
  const catColors = {
    RISE: {
      border: 'border-green-500',
      borderHover: 'hover:border-green-500',
      bg: 'bg-green-50',
      bgHover: 'hover:bg-green-50',
      text: 'text-green-800',
      ring: 'ring-green-200',
      badge: 'bg-green-100 text-green-800 border-green-200',
      accent: 'bg-green-500',
      subBorder: 'hover:border-green-400',
      subBg: 'hover:bg-green-50/50',
      subText: 'group-hover:text-green-600',
      subLabel: 'group-hover:text-green-700',
    },
    HOME: {
      border: 'border-amber-500',
      borderHover: 'hover:border-amber-500',
      bg: 'bg-amber-50',
      bgHover: 'hover:bg-amber-50',
      text: 'text-amber-800',
      ring: 'ring-amber-200',
      badge: 'bg-amber-100 text-amber-800 border-amber-200',
      accent: 'bg-amber-500',
      subBorder: 'hover:border-amber-400',
      subBg: 'hover:bg-amber-50/50',
      subText: 'group-hover:text-amber-600',
      subLabel: 'group-hover:text-amber-700',
    },
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Caricamento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Configuratore Elettroquadri
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Sistema di preventivazione automatica
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/ricerca')}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Cerca preventivi"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                Cerca
              </button>
              <button
                onClick={() => navigate('/admin/templates')}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Gestione Template"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Gestione
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sezione Creazione Preventivo */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-5">Nuovo Preventivo</h2>

          <div className="flex gap-6">
            {/* Colonna SX - Categorie principali */}
            <div className="flex-1">
              <div className="grid grid-cols-2 gap-4">
                {/* Pulsantone RISE */}
                <button
                  onClick={() => handleCategoryClick('RISE')}
                  disabled={createMutation.isPending}
                  className={`
                    group relative flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 transition-all duration-200
                    ${selectedCategory === 'RISE'
                      ? `${catColors.RISE.border} ${catColors.RISE.bg} ring-2 ${catColors.RISE.ring} shadow-md`
                      : `border-gray-200 bg-white ${catColors.RISE.borderHover} ${catColors.RISE.bgHover} hover:shadow-md`
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  <img
                    src="/icons/equa-rise-secondary-color.svg"
                    alt="RISE"
                    className="w-16 h-16 object-contain"
                  />
                  {selectedCategory === 'RISE' && (
                    <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${catColors.RISE.accent}`} />
                  )}
                </button>

                {/* Pulsantone HOME */}
                <button
                  onClick={() => handleCategoryClick('HOME')}
                  disabled={createMutation.isPending}
                  className={`
                    group relative flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 transition-all duration-200
                    ${selectedCategory === 'HOME'
                      ? `${catColors.HOME.border} ${catColors.HOME.bg} ring-2 ${catColors.HOME.ring} shadow-md`
                      : `border-gray-200 bg-white ${catColors.HOME.borderHover} ${catColors.HOME.bgHover} hover:shadow-md`
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  <img
                    src="/icons/equa-home-secondary-color.svg"
                    alt="HOME"
                    className="w-16 h-16 object-contain"
                  />
                  {selectedCategory === 'HOME' && (
                    <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${catColors.HOME.accent}`} />
                  )}
                </button>
              </div>
            </div>

            {/* Colonna DX - Azioni rapide */}
            <div className="flex flex-col gap-3 w-48 shrink-0">
              <button
                onClick={() => navigate('/admin/templates')}
                className="flex items-center gap-2.5 px-4 py-3 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-800 transition-all text-sm font-medium"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="9" x2="9" y2="21" />
                </svg>
                Template
              </button>
              <button
                onClick={() => navigate('/ricambi')}
                className="flex items-center gap-2.5 px-4 py-3 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-800 transition-all text-sm font-medium"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
                </svg>
                Ricambi
              </button>
            </div>
          </div>

          {/* Sotto-categorie (secondo livello) */}
          {selectedCategory && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-1.5 h-5 rounded-full ${selectedCategory === 'RISE' ? catColors.RISE.accent : catColors.HOME.accent}`} />
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">
                  Seleziona tipo — {selectedCategory}
                </h3>
              </div>

              {templates.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm">Nessun template configurato per <strong>{selectedCategory}</strong>.</p>
                  <button
                    onClick={() => navigate('/admin/templates')}
                    className="mt-2 text-sm text-blue-500 hover:text-blue-600 underline"
                  >
                    Configura i template
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {templates.map((template) => {
                    const colors = selectedCategory === 'RISE' ? catColors.RISE : catColors.HOME;
                    const iconPath = template.icona
                      ? `/icons/${template.icona}.svg`
                      : null;

                    return (
                      <button
                        key={template.id}
                        onClick={() => handleSubcategoryClick(template)}
                        disabled={createMutation.isPending}
                        className={`
                          group flex flex-col items-center gap-2.5 p-5 rounded-xl border-2 border-gray-150 bg-white
                          ${colors.subBorder} ${colors.subBg} hover:shadow-md
                          active:scale-[0.98] transition-all duration-150
                          disabled:opacity-50 disabled:cursor-not-allowed
                        `}
                      >
                        {createMutation.isPending ? (
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-400" />
                        ) : iconPath ? (
                          <img
                            src={iconPath}
                            alt={template.nome_display}
                            className="w-20 h-20 object-contain"
                          />
                        ) : (
                          <svg className="w-12 h-12 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="2" y="6" width="20" height="14" rx="2" />
                            <path d="M6 6V4a2 2 0 012-2h8a2 2 0 012 2v2" />
                            <line x1="12" y1="11" x2="12" y2="15" />
                            <line x1="10" y1="13" x2="14" y2="13" />
                          </svg>
                        )}
                        <span className={`text-sm font-semibold text-gray-700 ${colors.subLabel} transition-colors text-center`}>
                          {template.nome_display}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lista preventivi esistenti */}
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Preventivi Recenti</h2>

          {preventivi.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <svg
                className="mx-auto h-12 w-12 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="mt-3 text-sm font-medium text-gray-600">Nessun preventivo</h3>
              <p className="mt-1 text-sm text-gray-400">
                Seleziona una categoria sopra per creare il tuo primo preventivo
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {preventivi.map((preventivo) => {
                const cat = (preventivo as any).categoria as string | undefined;
                const badgeClass = cat === 'RISE' ? catColors.RISE.badge
                  : cat === 'HOME' ? catColors.HOME.badge
                  : '';
                const tmpl = templates.find((t: any) => t.id === (preventivo as any).template_id);
                const prodName = tmpl?.nome_display || tmpl?.sottocategoria || '';

                return (
                  <div
                    key={preventivo.id}
                    onClick={() => navigate(`/preventivo/${preventivo.id}`)}
                    className="bg-white overflow-hidden rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer group"
                  >
                    <div className="px-5 py-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                            {preventivo.numero_preventivo}
                          </h3>
                          {cat && (
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${badgeClass}`}>
                              {cat}
                            </span>
                          )}
                          {prodName && (
                            <span className="text-xs text-gray-500 font-medium">
                              {prodName}
                            </span>
                          )}
                        </div>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            preventivo.status === 'draft'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : preventivo.status === 'sent'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-green-50 text-green-700 border border-green-200'
                          }`}
                        >
                          {preventivo.status === 'draft'
                            ? 'Bozza'
                            : preventivo.status === 'sent'
                            ? 'Inviato'
                            : 'Approvato'}
                        </span>
                      </div>

                      {preventivo.customer_name ? (
                        <p className="text-sm text-gray-600 mb-3">{preventivo.customer_name}</p>
                      ) : (
                        <p className="text-sm text-gray-300 italic mb-3">Nessun cliente</p>
                      )}

                      <div className="flex items-center justify-between">
                        <span className="text-xl font-bold text-gray-900">
                          €{preventivo.total_price.toFixed(2)}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(preventivo.created_at).toLocaleDateString('it-IT')}
                        </span>
                      </div>
                    </div>
                    <div className="bg-gray-50 px-5 py-3 border-t border-gray-100">
                      <span className="text-sm font-medium text-blue-600 group-hover:text-blue-700">
                        Apri preventivo →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
