import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Sparkles, 
  EyeOff, 
  Eye, 
  Plus, 
  Euro,
  Zap
} from 'lucide-react';
import { useAppStore, RegolaAttiva } from '@/store/useAppStore';

export function RegolePanel() {
  const { regoleAttive } = useAppStore();

  return (
    <div className="w-[320px] bg-slate-50 border-l border-slate-200 flex flex-col h-screen">
      {/* Header */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Zap className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-sm text-slate-700">REGOLE ATTIVE</h2>
            <p className="text-xs text-slate-500">Calcolo automatico</p>
          </div>
          <Badge variant="secondary" className="text-xs">
            {regoleAttive.length}
          </Badge>
        </div>
      </div>

      {/* Regole List */}
      <ScrollArea className="flex-1 p-4">
        <AnimatePresence mode="popLayout">
          {regoleAttive.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-12"
            >
              <div className="inline-flex p-4 bg-slate-100 rounded-full mb-3">
                <Sparkles className="h-8 w-8 text-slate-400" />
              </div>
              <p className="text-sm text-slate-600 font-medium">
                Nessuna regola attiva
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Le regole si attiveranno automaticamente in base alla configurazione
              </p>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {regoleAttive.map((regola, index) => (
                <motion.div
                  key={regola.id}
                  initial={{ opacity: 0, x: 20, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -20, scale: 0.95 }}
                  transition={{ delay: index * 0.05 }}
                  layout
                >
                  <RegolaCard regola={regola} isNew={regola.isNew} />
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </ScrollArea>

      {/* Footer Info */}
      {regoleAttive.length > 0 && (
        <div className="p-4 border-t border-slate-200 bg-blue-50">
          <div className="text-xs text-blue-700">
            <div className="flex items-center gap-1 font-medium mb-1">
              <Sparkles className="h-3 w-3" />
              Calcolo automatico attivo
            </div>
            <p className="text-blue-600">
              Il preventivo viene aggiornato in tempo reale
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface RegolaCardProps {
  regola: RegolaAttiva;
  isNew?: boolean;
}

function RegolaCard({ regola, isNew }: RegolaCardProps) {
  const hasChanges = regola.campiNascosti.length > 0 || 
                     regola.campiMostrati.length > 0 || 
                     regola.materialiAggiunti.length > 0;

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all",
      isNew && "ring-2 ring-blue-500 shadow-lg"
    )}>
      {isNew && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-2 right-2"
        >
          <Badge className="bg-blue-500 text-white text-xs gap-1">
            <Sparkles className="h-3 w-3" />
            Nuova!
          </Badge>
        </motion.div>
      )}

      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-slate-700 pr-16">
          {regola.nome}
        </CardTitle>
        {regola.descrizione && (
          <p className="text-xs text-slate-500 mt-1">{regola.descrizione}</p>
        )}
      </CardHeader>

      {hasChanges && (
        <CardContent className="pt-0 space-y-3">
          {/* Campi Nascosti */}
          {regola.campiNascosti.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-2">
                <EyeOff className="h-3 w-3" />
                Nasconde:
              </div>
              <div className="space-y-1">
                {regola.campiNascosti.map((campo, i) => (
                  <div key={i} className="text-xs text-slate-600 pl-5">
                    • {campo}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Campi Mostrati */}
          {regola.campiMostrati.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-2">
                <Eye className="h-3 w-3" />
                Mostra:
              </div>
              <div className="space-y-1">
                {regola.campiMostrati.map((campo, i) => (
                  <div key={i} className="text-xs text-slate-600 pl-5">
                    • {campo}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Materiali Aggiunti */}
          {regola.materialiAggiunti.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-2">
                <Plus className="h-3 w-3" />
                Aggiunge:
              </div>
              <div className="space-y-1.5">
                {regola.materialiAggiunti.map((materiale, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-green-50 border border-green-200 rounded px-2 py-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-slate-700 font-medium flex-1">
                        {materiale.descrizione}
                      </span>
                      <div className="flex items-center gap-0.5 text-xs font-semibold text-green-700">
                        <Euro className="h-3 w-3" />
                        {materiale.prezzo.toFixed(2)}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
