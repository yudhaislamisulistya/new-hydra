import { create } from "zustand";
import { formatLocalDateKey } from "../utils/hydrationCalc";

interface AppState {
  selectedDate: string; // YYYY-MM-DD
  setSelectedDate: (date: string) => void;
  // We can add global UI states here (e.g., isBottomNavVisible)
}

export const useAppStore = create<AppState>()((set) => ({
  selectedDate: formatLocalDateKey(new Date()),
  setSelectedDate: (date) => set({ selectedDate: date }),
}));
