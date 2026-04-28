import { create } from "zustand";
import { createClient } from "../utils/supabase/client";
import { formatLocalDateKey } from "../utils/hydrationCalc";

export interface FluidRecord {
  id: string;
  date: string;
  activity_level: "rendah" | "sedang" | "tinggi";
  total_intake_ml: number;
  required_intake_ml: number;
  status: "fulfilled" | "unfulfilled";
}

interface HydrationState {
  records: Record<string, FluidRecord>; // Key is YYYY-MM-DD
  isLoading: boolean;
  fetchLogs: (studentId: string, dailyTarget: number) => Promise<void>;
  addIntake: (
    studentId: string,
    date: string,
    amount: number,
    drinkType: string,
    required: number,
    activity: "rendah" | "sedang" | "tinggi",
    loggedAt?: string
  ) => Promise<boolean>;
}

export const useHydrationStore = create<HydrationState>((set) => ({
  records: {},
  isLoading: false,

  fetchLogs: async (studentId, dailyTarget) => {
    set({ isLoading: true });
    const supabase = createClient();
    
    // Get today's start and end
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const { data, error } = await supabase
      .from('hydration_logs')
      .select('*')
      .eq('student_id', studentId)
      .gte('logged_at', today.toISOString());

    if (!error && data) {
      const todayStr = formatLocalDateKey(today);
      const totalIntake = data.reduce((sum, log) => sum + log.amount_ml, 0);
      
      set((state) => ({
        records: {
          ...state.records,
          [todayStr]: {
            id: 'today',
            date: todayStr,
            activity_level: "sedang",
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

  addIntake: async (studentId, date, amount, drinkType, required, activity, loggedAt) => {
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

    // Update local state
    set((state) => {
      const current = state.records[date];
      const newTotal = (current?.total_intake_ml || 0) + amount;
      return {
        records: {
          ...state.records,
          [date]: {
            id: current?.id || Math.random().toString(36).substring(7),
            date,
            activity_level: activity,
            total_intake_ml: newTotal,
            required_intake_ml: required,
            status: newTotal >= required ? "fulfilled" : "unfulfilled",
          },
        },
      };
    });

    return true;
  },
}));
