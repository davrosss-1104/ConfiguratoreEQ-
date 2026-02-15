import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface CustomerNameEditorProps {
  preventivoId: number;
  currentName?: string;
}

const API_BASE = "http://localhost:8000";

export function CustomerNameEditor({ preventivoId, currentName = '' }: CustomerNameEditorProps) {
  const [customerName, setCustomerName] = useState(currentName);
  const [isEditing, setIsEditing] = useState(false);
  const queryClient = useQueryClient();

  // Sincronizza con prop quando cambia
  useEffect(() => {
    setCustomerName(currentName);
  }, [currentName]);

  // Mutation per aggiornare
  const updateMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await fetch(`${API_BASE}/preventivi/${preventivoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_name: name }),
      });
      if (!response.ok) throw new Error("Errore nell'aggiornamento");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preventivo", preventivoId] });
      queryClient.invalidateQueries({ queryKey: ["preventivi"] });
      toast.success("Nome cliente aggiornato");
      setIsEditing(false);
    },
    onError: () => {
      toast.error("Errore nell'aggiornamento del nome cliente");
    },
  });

  // Auto-save con debounce quando in editing
  useEffect(() => {
    if (!isEditing) return;
    
    const timer = setTimeout(() => {
      if (customerName !== currentName && customerName.trim() !== "") {
        updateMutation.mutate(customerName);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [customerName, isEditing]);

  const handleBlur = () => {
    if (customerName !== currentName && customerName.trim() !== "") {
      updateMutation.mutate(customerName);
    }
    setIsEditing(false);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500">Cliente:</span>
      {isEditing ? (
        <div className="relative">
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            onBlur={handleBlur}
            autoFocus
            className="text-sm font-medium text-gray-700 border-b border-blue-500 bg-transparent focus:outline-none px-1 py-0.5"
            placeholder="Nome cliente..."
          />
          {updateMutation.isPending && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
              <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setIsEditing(true)}
          className="text-sm font-medium text-gray-700 hover:text-blue-600 hover:underline transition-colors"
        >
          {customerName || 'Clicca per aggiungere'}
        </button>
      )}
    </div>
  );
}

export default CustomerNameEditor;
