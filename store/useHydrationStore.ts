import { create } from "zustand";
import { createClient } from "../utils/api/client";
import { formatLocalDateKey } from "../utils/hydrationCalc";
import type { ActivityLevel } from "../utils/hydrationCalc";

export interface FluidRecord {
  id: string;
  student_id: string;
  date: string;
  activity_level: "rendah" | "sedang" | "tinggi";
  total_intake_ml: number;
  required_intake_ml: number;
  status: "fulfilled" | "unfulfilled";
}

interface HydrationState {
  records: Record<string, FluidRecord>; // Key is YYYY-MM-DD
  isLoading: boolean;
  fetchLogs: (studentId: string, dailyTarget: number, activityLevel?: ActivityLevel) => Promise<void>;
  addIntake: (
    studentId: string,
    amount: number,
    drinkType: string,
    loggedAt?: string
  ) => Promise<boolean>;
}

export const useHydrationStore = create<HydrationState>((set) => ({
  records: {},
  isLoading: false,

  fetchLogs: async (studentId, dailyTarget, activityLevel = "sedang") => {
    set({ isLoading: true });
    const supabase = createClient();
    
    // Get today's start and end
    const today = new Date(`${formatLocalDateKey(new Date())}T00:00:00+07:00`);
    const tomorrow = new Date(today.getTime() + 86400000);
    
    const { data, error } = await supabase
      .from('hydration_logs')
      .select('*')
      .eq('student_id', studentId)
      .gte('logged_at', today.toISOString())
      .lt('logged_at', tomorrow.toISOString());

    if (!error && data) {
      const todayStr = formatLocalDateKey(today);
      const totalIntake = data.reduce((sum, log) => sum + log.amount_ml, 0);
      
      set((state) => ({
        records: {
          ...state.records,
          [todayStr]: {
            id: 'today',
            student_id: studentId,
            date: todayStr,
            activity_level: activityLevel,
            total_intake_ml: totalIntake,
            required_intake_ml: dailyTarget || 1500,
            status: totalIntake >= (dailyTarget || 1500) ? "fulfilled" : "unfulfilled",
          }
        },
        isLoading: false
      }));
    } else {
      set({ isLoading: false });
    }
  },

  addIntake: async (studentId, amount, drinkType, loggedAt) => {
    const supabase = createClient();
    
    // Insert into DB
    const { error } = await supabase
      .from('hydration_logs')
      .insert({
        student_id: studentId,
        amount_ml: amount,
        drink_type: drinkType,
        logged_at: loggedAt || new Date().toISOString()
      });

    if (error) {
      console.error("Error saving hydration log:", error);
      return false;
    }

    return true;
  },
}));
