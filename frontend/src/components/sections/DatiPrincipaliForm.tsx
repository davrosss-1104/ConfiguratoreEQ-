import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { getDatiPrincipali, updateDatiPrincipali } from '@/services/preventivi.service';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import { useOpzioniMultiple } from '@/hooks/useOpzioni';
import { CampiPersonalizzati } from './CampiPersonalizzati';

const formSchema = z.object({
  tipo_impianto: z.string().optional(),
  nuovo_impianto: z.boolean().optional(),
  numero_fermate: z.coerce.number().min(2, 'Minimo 2 fermate').max(50, 'Massimo 50 fermate').optional(),
  numero_servizi: z.coerce.number().min(1).optional(),
  velocita: z.coerce.number().min(0.1).optional(),
  corsa: z.coerce.number().min(0).optional(),
  forza_motrice: z.string().optional(),
  luce: z.string().optional(),
  tensione_manovra: z.string().optional(),
  tensione_freno: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

// Fallback hardcoded in caso di errore caricamento dal DB
const FALLBACK_OPTIONS = {
  tipo_impianto: [
    { value: 'ascensore', label: 'Ascensore' },
    { value: 'piattaforma', label: 'Piattaforma' },
    { value: 'montacarichi', label: 'Montacarichi' },
  ],
  forza_motrice: [
    { value: '3x400V', label: '3x400V' },
    { value: '3x400V+N', label: '3x400V + Neutro' },
  ],
  tensione_luce: [
    { value: '220V', label: '220V' },
    { value: '230V', label: '230V' },
  ],
  tensione_manovra: [
    { value: '48Vcc', label: '48Vcc' },
    { value: '60Vcc', label: '60Vcc' },
  ],
  tensione_freno: [
    { value: '48Vcc', label: '48Vcc' },
    { value: '60Vcc', label: '60Vcc' },
    { value: '110Vcc', label: '110Vcc' },
  ],
};

interface DatiPrincipaliFormProps {
  preventivoId?: number;
  isAdmin?: boolean;
  onDataChange?: () => void;
}

export function DatiPrincipaliForm({ preventivoId: propPreventivoId, isAdmin = false, onDataChange }: DatiPrincipaliFormProps) {
  const { id } = useParams<{ id: string }>();
  const preventivoId = propPreventivoId || parseInt(id || '1', 10);
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [autoSaveTimeout, setAutoSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  const [campiPersonalizzati, setCampiPersonalizzati] = useState<Record<string, any>>({});

  // Carica opzioni dal database
  const { opzioniMap, loading: opzioniLoading } = useOpzioniMultiple([
    'tipo_impianto',
    'forza_motrice',
    'tensione_luce',
    'tensione_manovra',
    'tensione_freno',
  ]);

  // Opzioni con fallback
  const TIPO_IMPIANTO_OPTIONS = opzioniMap['tipo_impianto']?.length > 0 
    ? opzioniMap['tipo_impianto'] 
    : FALLBACK_OPTIONS.tipo_impianto;
  
  const FORZA_MOTRICE_OPTIONS = opzioniMap['forza_motrice']?.length > 0 
    ? opzioniMap['forza_motrice'] 
    : FALLBACK_OPTIONS.forza_motrice;
  
  const TENSIONE_LUCE_OPTIONS = opzioniMap['tensione_luce']?.length > 0 
    ? opzioniMap['tensione_luce'] 
    : FALLBACK_OPTIONS.tensione_luce;
  
  const TENSIONE_MANOVRA_OPTIONS = opzioniMap['tensione_manovra']?.length > 0 
    ? opzioniMap['tensione_manovra'] 
    : FALLBACK_OPTIONS.tensione_manovra;
  
  const TENSIONE_FRENO_OPTIONS = opzioniMap['tensione_freno']?.length > 0 
    ? opzioniMap['tensione_freno'] 
    : FALLBACK_OPTIONS.tensione_freno;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tipo_impianto: '',
      nuovo_impianto: true,
      numero_fermate: 2,
      numero_servizi: 2,
      velocita: 1.0,
      corsa: 0,
      forza_motrice: '3x400V',
      luce: '220V',
      tensione_manovra: '48Vcc',
      tensione_freno: '48Vcc',
    },
  });

  // Carica dati iniziali
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const data = await getDatiPrincipali(preventivoId);
        
        // Reset form con dati dal server
        form.reset({
          tipo_impianto: data.tipo_impianto || '',
          nuovo_impianto: data.nuovo_impianto ?? true,
          numero_fermate: data.numero_fermate || 2,
          numero_servizi: data.numero_servizi || 2,
          velocita: data.velocita || 1.0,
          corsa: data.corsa || 0,
          forza_motrice: data.forza_motrice || '3x400V',
          luce: data.luce || '220V',
          tensione_manovra: data.tensione_manovra || '48Vcc',
          tensione_freno: data.tensione_freno || '48Vcc',
        });
      } catch (error: any) {
        console.error('Errore caricamento dati principali:', error);
        if (error.response?.status !== 404) {
          toast({
            title: 'Errore',
            description: 'Impossibile caricare i dati principali',
            variant: 'destructive',
          });
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [preventivoId, form, toast]);

  // Auto-save function
  const saveData = async (data: FormData) => {
    try {
      setSaveStatus('saving');
      setIsSaving(true);
      
      await updateDatiPrincipali(preventivoId, data);
      
      setSaveStatus('saved');
      
      // Notifica il parent per aggiornare il prezzo
      onDataChange?.();
      
      // Reset status dopo 2 secondi
      setTimeout(() => {
        setSaveStatus('idle');
      }, 2000);
    } catch (error: any) {
      console.error('Errore salvataggio:', error);
      setSaveStatus('error');
      toast({
        title: 'Errore',
        description: 'Impossibile salvare i dati',
        variant: 'destructive',
      });
      
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    } finally {
      setIsSaving(false);
    }
  };

  // Watch per auto-save
  useEffect(() => {
    const subscription = form.watch((value) => {
      // Cancella timeout precedente
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
      }

      // Se stiamo già salvando, ignora
      if (isSaving) return;

      // Imposta nuovo timeout per auto-save
      const timeout = setTimeout(() => {
        const formData = form.getValues();
        saveData(formData);
      }, 3000); // 3 secondi di debounce

      setAutoSaveTimeout(timeout);
    });

    return () => {
      subscription.unsubscribe();
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
      }
    };
  }, [form.watch, isSaving]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Dati Principali</CardTitle>
        <div className="flex items-center gap-2 text-sm">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1 text-blue-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvataggio...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-green-600">
              <Check className="h-4 w-4" />
              Salvato
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1 text-red-600">
              <AlertCircle className="h-4 w-4" />
              Errore
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-6">
            {/* Tipo Impianto */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tipo_impianto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo Impianto</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIPO_IMPIANTO_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nuovo_impianto"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Nuovo Impianto</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
            </div>

            {/* Fermate e Servizi */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="numero_fermate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Numero Fermate</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min={2} 
                        max={50}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 2)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="numero_servizi"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Numero Servizi</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min={1}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Velocità e Corsa */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="velocita"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Velocità (m/s)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.1" 
                        min={0.1}
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0.1)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="corsa"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Corsa (m)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.1" 
                        min={0}
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Tensioni */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Tensioni</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="forza_motrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Forza Motrice</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleziona" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {FORZA_MOTRICE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="luce"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Luce</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Es: 220V" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tensione_manovra"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tensione Manovra</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleziona" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TENSIONE_MANOVRA_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tensione_freno"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tensione Freno</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleziona" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TENSIONE_FRENO_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Campi Personalizzati - integrati con stile distintivo */}
            <CampiPersonalizzati
              sezione="dati_principali"
              preventivoId={preventivoId}
              valori={campiPersonalizzati}
              onChange={(codice, valore) => {
                setCampiPersonalizzati(prev => ({ ...prev, [codice]: valore }));
                // TODO: salvare i campi personalizzati
              }}
              isAdmin={isAdmin}
            />
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
