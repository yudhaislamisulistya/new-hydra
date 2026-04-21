export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          role: 'student' | 'parent' | 'admin'
          full_name: string | null
          email: string | null
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id: string
          role?: 'student' | 'parent' | 'admin'
          full_name?: string | null
          email?: string | null
          avatar_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          role?: 'student' | 'parent' | 'admin'
          full_name?: string | null
          email?: string | null
          avatar_url?: string | null
          created_at?: string
        }
      }
      student_profiles: {
        Row: {
          id: string
          parent_id: string | null
          birth_date: string | null
          gender: 'male' | 'female' | null
          weight_kg: number | null
          height_cm: number | null
          daily_water_target_ml: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          parent_id?: string | null
          birth_date?: string | null
          gender?: 'male' | 'female' | null
          weight_kg?: number | null
          height_cm?: number | null
          daily_water_target_ml?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          parent_id?: string | null
          birth_date?: string | null
          gender?: 'male' | 'female' | null
          weight_kg?: number | null
          height_cm?: number | null
          daily_water_target_ml?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      hydration_logs: {
        Row: {
          id: string
          student_id: string
          amount_ml: number
          drink_type: string | null
          logged_at: string
          created_at: string
        }
        Insert: {
          id?: string
          student_id: string
          amount_ml: number
          drink_type?: string | null
          logged_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          student_id?: string
          amount_ml?: number
          drink_type?: string | null
          logged_at?: string
          created_at?: string
        }
      }
      education_materials: {
        Row: {
          id: string
          title: string
          content: string
          type: 'article' | 'video' | 'infographic'
          media_url: string | null
          target_audience: 'student' | 'parent' | 'all' | null
          created_by: string | null
          is_published: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          content: string
          type?: 'article' | 'video' | 'infographic'
          media_url?: string | null
          target_audience?: 'student' | 'parent' | 'all' | null
          created_by?: string | null
          is_published?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          content?: string
          type?: 'article' | 'video' | 'infographic'
          media_url?: string | null
          target_audience?: 'student' | 'parent' | 'all' | null
          created_by?: string | null
          is_published?: boolean | null
          created_at?: string
          updated_at?: string
        }
      }
      surveys: {
        Row: {
          id: string
          title: string
          description: string | null
          target_role: 'student' | 'parent' | null
          is_active: boolean | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          target_role?: 'student' | 'parent' | null
          is_active?: boolean | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          target_role?: 'student' | 'parent' | null
          is_active?: boolean | null
          created_by?: string | null
          created_at?: string
        }
      }
      survey_questions: {
        Row: {
          id: string
          survey_id: string
          question_text: string
          question_type: 'text' | 'multiple_choice' | 'scale'
          options: Json | null
          order_number: number
          created_at: string
        }
        Insert: {
          id?: string
          survey_id: string
          question_text: string
          question_type: 'text' | 'multiple_choice' | 'scale'
          options?: Json | null
          order_number?: number
          created_at?: string
        }
        Update: {
          id?: string
          survey_id?: string
          question_text?: string
          question_type?: 'text' | 'multiple_choice' | 'scale'
          options?: Json | null
          order_number?: number
          created_at?: string
        }
      }
    }
  }
}
