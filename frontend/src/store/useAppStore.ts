import { create } from 'zustand';

interface AppState {
  isSaving: boolean;
  lastSaved: Date | null;
  setIsSaving: (isSaving: boolean) => void;
  setLastSaved: (lastSaved: Date) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isSaving: false,
  lastSaved: null,
  setIsSaving: (isSaving) => set({ isSaving }),
  setLastSaved: (lastSaved) => set({ lastSaved }),
}));
