import { create } from "zustand";
import { createClient } from "../utils/supabase/client";

export type UserRole = "student" | "parent" | "admin" | null;

export interface UserProfile {
  id: string;
  role: UserRole;
  nickname: string;
  age: number;
  gender: string;
  weight_kg: number;
  height_cm: number;
  student_code?: string;
}

interface UserState {
  profile: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  fetchProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useUserStore = create<UserState>((set) => ({
  profile: null,
  isAuthenticated: false,
  isLoading: true,
  
  fetchProfile: async () => {
    set({ isLoading: true });
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        set({ profile: null, isAuthenticated: false, isLoading: false });
        return;
      }

      // Fetch from profiles
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!profileData) {
        set({ isAuthenticated: true, isLoading: false });
        return;
      }

      const role = profileData.role as UserRole;
      let extraData = {};

      if (role === 'student') {
        const { data: studentData } = await supabase
          .from('student_profiles')
          .select('*')
          .eq('id', user.id)
          .single();
          
        if (studentData) {
          // Calculate age roughly
          const age = studentData.birth_date 
            ? Math.floor((new Date().getTime() - new Date(studentData.birth_date).getTime()) / 3.15576e+10)
            : 10;
            
          extraData = {
            age,
            gender: studentData.gender || 'male',
            weight_kg: studentData.weight_kg || 0,
            height_cm: studentData.height_cm || 0,
            student_code: studentData.student_code || '',
          };
        }
      }

      set({
        profile: {
          id: user.id,
          role: role,
          nickname: profileData.full_name || 'User',
          age: 0,
          gender: 'male',
          weight_kg: 0,
          height_cm: 0,
          ...extraData
        },
        isAuthenticated: true,
        isLoading: false,
      });

    } catch (error) {
      console.error("Error fetching profile:", error);
      set({ isLoading: false });
    }
  },

  logout: async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    set({ profile: null, isAuthenticated: false });
  },
}));
