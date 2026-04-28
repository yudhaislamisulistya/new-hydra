import { create } from "zustand";
import { createClient } from "../utils/supabase/client";

export type UserRole = "student" | "parent" | "admin" | "teacher" | null;

type SchoolRelation = {
  name: string | null;
}[] | {
  name: string | null;
} | null;

export interface UserProfile {
  id: string;
  role: UserRole;
  nickname: string;
  username: string;
  age: number;
  birth_date?: string | null;
  gender: string;
  weight_kg: number;
  height_cm: number;
  student_code?: string;
  school_id?: string | null;
  school_name?: string;
  class_level?: number | null;
  child_order?: number | null;
  phone?: string;
  employee_number?: string;
  full_title?: string;
  education_level?: string;
  occupation?: string;
  income_category?: string;
  income_reference?: string;
  income_amount?: number | null;
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
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        set({ profile: null, isAuthenticated: false, isLoading: false });
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (!profileData) {
        set({ isAuthenticated: true, isLoading: false });
        return;
      }

      const role = profileData.role as UserRole;
      let extraData = {};

      if (role === "student") {
        const { data: studentData } = await supabase
          .from("student_profiles")
          .select("birth_date, gender, weight_kg, height_cm, student_code, school_id, class_level, child_order, schools(name)")
          .eq("id", user.id)
          .single();

        if (studentData) {
          const schoolsRelation = studentData.schools as SchoolRelation;
          const schoolRow = Array.isArray(schoolsRelation) ? schoolsRelation[0] : schoolsRelation;
          const age = studentData.birth_date
            ? Math.floor((new Date().getTime() - new Date(studentData.birth_date).getTime()) / 3.15576e10)
            : 10;

          extraData = {
            age,
            birth_date: studentData.birth_date || null,
            gender: studentData.gender || "male",
            weight_kg: studentData.weight_kg || 0,
            height_cm: studentData.height_cm || 0,
            student_code: studentData.student_code || "",
            school_id: studentData.school_id || null,
            school_name: schoolRow?.name || "",
            class_level: studentData.class_level || null,
            child_order: studentData.child_order || null,
          };
        }
      }

      if (role === "teacher") {
        const { data: teacherData } = await supabase
          .from("teacher_profiles")
          .select("gender, phone, employee_number, full_title, school_id, schools(name)")
          .eq("id", user.id)
          .single();

        if (teacherData) {
          const schoolsRelation = teacherData.schools as SchoolRelation;
          const schoolRow = Array.isArray(schoolsRelation) ? schoolsRelation[0] : schoolsRelation;

          extraData = {
            age: 0,
            gender: teacherData.gender || "male",
            weight_kg: 0,
            height_cm: 0,
            school_id: teacherData.school_id || null,
            school_name: schoolRow?.name || "",
            phone: teacherData.phone || "",
            employee_number: teacherData.employee_number || "",
            full_title: teacherData.full_title || "",
          };
        }
      }

      if (role === "parent") {
        const { data: parentData } = await supabase
          .from("parent_profiles")
          .select("education_level, occupation, gender, age_years, income_category, income_reference, income_amount")
          .eq("id", user.id)
          .single();

        if (parentData) {
          extraData = {
            age: parentData.age_years || 0,
            gender: parentData.gender || "male",
            weight_kg: 0,
            height_cm: 0,
            education_level: parentData.education_level || "",
            occupation: parentData.occupation || "",
            income_category: parentData.income_category || "",
            income_reference: parentData.income_reference || "",
            income_amount: parentData.income_amount || null,
          };
        }
      }

      set({
        profile: {
          id: user.id,
          role,
          nickname: profileData.full_name || "User",
          username: profileData.username || "",
          age: 0,
          gender: "male",
          weight_kg: 0,
          height_cm: 0,
          ...extraData,
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
