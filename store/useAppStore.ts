import { create } from "zustand";

interface AppState {
  selectedDate: string; // YYYY-MM-DD
  setSelectedDate: (date: string) => void;
  // We can add global UI states here (e.g., isBottomNavVisible)
}

export const useAppStore = create<AppState>()((set) => ({
  selectedDate: new Date().toISOString().split("T")[0],
  setSelectedDate: (date) => set({ selectedDate: date }),
}));
