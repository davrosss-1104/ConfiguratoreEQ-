import { FileDown } from 'lucide-react';
import { useState } from 'react';

interface PDFButtonProps {
  preventivoId: number;
}

export function PDFButton({ preventivoId }: PDFButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGeneratePDF = async () => {
    setIsGenerating(true);
    
    try {
      // TODO: Implementare generazione PDF reale
      console.log('🔄 Generazione PDF per preventivo:', preventivoId);
      
      // Simulazione chiamata API
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Placeholder: scarica un PDF vuoto o mostra alert
      alert(`PDF generato per preventivo ${preventivoId}!\n\n(Implementazione da completare)`);
      
    } catch (error) {
      console.error('Errore generazione PDF:', error);
      alert('Errore durante la generazione del PDF');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <button
      onClick={handleGeneratePDF}
      disabled={isGenerating}
      className={`
        flex items-center gap-2 px-4 py-2 rounded-lg font-medium
        transition-all duration-200
        ${isGenerating 
          ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md'
        }
      `}
    >
      <FileDown className={`w-5 h-5 ${isGenerating ? 'animate-bounce' : ''}`} />
      {isGenerating ? 'Generazione...' : 'Genera PDF'}
    </button>
  );
}
