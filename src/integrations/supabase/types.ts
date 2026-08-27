export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          answer: string | null
          audio_duration_sec: number | null
          audio_name: string | null
          audio_url: string | null
          category: string | null
          correct_index: number | null
          created_at: string
          feedback: string | null
          id: number
          items: Json | null
          name: string
          options: Json | null
          paragraph: string | null
          prompt: string | null
          question: string | null
          session_phase: string | null
          type: Database["public"]["Enums"]["exercise_type"]
          unit_id: string
          updated_at: string
        }
        Insert: {
          answer?: string | null
          audio_duration_sec?: number | null
          audio_name?: string | null
          audio_url?: string | null
          category?: string | null
          correct_index?: number | null
          created_at?: string
          feedback?: string | null
          id?: never
          items?: Json | null
          name: string
          options?: Json | null
          paragraph?: string | null
          prompt?: string | null
          question?: string | null
          session_phase?: string | null
          type: Database["public"]["Enums"]["exercise_type"]
          unit_id: string
          updated_at?: string
        }
        Update: {
          answer?: string | null
          audio_duration_sec?: number | null
          audio_name?: string | null
          audio_url?: string | null
          category?: string | null
          correct_index?: number | null
          created_at?: string
          feedback?: string | null
          id?: never
          items?: Json | null
          name?: string
          options?: Json | null
          paragraph?: string | null
          prompt?: string | null
          question?: string | null
          session_phase?: string | null
          type?: Database["public"]["Enums"]["exercise_type"]
          unit_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      activity_completions: {
        Row: {
          completed: boolean
          student_id: string
          unit_id: string
        }
        Insert: {
          completed?: boolean
          student_id: string
          unit_id: string
        }
        Update: {
          completed?: boolean
          student_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_completions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_scores: {
        Row: {
          activity_id: number
          attempted: boolean
          attempts: number
          best: number
          last_at: string | null
          student_id: string
        }
        Insert: {
          activity_id: number
          attempted?: boolean
          attempts?: number
          best?: number
          last_at?: string | null
          student_id: string
        }
        Update: {
          activity_id?: number
          attempted?: boolean
          attempts?: number
          best?: number
          last_at?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_scores_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_scores_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_dismissals: {
        Row: {
          announcement_id: number
          user_id: string
        }
        Insert: {
          announcement_id: number
          user_id: string
        }
        Update: {
          announcement_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_dismissals_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_dismissals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: Database["public"]["Enums"]["announcement_audience"]
          expires_at: string | null
          id: number
          message: string
          published_at: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["announcement_audience"]
          expires_at?: string | null
          id?: never
          message: string
          published_at?: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["announcement_audience"]
          expires_at?: string | null
          id?: never
          message?: string
          published_at?: string
        }
        Relationships: []
      }
      app_users: {
        Row: {
          access_plan: Database["public"]["Enums"]["access_plan"] | null
          addon_bookclubs_per_month: number | null
          addon_insights_per_month: number | null
          addon_spotlight_per_month: number | null
          addon_workshops_enabled: boolean | null
          admin_notes: string | null
          admin_type: Database["public"]["Enums"]["admin_type"] | null
          attendance_percentage: number | null
          availability_request_at: string | null
          availability_request_note: string | null
          avatar_url: string | null
          bookclub_strikes: number | null
          company: string | null
          contracted_levels: string[] | null
          created_at: string
          current_level: string | null
          current_roadmap_level: string | null
          custom_price: number | null
          cycle_start: string | null
          email: string
          exclude_from_financials: boolean
          failed_login_attempts: number
          focus: string | null
          freeze_end: string | null
          freeze_start: string | null
          hire_date: string | null
          hired_sessions: number | null
          hourly_rate: number | null
          hours_cycle: number | null
          hours_month: number | null
          id: string
          insights_strikes: number | null
          last_mystery_box_opened_at: string | null
          legacy_id: string | null
          login_locked_at: string | null
          member_since: string | null
          monthly_amount: number | null
          must_change_password: boolean
          mystery_box_pick_id: number | null
          name: string
          next_payment: string | null
          payment_day: number | null
          payment_frequency:
            | Database["public"]["Enums"]["payment_frequency"]
            | null
          phone: string | null
          plan_punctuality: number | null
          product: Database["public"]["Enums"]["product_id"] | null
          product_type: Database["public"]["Enums"]["product_type"] | null
          qualified_products: Database["public"]["Enums"]["product_id"][] | null
          rating: number | null
          remaining_sessions: number | null
          reopened_levels: string[] | null
          report_punctuality: number | null
          reschedule_custom_hours: number | null
          reschedule_custom_pct: number | null
          reschedule_policy: string | null
          role: Database["public"]["Enums"]["user_role"]
          session_duration: number | null
          sessions_auto: boolean | null
          sessions_per_week: number | null
          status: Database["public"]["Enums"]["student_status"] | null
          teacher_status: Database["public"]["Enums"]["teacher_status"] | null
          tier_frozen_days: number | null
          tier_frozen_since: string | null
          tier_reset_at: string | null
          updated_at: string
          video_call_link: string | null
        }
        Insert: {
          access_plan?: Database["public"]["Enums"]["access_plan"] | null
          addon_bookclubs_per_month?: number | null
          addon_insights_per_month?: number | null
          addon_spotlight_per_month?: number | null
          addon_workshops_enabled?: boolean | null
          admin_notes?: string | null
          admin_type?: Database["public"]["Enums"]["admin_type"] | null
          attendance_percentage?: number | null
          availability_request_at?: string | null
          availability_request_note?: string | null
          avatar_url?: string | null
          bookclub_strikes?: number | null
          company?: string | null
          contracted_levels?: string[] | null
          created_at?: string
          current_level?: string | null
          current_roadmap_level?: string | null
          custom_price?: number | null
          cycle_start?: string | null
          email: string
          exclude_from_financials?: boolean
          failed_login_attempts?: number
          focus?: string | null
          freeze_end?: string | null
          freeze_start?: string | null
          hire_date?: string | null
          hired_sessions?: number | null
          hourly_rate?: number | null
          hours_cycle?: number | null
          hours_month?: number | null
          id: string
          insights_strikes?: number | null
          last_mystery_box_opened_at?: string | null
          legacy_id?: string | null
          login_locked_at?: string | null
          member_since?: string | null
          monthly_amount?: number | null
          must_change_password?: boolean
          mystery_box_pick_id?: number | null
          name: string
          next_payment?: string | null
          payment_day?: number | null
          payment_frequency?:
            | Database["public"]["Enums"]["payment_frequency"]
            | null
          phone?: string | null
          plan_punctuality?: number | null
          product?: Database["public"]["Enums"]["product_id"] | null
          product_type?: Database["public"]["Enums"]["product_type"] | null
          qualified_products?:
            | Database["public"]["Enums"]["product_id"][]
            | null
          rating?: number | null
          remaining_sessions?: number | null
          reopened_levels?: string[] | null
          report_punctuality?: number | null
          reschedule_custom_hours?: number | null
          reschedule_custom_pct?: number | null
          reschedule_policy?: string | null
          role: Database["public"]["Enums"]["user_role"]
          session_duration?: number | null
          sessions_auto?: boolean | null
          sessions_per_week?: number | null
          status?: Database["public"]["Enums"]["student_status"] | null
          teacher_status?: Database["public"]["Enums"]["teacher_status"] | null
          tier_frozen_days?: number | null
          tier_frozen_since?: string | null
          tier_reset_at?: string | null
          updated_at?: string
          video_call_link?: string | null
        }
        Update: {
          access_plan?: Database["public"]["Enums"]["access_plan"] | null
          addon_bookclubs_per_month?: number | null
          addon_insights_per_month?: number | null
          addon_spotlight_per_month?: number | null
          addon_workshops_enabled?: boolean | null
          admin_notes?: string | null
          admin_type?: Database["public"]["Enums"]["admin_type"] | null
          attendance_percentage?: number | null
          availability_request_at?: string | null
          availability_request_note?: string | null
          avatar_url?: string | null
          bookclub_strikes?: number | null
          company?: string | null
          contracted_levels?: string[] | null
          created_at?: string
          current_level?: string | null
          current_roadmap_level?: string | null
          custom_price?: number | null
          cycle_start?: string | null
          email?: string
          exclude_from_financials?: boolean
          failed_login_attempts?: number
          focus?: string | null
          freeze_end?: string | null
          freeze_start?: string | null
          hire_date?: string | null
          hired_sessions?: number | null
          hourly_rate?: number | null
          hours_cycle?: number | null
          hours_month?: number | null
          id?: string
          insights_strikes?: number | null
          last_mystery_box_opened_at?: string | null
          legacy_id?: string | null
          login_locked_at?: string | null
          member_since?: string | null
          monthly_amount?: number | null
          must_change_password?: boolean
          mystery_box_pick_id?: number | null
          name?: string
          next_payment?: string | null
          payment_day?: number | null
          payment_frequency?:
            | Database["public"]["Enums"]["payment_frequency"]
            | null
          phone?: string | null
          plan_punctuality?: number | null
          product?: Database["public"]["Enums"]["product_id"] | null
          product_type?: Database["public"]["Enums"]["product_type"] | null
          qualified_products?:
            | Database["public"]["Enums"]["product_id"][]
            | null
          rating?: number | null
          remaining_sessions?: number | null
          reopened_levels?: string[] | null
          report_punctuality?: number | null
          reschedule_custom_hours?: number | null
          reschedule_custom_pct?: number | null
          reschedule_policy?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          session_duration?: number | null
          sessions_auto?: boolean | null
          sessions_per_week?: number | null
          status?: Database["public"]["Enums"]["student_status"] | null
          teacher_status?: Database["public"]["Enums"]["teacher_status"] | null
          tier_frozen_days?: number | null
          tier_frozen_since?: string | null
          tier_reset_at?: string | null
          updated_at?: string
          video_call_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_users_mystery_box_pick_fkey"
            columns: ["mystery_box_pick_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          created_at: string
          student_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          student_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          student_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_change_requests: {
        Row: {
          created_at: string
          id: number
          proposed: Json
          reason: string | null
          resolved_at: string | null
          status: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          proposed: Json
          reason?: string | null
          resolved_at?: string | null
          status?: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: never
          proposed?: Json
          reason?: string | null
          resolved_at?: string | null
          status?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_change_requests_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      badge_defs: {
        Row: {
          code: string
          description: string | null
          id: number
          image_url: string | null
          metric: Database["public"]["Enums"]["badge_metric"]
          name: string
          system: Database["public"]["Enums"]["badge_system"]
          threshold: number | null
        }
        Insert: {
          code: string
          description?: string | null
          id?: never
          image_url?: string | null
          metric: Database["public"]["Enums"]["badge_metric"]
          name: string
          system: Database["public"]["Enums"]["badge_system"]
          threshold?: number | null
        }
        Update: {
          code?: string
          description?: string | null
          id?: never
          image_url?: string | null
          metric?: Database["public"]["Enums"]["badge_metric"]
          name?: string
          system?: Database["public"]["Enums"]["badge_system"]
          threshold?: number | null
        }
        Relationships: []
      }
      badge_override_log: {
        Row: {
          action: string
          actor_id: string
          actor_role: string
          at: string
          badge_id: number
          id: number
          student_id: string
          system: Database["public"]["Enums"]["badge_system"]
        }
        Insert: {
          action: string
          actor_id: string
          actor_role?: string
          at?: string
          badge_id: number
          id?: never
          student_id: string
          system: Database["public"]["Enums"]["badge_system"]
        }
        Update: {
          action?: string
          actor_id?: string
          actor_role?: string
          at?: string
          badge_id?: number
          id?: never
          student_id?: string
          system?: Database["public"]["Enums"]["badge_system"]
        }
        Relationships: [
          {
            foreignKeyName: "badge_override_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "badge_override_log_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badge_defs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "badge_override_log_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      badge_unlock_seen: {
        Row: {
          badge_storage_id: string
          seen_at: string
          student_id: string
        }
        Insert: {
          badge_storage_id: string
          seen_at?: string
          student_id: string
        }
        Update: {
          badge_storage_id?: string
          seen_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "badge_unlock_seen_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_threshold_setting: {
        Row: {
          id: boolean
          threshold: number
        }
        Insert: {
          id?: boolean
          threshold?: number
        }
        Update: {
          id?: boolean
          threshold?: number
        }
        Relationships: []
      }
      challenge_submission_history: {
        Row: {
          id: number
          link: string
          note: string | null
          status: Database["public"]["Enums"]["challenge_submission_status"]
          submission_id: number
          submitted_at: string
          teacher_feedback: string | null
        }
        Insert: {
          id?: never
          link: string
          note?: string | null
          status: Database["public"]["Enums"]["challenge_submission_status"]
          submission_id: number
          submitted_at: string
          teacher_feedback?: string | null
        }
        Update: {
          id?: never
          link?: string
          note?: string | null
          status?: Database["public"]["Enums"]["challenge_submission_status"]
          submission_id?: number
          submitted_at?: string
          teacher_feedback?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "challenge_submission_history_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "challenge_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_submissions: {
        Row: {
          challenge_format: Database["public"]["Enums"]["challenge_submission_format"]
          challenge_id: number
          id: number
          link: string
          note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["challenge_submission_status"]
          streak_before: number | null
          student_id: string
          submitted_at: string
          teacher_feedback: string | null
        }
        Insert: {
          challenge_format: Database["public"]["Enums"]["challenge_submission_format"]
          challenge_id: number
          id?: never
          link: string
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["challenge_submission_status"]
          streak_before?: number | null
          student_id: string
          submitted_at?: string
          teacher_feedback?: string | null
        }
        Update: {
          challenge_format?: Database["public"]["Enums"]["challenge_submission_format"]
          challenge_id?: number
          id?: never
          link?: string
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["challenge_submission_status"]
          streak_before?: number | null
          student_id?: string
          submitted_at?: string
          teacher_feedback?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "challenge_submissions_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          category: string
          code: string | null
          created_at: string
          description: string
          difficulty: Database["public"]["Enums"]["challenge_difficulty"] | null
          format: Database["public"]["Enums"]["flash_format"] | null
          icon_image_url: string | null
          id: number
          kind: Database["public"]["Enums"]["challenge_kind"]
          premium: boolean
          product: Database["public"]["Enums"]["product_id"]
          season_id: number | null
          skill_tags: string[] | null
          submission_instructions: string | null
          synced_group_id: string | null
          title: string
          video_url: string | null
        }
        Insert: {
          category: string
          code?: string | null
          created_at?: string
          description: string
          difficulty?:
            | Database["public"]["Enums"]["challenge_difficulty"]
            | null
          format?: Database["public"]["Enums"]["flash_format"] | null
          icon_image_url?: string | null
          id?: never
          kind: Database["public"]["Enums"]["challenge_kind"]
          premium?: boolean
          product: Database["public"]["Enums"]["product_id"]
          season_id?: number | null
          skill_tags?: string[] | null
          submission_instructions?: string | null
          synced_group_id?: string | null
          title: string
          video_url?: string | null
        }
        Update: {
          category?: string
          code?: string | null
          created_at?: string
          description?: string
          difficulty?:
            | Database["public"]["Enums"]["challenge_difficulty"]
            | null
          format?: Database["public"]["Enums"]["flash_format"] | null
          icon_image_url?: string | null
          id?: never
          kind?: Database["public"]["Enums"]["challenge_kind"]
          premium?: boolean
          product?: Database["public"]["Enums"]["product_id"]
          season_id?: number | null
          skill_tags?: string[] | null
          submission_instructions?: string | null
          synced_group_id?: string | null
          title?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "challenges_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "flash_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      club_bookings: {
        Row: {
          booked_at: string
          club_id: number
          club_type: Database["public"]["Enums"]["club_type"]
          id: number
          student_id: string
        }
        Insert: {
          booked_at?: string
          club_id: number
          club_type: Database["public"]["Enums"]["club_type"]
          id?: never
          student_id: string
        }
        Update: {
          booked_at?: string
          club_id?: number
          club_type?: Database["public"]["Enums"]["club_type"]
          id?: never
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_bookings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_bookings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      club_release_requests: {
        Row: {
          club_id: number
          id: number
          reason: string | null
          requested_at: string
          teacher_id: string
        }
        Insert: {
          club_id: number
          id?: never
          reason?: string | null
          requested_at?: string
          teacher_id: string
        }
        Update: {
          club_id?: number
          id?: never
          reason?: string | null
          requested_at?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_release_requests_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_release_requests_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      club_report_attendance: {
        Row: {
          attendance: string
          club_report_id: number
          student_id: string
        }
        Insert: {
          attendance: string
          club_report_id: number
          student_id: string
        }
        Update: {
          attendance?: string
          club_report_id?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_report_attendance_club_report_id_fkey"
            columns: ["club_report_id"]
            isOneToOne: false
            referencedRelation: "club_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_report_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      club_reports: {
        Row: {
          club_id: number | null
          comments: string | null
          event_type: Database["public"]["Enums"]["club_report_event_type"]
          id: number
          session_id: number | null
          submitted_at: string
          teacher_id: string
        }
        Insert: {
          club_id?: number | null
          comments?: string | null
          event_type: Database["public"]["Enums"]["club_report_event_type"]
          id?: never
          session_id?: number | null
          submitted_at?: string
          teacher_id: string
        }
        Update: {
          club_id?: number | null
          comments?: string | null
          event_type?: Database["public"]["Enums"]["club_report_event_type"]
          id?: never
          session_id?: number | null
          submitted_at?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_reports_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_reports_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_reports_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          claimed_at: string | null
          cover_image: string | null
          created_at: string
          date: string
          description: string | null
          duration_minutes: number
          id: number
          link: string | null
          material: string | null
          spots_taken: number
          spots_total: number
          status: Database["public"]["Enums"]["time_status"]
          teacher_id: string | null
          teacher_payment: number | null
          title: string
          type: Database["public"]["Enums"]["club_type"]
        }
        Insert: {
          claimed_at?: string | null
          cover_image?: string | null
          created_at?: string
          date: string
          description?: string | null
          duration_minutes: number
          id?: never
          link?: string | null
          material?: string | null
          spots_taken?: number
          spots_total: number
          status?: Database["public"]["Enums"]["time_status"]
          teacher_id?: string | null
          teacher_payment?: number | null
          title: string
          type: Database["public"]["Enums"]["club_type"]
        }
        Update: {
          claimed_at?: string | null
          cover_image?: string | null
          created_at?: string
          date?: string
          description?: string | null
          duration_minutes?: number
          id?: never
          link?: string | null
          material?: string | null
          spots_taken?: number
          spots_total?: number
          status?: Database["public"]["Enums"]["time_status"]
          teacher_id?: string | null
          teacher_payment?: number | null
          title?: string
          type?: Database["public"]["Enums"]["club_type"]
        }
        Relationships: [
          {
            foreignKeyName: "clubs_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      conduct_reports: {
        Row: {
          category: string
          created_at: string
          id: number
          reporter_id: string
          reviewed_at: string | null
          status: Database["public"]["Enums"]["conduct_report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["conduct_report_target"]
          text: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: never
          reporter_id: string
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["conduct_report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["conduct_report_target"]
          text: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: never
          reporter_id?: string
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["conduct_report_status"]
          target_id?: string
          target_type?: Database["public"]["Enums"]["conduct_report_target"]
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "conduct_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_reports_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_issue_reports: {
        Row: {
          created_at: string
          detail: string | null
          entity_id: string
          entity_title: string | null
          entity_type: Database["public"]["Enums"]["content_issue_entity_type"]
          id: number
          issue_type: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["content_issue_status"]
          student_id: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          entity_id: string
          entity_title?: string | null
          entity_type: Database["public"]["Enums"]["content_issue_entity_type"]
          id?: never
          issue_type: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["content_issue_status"]
          student_id: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          entity_id?: string
          entity_title?: string | null
          entity_type?: Database["public"]["Enums"]["content_issue_entity_type"]
          id?: never
          issue_type?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["content_issue_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_issue_reports_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      course_levels: {
        Row: {
          code: string
          id: number
          position: number
          product_course_id: number
        }
        Insert: {
          code: string
          id?: never
          position: number
          product_course_id: number
        }
        Update: {
          code?: string
          id?: never
          position?: number
          product_course_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_levels_product_course_id_fkey"
            columns: ["product_course_id"]
            isOneToOne: false
            referencedRelation: "product_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_units: {
        Row: {
          block: string | null
          code: string
          course_level_id: number
          grammar_point: string | null
          id: number
          pdf_url: string | null
          position: number
          teaser: string | null
          title: string
          video_url: string | null
          vocabulary: string[] | null
        }
        Insert: {
          block?: string | null
          code: string
          course_level_id: number
          grammar_point?: string | null
          id?: never
          pdf_url?: string | null
          position: number
          teaser?: string | null
          title: string
          video_url?: string | null
          vocabulary?: string[] | null
        }
        Update: {
          block?: string | null
          code?: string
          course_level_id?: number
          grammar_point?: string | null
          id?: never
          pdf_url?: string | null
          position?: number
          teaser?: string | null
          title?: string
          video_url?: string | null
          vocabulary?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "course_units_course_level_id_fkey"
            columns: ["course_level_id"]
            isOneToOne: false
            referencedRelation: "course_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      coverage_notes: {
        Row: {
          note: string | null
          student_id: string
          teacher_id: string
        }
        Insert: {
          note?: string | null
          student_id: string
          teacher_id: string
        }
        Update: {
          note?: string | null
          student_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coverage_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_notes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_course_meta: {
        Row: {
          cover_image: string | null
          created_at: string
          id: number
          kind: Database["public"]["Enums"]["custom_unit_kind"]
          student_id: string
          title: string
          updated_at: string
        }
        Insert: {
          cover_image?: string | null
          created_at?: string
          id?: number
          kind: Database["public"]["Enums"]["custom_unit_kind"]
          student_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          cover_image?: string | null
          created_at?: string
          id?: number
          kind?: Database["public"]["Enums"]["custom_unit_kind"]
          student_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_course_meta_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_unit_completions: {
        Row: {
          completed_at: string
          custom_unit_id: number
          session_id: number
        }
        Insert: {
          completed_at?: string
          custom_unit_id: number
          session_id: number
        }
        Update: {
          completed_at?: string
          custom_unit_id?: number
          session_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "custom_unit_completions_custom_unit_id_fkey"
            columns: ["custom_unit_id"]
            isOneToOne: true
            referencedRelation: "custom_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_unit_completions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_units: {
        Row: {
          block: string | null
          created_at: string
          file_name: string | null
          file_url: string
          id: number
          kind: Database["public"]["Enums"]["custom_unit_kind"]
          position: number | null
          student_id: string
          title: string
          video_url: string | null
        }
        Insert: {
          block?: string | null
          created_at?: string
          file_name?: string | null
          file_url: string
          id?: never
          kind: Database["public"]["Enums"]["custom_unit_kind"]
          position?: number | null
          student_id: string
          title: string
          video_url?: string | null
        }
        Update: {
          block?: string | null
          created_at?: string
          file_name?: string | null
          file_url?: string
          id?: never
          kind?: Database["public"]["Enums"]["custom_unit_kind"]
          position?: number | null
          student_id?: string
          title?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_units_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      equipped_challenge_badges: {
        Row: {
          badge_id: number
          position: number
          student_id: string
        }
        Insert: {
          badge_id: number
          position: number
          student_id: string
        }
        Update: {
          badge_id?: number
          position?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipped_challenge_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badge_defs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipped_challenge_badges_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      equipped_profile_badges: {
        Row: {
          badge_id: number
          position: number
          student_id: string
        }
        Insert: {
          badge_id: number
          position: number
          student_id: string
        }
        Update: {
          badge_id?: number
          position?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipped_profile_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badge_defs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipped_profile_badges_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_issues: {
        Row: {
          created_at: string
          id: number
          teacher_id: string
          text: string
        }
        Insert: {
          created_at?: string
          id?: never
          teacher_id: string
          text: string
        }
        Update: {
          created_at?: string
          id?: never
          teacher_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_issues_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      flash_config: {
        Row: {
          accent_color: string | null
          accent_color_to: string | null
          box_art_url: string | null
          fill_mode: Database["public"]["Enums"]["fill_mode"] | null
          gradient_stops: Json | null
          id: boolean
          theme_image_url: string | null
          watermark_image_url: string | null
        }
        Insert: {
          accent_color?: string | null
          accent_color_to?: string | null
          box_art_url?: string | null
          fill_mode?: Database["public"]["Enums"]["fill_mode"] | null
          gradient_stops?: Json | null
          id?: boolean
          theme_image_url?: string | null
          watermark_image_url?: string | null
        }
        Update: {
          accent_color?: string | null
          accent_color_to?: string | null
          box_art_url?: string | null
          fill_mode?: Database["public"]["Enums"]["fill_mode"] | null
          gradient_stops?: Json | null
          id?: boolean
          theme_image_url?: string | null
          watermark_image_url?: string | null
        }
        Relationships: []
      }
      flash_seasons: {
        Row: {
          accent_color: string | null
          accent_color_to: string | null
          active: boolean
          badge_name: string | null
          created_at: string
          custom_font_name: string | null
          display_name: string
          fill_mode: Database["public"]["Enums"]["fill_mode"] | null
          font_preset: string | null
          gradient_stops: Json | null
          id: number
          theme_image_url: string | null
          watermark_image_url: string | null
        }
        Insert: {
          accent_color?: string | null
          accent_color_to?: string | null
          active?: boolean
          badge_name?: string | null
          created_at?: string
          custom_font_name?: string | null
          display_name: string
          fill_mode?: Database["public"]["Enums"]["fill_mode"] | null
          font_preset?: string | null
          gradient_stops?: Json | null
          id?: never
          theme_image_url?: string | null
          watermark_image_url?: string | null
        }
        Update: {
          accent_color?: string | null
          accent_color_to?: string | null
          active?: boolean
          badge_name?: string | null
          created_at?: string
          custom_font_name?: string | null
          display_name?: string
          fill_mode?: Database["public"]["Enums"]["fill_mode"] | null
          font_preset?: string | null
          gradient_stops?: Json | null
          id?: never
          theme_image_url?: string | null
          watermark_image_url?: string | null
        }
        Relationships: []
      }
      freemium_state: {
        Row: {
          kind: string
          silenced_at: string | null
          student_id: string
          used_at: string | null
        }
        Insert: {
          kind: string
          silenced_at?: string | null
          student_id: string
          used_at?: string | null
        }
        Update: {
          kind?: string
          silenced_at?: string | null
          student_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "freemium_state_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          archived_at: string | null
          group_id: number
          joined_at: string
          prior_group_id: number | null
          removal_started_at: string | null
          status: Database["public"]["Enums"]["group_member_status"]
          student_id: string
        }
        Insert: {
          archived_at?: string | null
          group_id: number
          joined_at?: string
          prior_group_id?: number | null
          removal_started_at?: string | null
          status?: Database["public"]["Enums"]["group_member_status"]
          student_id: string
        }
        Update: {
          archived_at?: string | null
          group_id?: number
          joined_at?: string
          prior_group_id?: number | null
          removal_started_at?: string | null
          status?: Database["public"]["Enums"]["group_member_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_prior_group_id_fkey"
            columns: ["prior_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          access_plan: Database["public"]["Enums"]["access_plan"] | null
          addon_bookclubs_per_month: number | null
          addon_insights_per_month: number | null
          addon_spotlight_per_month: number | null
          addon_workshops_enabled: boolean | null
          company_client: string | null
          contracted_levels: string[] | null
          created_at: string
          current_roadmap_level: string | null
          cycle_start: string | null
          focus: string | null
          hired_sessions: number | null
          id: number
          max_capacity: number
          monthly_amount: number | null
          name: string
          next_payment: string | null
          payment_day: number | null
          product: Database["public"]["Enums"]["product_id"] | null
          product_type: Database["public"]["Enums"]["product_type"]
          remaining_sessions: number | null
          reschedule_custom_hours: number | null
          reschedule_custom_pct: number | null
          reschedule_policy: string | null
          session_duration: number | null
          sessions_per_week: number | null
          teacher_id: string | null
          updated_at: string
          video_call_link: string | null
        }
        Insert: {
          access_plan?: Database["public"]["Enums"]["access_plan"] | null
          addon_bookclubs_per_month?: number | null
          addon_insights_per_month?: number | null
          addon_spotlight_per_month?: number | null
          addon_workshops_enabled?: boolean | null
          company_client?: string | null
          contracted_levels?: string[] | null
          created_at?: string
          current_roadmap_level?: string | null
          cycle_start?: string | null
          focus?: string | null
          hired_sessions?: number | null
          id?: never
          max_capacity: number
          monthly_amount?: number | null
          name: string
          next_payment?: string | null
          payment_day?: number | null
          product?: Database["public"]["Enums"]["product_id"] | null
          product_type?: Database["public"]["Enums"]["product_type"]
          remaining_sessions?: number | null
          reschedule_custom_hours?: number | null
          reschedule_custom_pct?: number | null
          reschedule_policy?: string | null
          session_duration?: number | null
          sessions_per_week?: number | null
          teacher_id?: string | null
          updated_at?: string
          video_call_link?: string | null
        }
        Update: {
          access_plan?: Database["public"]["Enums"]["access_plan"] | null
          addon_bookclubs_per_month?: number | null
          addon_insights_per_month?: number | null
          addon_spotlight_per_month?: number | null
          addon_workshops_enabled?: boolean | null
          company_client?: string | null
          contracted_levels?: string[] | null
          created_at?: string
          current_roadmap_level?: string | null
          cycle_start?: string | null
          focus?: string | null
          hired_sessions?: number | null
          id?: never
          max_capacity?: number
          monthly_amount?: number | null
          name?: string
          next_payment?: string | null
          payment_day?: number | null
          product?: Database["public"]["Enums"]["product_id"] | null
          product_type?: Database["public"]["Enums"]["product_type"]
          remaining_sessions?: number | null
          reschedule_custom_hours?: number | null
          reschedule_custom_pct?: number | null
          reschedule_policy?: string | null
          session_duration?: number | null
          sessions_per_week?: number | null
          teacher_id?: string | null
          updated_at?: string
          video_call_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      hidden_mock_users: {
        Row: {
          hidden_at: string
          hidden_by: string | null
          id: string
        }
        Insert: {
          hidden_at?: string
          hidden_by?: string | null
          id: string
        }
        Update: {
          hidden_at?: string
          hidden_by?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hidden_mock_users_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          date: string
          id: number
          label: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: never
          label: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: never
          label?: string
        }
        Relationships: []
      }
      invoice_requests: {
        Row: {
          billing_email: string | null
          business_name: string | null
          cfdi_use: string | null
          created_at: string
          id: number
          payment_log_entry_id: number
          postal_code: string | null
          rfc: string | null
          status: string
          student_id: string
          submitted_at: string | null
          tax_regime: string | null
          token: string
        }
        Insert: {
          billing_email?: string | null
          business_name?: string | null
          cfdi_use?: string | null
          created_at?: string
          id?: never
          payment_log_entry_id: number
          postal_code?: string | null
          rfc?: string | null
          status?: string
          student_id: string
          submitted_at?: string | null
          tax_regime?: string | null
          token: string
        }
        Update: {
          billing_email?: string | null
          business_name?: string | null
          cfdi_use?: string | null
          created_at?: string
          id?: never
          payment_log_entry_id?: number
          postal_code?: string | null
          rfc?: string | null
          status?: string
          student_id?: string
          submitted_at?: string | null
          tax_regime?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_requests_payment_log_entry_id_fkey"
            columns: ["payment_log_entry_id"]
            isOneToOne: false
            referencedRelation: "payment_log_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_identities: {
        Row: {
          mode: string
          nickname: string | null
          student_id: string
        }
        Insert: {
          mode?: string
          nickname?: string | null
          student_id: string
        }
        Update: {
          mode?: string
          nickname?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_identities_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_path_events: {
        Row: {
          id: number
          kind: string
          label: string | null
          ref: string
          student_id: string
          ts: string
        }
        Insert: {
          id?: never
          kind: string
          label?: string | null
          ref: string
          student_id: string
          ts?: string
        }
        Update: {
          id?: never
          kind?: string
          label?: string | null
          ref?: string
          student_id?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_path_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_plans: {
        Row: {
          comments: string
          custom_unit_id: number | null
          level_id: string | null
          planning_status: string
          saved_at: string
          session_id: number
          title: string
          type: Database["public"]["Enums"]["lesson_session_type"]
          unit_id: string | null
        }
        Insert: {
          comments: string
          custom_unit_id?: number | null
          level_id?: string | null
          planning_status: string
          saved_at?: string
          session_id: number
          title: string
          type: Database["public"]["Enums"]["lesson_session_type"]
          unit_id?: string | null
        }
        Update: {
          comments?: string
          custom_unit_id?: number | null
          level_id?: string | null
          planning_status?: string
          saved_at?: string
          session_id?: number
          title?: string
          type?: Database["public"]["Enums"]["lesson_session_type"]
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_plans_custom_unit_id_fkey"
            columns: ["custom_unit_id"]
            isOneToOne: false
            referencedRelation: "custom_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      lightning_state: {
        Row: {
          accepted_student_ids: string[]
          activated_at: string | null
          challenge_id: number | null
          duration_hours: number | null
          expires_at: string | null
          id: boolean
          product: Database["public"]["Enums"]["product_id"] | null
          status: string
        }
        Insert: {
          accepted_student_ids?: string[]
          activated_at?: string | null
          challenge_id?: number | null
          duration_hours?: number | null
          expires_at?: string | null
          id?: boolean
          product?: Database["public"]["Enums"]["product_id"] | null
          status?: string
        }
        Update: {
          accepted_student_ids?: string[]
          activated_at?: string | null
          challenge_id?: number | null
          duration_hours?: number | null
          expires_at?: string | null
          id?: boolean
          product?: Database["public"]["Enums"]["product_id"] | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lightning_state_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      lightning_theme: {
        Row: {
          accent_color: string | null
          accent_color_to: string | null
          fill_mode: Database["public"]["Enums"]["fill_mode"] | null
          gradient_stops: Json | null
          id: boolean
          theme_image_url: string | null
          watermark_image_url: string | null
        }
        Insert: {
          accent_color?: string | null
          accent_color_to?: string | null
          fill_mode?: Database["public"]["Enums"]["fill_mode"] | null
          gradient_stops?: Json | null
          id?: boolean
          theme_image_url?: string | null
          watermark_image_url?: string | null
        }
        Update: {
          accent_color?: string | null
          accent_color_to?: string | null
          fill_mode?: Database["public"]["Enums"]["fill_mode"] | null
          gradient_stops?: Json | null
          id?: boolean
          theme_image_url?: string | null
          watermark_image_url?: string | null
        }
        Relationships: []
      }
      log_retention_config: {
        Row: {
          id: boolean
          months: number
        }
        Insert: {
          id?: boolean
          months?: number
        }
        Update: {
          id?: boolean
          months?: number
        }
        Relationships: []
      }
      login_streaks: {
        Row: {
          current_streak: number
          last_active_date: string
          student_id: string
        }
        Insert: {
          current_streak?: number
          last_active_date: string
          student_id: string
        }
        Update: {
          current_streak?: number
          last_active_date?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "login_streaks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_financial_entries: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          entry_date: string
          entry_type: string
          id: number
          label: string
          linked_student_id: string | null
          linked_teacher_id: string | null
          month: string
          notes: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          entry_date: string
          entry_type: string
          id?: never
          label: string
          linked_student_id?: string | null
          linked_teacher_id?: string | null
          month: string
          notes?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          entry_date?: string
          entry_type?: string
          id?: never
          label?: string
          linked_student_id?: string | null
          linked_teacher_id?: string | null
          month?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_financial_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_financial_entries_linked_student_id_fkey"
            columns: ["linked_student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_financial_entries_linked_teacher_id_fkey"
            columns: ["linked_teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          category: string
          cover_image: string | null
          created_at: string
          id: number
          material_type: Database["public"]["Enums"]["material_type"]
          premium: boolean
          restrict_level: string | null
          restrict_product: Database["public"]["Enums"]["product_id"] | null
          title: string
          upload_url: string
        }
        Insert: {
          category: string
          cover_image?: string | null
          created_at?: string
          id?: never
          material_type: Database["public"]["Enums"]["material_type"]
          premium?: boolean
          restrict_level?: string | null
          restrict_product?: Database["public"]["Enums"]["product_id"] | null
          title: string
          upload_url?: string
        }
        Update: {
          category?: string
          cover_image?: string | null
          created_at?: string
          id?: never
          material_type?: Database["public"]["Enums"]["material_type"]
          premium?: boolean
          restrict_level?: string | null
          restrict_product?: Database["public"]["Enums"]["product_id"] | null
          title?: string
          upload_url?: string
        }
        Relationships: []
      }
      notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          admin_emails: string[]
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          admin_emails?: string[]
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          admin_emails?: string[]
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_installments: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          id: number
          installment_number: number
          paid_at: string | null
          payment_log_entry_id: string | null
          plan_id: number
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_date: string
          id?: never
          installment_number: number
          paid_at?: string | null
          payment_log_entry_id?: string | null
          plan_id: number
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          id?: never
          installment_number?: number
          paid_at?: string | null
          payment_log_entry_id?: string | null
          plan_id?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_installments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_log_entries: {
        Row: {
          amount: number
          card_last4: string | null
          company: string | null
          entity_type: Database["public"]["Enums"]["paid_entity_type"]
          folio: string | null
          group_id: number | null
          id: number
          issuing_bank: string | null
          method: string | null
          method_detail: string | null
          month: string
          name: string
          paid_at: string
          receipt_pdf_url: string | null
          receiving_bank: string | null
          student_id: string | null
          tracking_key: string | null
        }
        Insert: {
          amount: number
          card_last4?: string | null
          company?: string | null
          entity_type: Database["public"]["Enums"]["paid_entity_type"]
          folio?: string | null
          group_id?: number | null
          id?: never
          issuing_bank?: string | null
          method?: string | null
          method_detail?: string | null
          month: string
          name: string
          paid_at?: string
          receipt_pdf_url?: string | null
          receiving_bank?: string | null
          student_id?: string | null
          tracking_key?: string | null
        }
        Update: {
          amount?: number
          card_last4?: string | null
          company?: string | null
          entity_type?: Database["public"]["Enums"]["paid_entity_type"]
          folio?: string | null
          group_id?: number | null
          id?: never
          issuing_bank?: string | null
          method?: string | null
          method_detail?: string | null
          month?: string
          name?: string
          paid_at?: string
          receipt_pdf_url?: string | null
          receiving_bank?: string | null
          student_id?: string | null
          tracking_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_log_entries_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_log_entries_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_plans: {
        Row: {
          created_at: string
          created_by: string | null
          first_due_date: string
          frequency_days: number | null
          id: number
          installments_count: number
          method: string | null
          notes: string | null
          plan_type: string
          status: string
          student_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          first_due_date: string
          frequency_days?: number | null
          id?: never
          installments_count?: number
          method?: string | null
          notes?: string | null
          plan_type: string
          status?: string
          student_id: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          first_due_date?: string
          frequency_days?: number | null
          id?: never
          installments_count?: number
          method?: string | null
          notes?: string | null
          plan_type?: string
          status?: string
          student_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_ratings: {
        Row: {
          confidence: number
          created_at: string
          fluency: number
          grammar: number
          session_id: number
          student_id: string
          subskills: Json
          teacher_id: string
          updated_at: string
          vocabulary: number
        }
        Insert: {
          confidence?: number
          created_at?: string
          fluency?: number
          grammar?: number
          session_id: number
          student_id: string
          subskills?: Json
          teacher_id: string
          updated_at?: string
          vocabulary?: number
        }
        Update: {
          confidence?: number
          created_at?: string
          fluency?: number
          grammar?: number
          session_id?: number
          student_id?: string
          subskills?: Json
          teacher_id?: string
          updated_at?: string
          vocabulary?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_ratings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_ratings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_ratings_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      product_courses: {
        Row: {
          id: number
          product: Database["public"]["Enums"]["product_id"]
        }
        Insert: {
          id?: never
          product: Database["public"]["Enums"]["product_id"]
        }
        Update: {
          id?: never
          product?: Database["public"]["Enums"]["product_id"]
        }
        Relationships: []
      }
      report_admin_edits: {
        Row: {
          actor_id: string
          actor_name: string | null
          at: string
          field: string
          from_value: string
          id: number
          note: string | null
          session_id: number
          student_id: string | null
          to_value: string
        }
        Insert: {
          actor_id: string
          actor_name?: string | null
          at?: string
          field: string
          from_value: string
          id?: never
          note?: string | null
          session_id: number
          student_id?: string | null
          to_value: string
        }
        Update: {
          actor_id?: string
          actor_name?: string | null
          at?: string
          field?: string
          from_value?: string
          id?: never
          note?: string | null
          session_id?: number
          student_id?: string | null
          to_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_admin_edits_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_admin_edits_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_admin_edits_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      session_member_statuses: {
        Row: {
          absent_cause: string | null
          attendance_sub_status:
            | Database["public"]["Enums"]["attendance_sub_status"]
            | null
          session_id: number
          status: Database["public"]["Enums"]["ext_session_status"]
          student_id: string
        }
        Insert: {
          absent_cause?: string | null
          attendance_sub_status?:
            | Database["public"]["Enums"]["attendance_sub_status"]
            | null
          session_id: number
          status: Database["public"]["Enums"]["ext_session_status"]
          student_id: string
        }
        Update: {
          absent_cause?: string | null
          attendance_sub_status?:
            | Database["public"]["Enums"]["attendance_sub_status"]
            | null
          session_id?: number
          status?: Database["public"]["Enums"]["ext_session_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_member_statuses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_member_statuses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          absent_cause: string | null
          attendance_delayed: boolean | null
          attendance_sub_status:
            | Database["public"]["Enums"]["attendance_sub_status"]
            | null
          cancellation_note: string | null
          cancellation_reason:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          covered_by_substitute: boolean | null
          created_at: string
          date_time: string
          duration_minutes: number
          excluded_from_pay: boolean
          group_id: number | null
          holiday_makeup: boolean | null
          id: number
          needs_substitute: boolean | null
          notes: string | null
          origin: Database["public"]["Enums"]["session_origin"] | null
          report_comments: string | null
          report_locked: boolean | null
          report_pdf_url: string | null
          report_submitted_at: string | null
          review_note: string | null
          review_status: string | null
          status: Database["public"]["Enums"]["ext_session_status"]
          student_comment: string | null
          student_connected_at: string | null
          student_id: string | null
          student_rating: number | null
          teacher_connected_at: string | null
          teacher_id: string
          teams_link: string
          updated_at: string
          workshop_cohort_id: number | null
          workshop_template_id: number | null
          workshop_topic: string | null
        }
        Insert: {
          absent_cause?: string | null
          attendance_delayed?: boolean | null
          attendance_sub_status?:
            | Database["public"]["Enums"]["attendance_sub_status"]
            | null
          cancellation_note?: string | null
          cancellation_reason?:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          covered_by_substitute?: boolean | null
          created_at?: string
          date_time: string
          duration_minutes: number
          excluded_from_pay?: boolean
          group_id?: number | null
          holiday_makeup?: boolean | null
          id?: never
          needs_substitute?: boolean | null
          notes?: string | null
          origin?: Database["public"]["Enums"]["session_origin"] | null
          report_comments?: string | null
          report_locked?: boolean | null
          report_pdf_url?: string | null
          report_submitted_at?: string | null
          review_note?: string | null
          review_status?: string | null
          status?: Database["public"]["Enums"]["ext_session_status"]
          student_comment?: string | null
          student_connected_at?: string | null
          student_id?: string | null
          student_rating?: number | null
          teacher_connected_at?: string | null
          teacher_id: string
          teams_link: string
          updated_at?: string
          workshop_cohort_id?: number | null
          workshop_template_id?: number | null
          workshop_topic?: string | null
        }
        Update: {
          absent_cause?: string | null
          attendance_delayed?: boolean | null
          attendance_sub_status?:
            | Database["public"]["Enums"]["attendance_sub_status"]
            | null
          cancellation_note?: string | null
          cancellation_reason?:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          covered_by_substitute?: boolean | null
          created_at?: string
          date_time?: string
          duration_minutes?: number
          excluded_from_pay?: boolean
          group_id?: number | null
          holiday_makeup?: boolean | null
          id?: never
          needs_substitute?: boolean | null
          notes?: string | null
          origin?: Database["public"]["Enums"]["session_origin"] | null
          report_comments?: string | null
          report_locked?: boolean | null
          report_pdf_url?: string | null
          report_submitted_at?: string | null
          review_note?: string | null
          review_status?: string | null
          status?: Database["public"]["Enums"]["ext_session_status"]
          student_comment?: string | null
          student_connected_at?: string | null
          student_id?: string | null
          student_rating?: number | null
          teacher_connected_at?: string | null
          teacher_id?: string
          teams_link?: string
          updated_at?: string
          workshop_cohort_id?: number | null
          workshop_template_id?: number | null
          workshop_topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_workshop_cohort_id_fkey"
            columns: ["workshop_cohort_id"]
            isOneToOne: false
            referencedRelation: "workshop_cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_workshop_template_id_fkey"
            columns: ["workshop_template_id"]
            isOneToOne: false
            referencedRelation: "workshop_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      skills_taxonomy: {
        Row: {
          base_key: string
          macro: string
          sub: string
        }
        Insert: {
          base_key: string
          macro: string
          sub: string
        }
        Update: {
          base_key?: string
          macro?: string
          sub?: string
        }
        Relationships: []
      }
      staff_profiles: {
        Row: {
          headline: string | null
          specializations: string[] | null
          user_id: string
        }
        Insert: {
          headline?: string | null
          specializations?: string[] | null
          user_id: string
        }
        Update: {
          headline?: string | null
          specializations?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      strikes: {
        Row: {
          created_at: string
          id: number
          justification_cause:
            | Database["public"]["Enums"]["justification_cause"]
            | null
          justified: boolean | null
          justified_at: string | null
          medical_note_name: string | null
          needs_substitute: boolean | null
          note: string | null
          reason: Database["public"]["Enums"]["cancellation_reason"]
          session_id: number
          substitute_found: boolean | null
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          justification_cause?:
            | Database["public"]["Enums"]["justification_cause"]
            | null
          justified?: boolean | null
          justified_at?: string | null
          medical_note_name?: string | null
          needs_substitute?: boolean | null
          note?: string | null
          reason: Database["public"]["Enums"]["cancellation_reason"]
          session_id: number
          substitute_found?: boolean | null
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: never
          justification_cause?:
            | Database["public"]["Enums"]["justification_cause"]
            | null
          justified?: boolean | null
          justified_at?: string | null
          medical_note_name?: string | null
          needs_substitute?: boolean | null
          note?: string | null
          reason?: Database["public"]["Enums"]["cancellation_reason"]
          session_id?: number
          substitute_found?: boolean | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strikes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strikes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      student_contracts: {
        Row: {
          contract_fields: Json
          created_at: string
          created_by: string | null
          id: number
          pdf_hash: string | null
          pdf_signed_path: string | null
          pdf_unsigned_path: string | null
          signed_at: string | null
          signer_ip: string | null
          signer_user_agent: string | null
          status: string
          student_id: string
          token: string
          voided_at: string | null
          voided_reason: string | null
        }
        Insert: {
          contract_fields?: Json
          created_at?: string
          created_by?: string | null
          id?: number
          pdf_hash?: string | null
          pdf_signed_path?: string | null
          pdf_unsigned_path?: string | null
          signed_at?: string | null
          signer_ip?: string | null
          signer_user_agent?: string | null
          status?: string
          student_id: string
          token: string
          voided_at?: string | null
          voided_reason?: string | null
        }
        Update: {
          contract_fields?: Json
          created_at?: string
          created_by?: string | null
          id?: number
          pdf_hash?: string | null
          pdf_signed_path?: string | null
          pdf_unsigned_path?: string | null
          signed_at?: string | null
          signer_ip?: string | null
          signer_user_agent?: string | null
          status?: string
          student_id?: string
          token?: string
          voided_at?: string | null
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_contracts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      student_profiles: {
        Row: {
          headline: string | null
          personality_tags: string[] | null
          user_id: string
        }
        Insert: {
          headline?: string | null
          personality_tags?: string[] | null
          user_id: string
        }
        Update: {
          headline?: string | null
          personality_tags?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      student_reports: {
        Row: {
          created_at: string
          id: number
          student_id: string
          teacher_id: string
          text: string
        }
        Insert: {
          created_at?: string
          id?: never
          student_id: string
          teacher_id: string
          text: string
        }
        Update: {
          created_at?: string
          id?: never
          student_id?: string
          teacher_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_reports_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_reports_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      student_requests: {
        Row: {
          assigned_teacher_id: string | null
          claimed_at: string | null
          claimed_by: string | null
          duration_minutes: number
          id: number
          kind: Database["public"]["Enums"]["student_request_kind"]
          last_report_summary: string | null
          origin_session_id: number | null
          proposed_datetime: string
          requested_at: string
          spotlight_context: string | null
          status: Database["public"]["Enums"]["student_request_status"]
          student_id: string
        }
        Insert: {
          assigned_teacher_id?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          duration_minutes: number
          id?: never
          kind: Database["public"]["Enums"]["student_request_kind"]
          last_report_summary?: string | null
          origin_session_id?: number | null
          proposed_datetime: string
          requested_at?: string
          spotlight_context?: string | null
          status?: Database["public"]["Enums"]["student_request_status"]
          student_id: string
        }
        Update: {
          assigned_teacher_id?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          duration_minutes?: number
          id?: never
          kind?: Database["public"]["Enums"]["student_request_kind"]
          last_report_summary?: string | null
          origin_session_id?: number | null
          proposed_datetime?: string
          requested_at?: string
          spotlight_context?: string | null
          status?: Database["public"]["Enums"]["student_request_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_requests_assigned_teacher_id_fkey"
            columns: ["assigned_teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_requests_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_requests_origin_session_id_fkey"
            columns: ["origin_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_adjustments: {
        Row: {
          amount: number
          date: string
          id: number
          reason: string
          teacher_id: string
        }
        Insert: {
          amount: number
          date: string
          id?: never
          reason: string
          teacher_id: string
        }
        Update: {
          amount?: number
          date?: string
          id?: never
          reason?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_adjustments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_availability: {
        Row: {
          confirmed_at: string | null
          teacher_id: string
        }
        Insert: {
          confirmed_at?: string | null
          teacher_id: string
        }
        Update: {
          confirmed_at?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_availability_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: true
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_availability_blocks: {
        Row: {
          day: Database["public"]["Enums"]["day_key"]
          end_min: number
          id: number
          start_min: number
          teacher_id: string
        }
        Insert: {
          day: Database["public"]["Enums"]["day_key"]
          end_min: number
          id?: never
          start_min: number
          teacher_id: string
        }
        Update: {
          day?: Database["public"]["Enums"]["day_key"]
          end_min?: number
          id?: never
          start_min?: number
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_availability_blocks_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_kpi_monthly_snapshots: {
        Row: {
          base_composite: number | null
          month_key: string
          refusals: number | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          base_composite?: number | null
          month_key: string
          refusals?: number | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          base_composite?: number | null
          month_key?: string
          refusals?: number | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_kpi_monthly_snapshots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_kpi_overrides: {
        Row: {
          admin_id: string
          admin_name: string
          admin_type: Database["public"]["Enums"]["admin_type"] | null
          created_at: string
          evidence_name: string | null
          id: number
          justification: string
          metric: Database["public"]["Enums"]["kpi_metric"]
          month_key: string
          new_value: number
          previous_value: number | null
          teacher_id: string
        }
        Insert: {
          admin_id: string
          admin_name: string
          admin_type?: Database["public"]["Enums"]["admin_type"] | null
          created_at?: string
          evidence_name?: string | null
          id?: never
          justification: string
          metric: Database["public"]["Enums"]["kpi_metric"]
          month_key: string
          new_value: number
          previous_value?: number | null
          teacher_id: string
        }
        Update: {
          admin_id?: string
          admin_name?: string
          admin_type?: Database["public"]["Enums"]["admin_type"] | null
          created_at?: string
          evidence_name?: string | null
          id?: never
          justification?: string
          metric?: Database["public"]["Enums"]["kpi_metric"]
          month_key?: string
          new_value?: number
          previous_value?: number | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_kpi_overrides_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_kpi_overrides_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_payment_records: {
        Row: {
          date: string
          id: number
          status: Database["public"]["Enums"]["payment_record_status"]
          teacher_id: string
        }
        Insert: {
          date: string
          id?: never
          status?: Database["public"]["Enums"]["payment_record_status"]
          teacher_id: string
        }
        Update: {
          date?: string
          id?: never
          status?: Database["public"]["Enums"]["payment_record_status"]
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_payment_records_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_strikes: {
        Row: {
          created_at: string
          id: string
          justification_cause: string | null
          justified: boolean
          justified_at: string | null
          medical_note_name: string | null
          needs_substitute: boolean | null
          note: string | null
          reason: string
          session_id: number | null
          substitute_found: boolean | null
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id: string
          justification_cause?: string | null
          justified?: boolean
          justified_at?: string | null
          medical_note_name?: string | null
          needs_substitute?: boolean | null
          note?: string | null
          reason: string
          session_id?: number | null
          substitute_found?: boolean | null
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          justification_cause?: string | null
          justified?: boolean
          justified_at?: string | null
          medical_note_name?: string | null
          needs_substitute?: boolean | null
          note?: string | null
          reason?: string
          session_id?: number | null
          substitute_found?: boolean | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_strikes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_strikes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_access_events: {
        Row: {
          action: Database["public"]["Enums"]["unit_access_action"]
          actor_id: string
          actor_role: string
          at: string
          id: number
          student_id: string
          unit_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["unit_access_action"]
          actor_id: string
          actor_role: string
          at?: string
          id?: never
          student_id: string
          unit_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["unit_access_action"]
          actor_id?: string
          actor_role?: string
          at?: string
          id?: never
          student_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_access_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_access_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_attempts: {
        Row: {
          attempts: number
          student_id: string
          unit_id: string
        }
        Insert: {
          attempts?: number
          student_id: string
          unit_id: string
        }
        Update: {
          attempts?: number
          student_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_unlock_seen: {
        Row: {
          student_id: string
          unit_id: string
        }
        Insert: {
          student_id: string
          unit_id: string
        }
        Update: {
          student_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_unlock_seen_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_presence: {
        Row: {
          last_seen_at: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          user_id: string
        }
        Update: {
          last_seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_status_overrides: {
        Row: {
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_status_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_cohorts: {
        Row: {
          id: number
          name: string
          teacher_id: string | null
          video_call_link: string | null
          workshop_template_id: number
        }
        Insert: {
          id?: never
          name: string
          teacher_id?: string | null
          video_call_link?: string | null
          workshop_template_id: number
        }
        Update: {
          id?: never
          name?: string
          teacher_id?: string | null
          video_call_link?: string | null
          workshop_template_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "workshop_cohorts_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_cohorts_workshop_template_id_fkey"
            columns: ["workshop_template_id"]
            isOneToOne: false
            referencedRelation: "workshop_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_participants: {
        Row: {
          id: number
          kind: Database["public"]["Enums"]["workshop_participant_kind"]
          name: string
          student_id: string | null
          workshop_cohort_id: number
        }
        Insert: {
          id?: never
          kind: Database["public"]["Enums"]["workshop_participant_kind"]
          name: string
          student_id?: string | null
          workshop_cohort_id: number
        }
        Update: {
          id?: never
          kind?: Database["public"]["Enums"]["workshop_participant_kind"]
          name?: string
          student_id?: string | null
          workshop_cohort_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "workshop_participants_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_participants_workshop_cohort_id_fkey"
            columns: ["workshop_cohort_id"]
            isOneToOne: false
            referencedRelation: "workshop_cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_templates: {
        Row: {
          cover_url: string | null
          description: string | null
          id: number
          name: string
        }
        Insert: {
          cover_url?: string | null
          description?: string | null
          id?: never
          name: string
        }
        Update: {
          cover_url?: string | null
          description?: string | null
          id?: never
          name?: string
        }
        Relationships: []
      }
      workshop_unit_access: {
        Row: {
          open: boolean
          participant_id: number
          workshop_cohort_id: number
          workshop_unit_id: number
        }
        Insert: {
          open?: boolean
          participant_id: number
          workshop_cohort_id: number
          workshop_unit_id: number
        }
        Update: {
          open?: boolean
          participant_id?: number
          workshop_cohort_id?: number
          workshop_unit_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "workshop_unit_access_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "workshop_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_unit_access_workshop_cohort_id_fkey"
            columns: ["workshop_cohort_id"]
            isOneToOne: false
            referencedRelation: "workshop_cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_unit_access_workshop_unit_id_fkey"
            columns: ["workshop_unit_id"]
            isOneToOne: false
            referencedRelation: "workshop_units"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_units: {
        Row: {
          id: number
          pdf_url: string | null
          title: string
          video_url: string | null
          workshop_template_id: number
        }
        Insert: {
          id?: never
          pdf_url?: string | null
          title: string
          video_url?: string | null
          workshop_template_id: number
        }
        Update: {
          id?: never
          pdf_url?: string | null
          title?: string
          video_url?: string | null
          workshop_template_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "workshop_units_workshop_template_id_fkey"
            columns: ["workshop_template_id"]
            isOneToOne: false
            referencedRelation: "workshop_templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_lightning: { Args: { p_student_id: string }; Returns: undefined }
      activities_for_staff: {
        Args: never
        Returns: {
          answer: string | null
          audio_duration_sec: number | null
          audio_name: string | null
          audio_url: string | null
          category: string | null
          correct_index: number | null
          created_at: string
          feedback: string | null
          id: number
          items: Json | null
          name: string
          options: Json | null
          paragraph: string | null
          prompt: string | null
          question: string | null
          session_phase: string | null
          type: Database["public"]["Enums"]["exercise_type"]
          unit_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activities"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      activities_for_student: {
        Args: never
        Returns: {
          answer: string
          audio_duration_sec: number
          category: string
          correct_index: number
          feedback: string
          id: number
          items: Json
          name: string
          options: Json
          paragraph: string
          prompt: string
          question: string
          session_phase: string
          type: Database["public"]["Enums"]["exercise_type"]
          unit_id: string
        }[]
      }
      adjust_remaining_sessions: {
        Args: { p_delta: number; p_student_id: string }
        Returns: {
          access_plan: Database["public"]["Enums"]["access_plan"] | null
          addon_bookclubs_per_month: number | null
          addon_insights_per_month: number | null
          addon_spotlight_per_month: number | null
          addon_workshops_enabled: boolean | null
          admin_notes: string | null
          admin_type: Database["public"]["Enums"]["admin_type"] | null
          attendance_percentage: number | null
          availability_request_at: string | null
          availability_request_note: string | null
          avatar_url: string | null
          bookclub_strikes: number | null
          company: string | null
          contracted_levels: string[] | null
          created_at: string
          current_level: string | null
          current_roadmap_level: string | null
          custom_price: number | null
          cycle_start: string | null
          email: string
          exclude_from_financials: boolean
          failed_login_attempts: number
          focus: string | null
          freeze_end: string | null
          freeze_start: string | null
          hire_date: string | null
          hired_sessions: number | null
          hourly_rate: number | null
          hours_cycle: number | null
          hours_month: number | null
          id: string
          insights_strikes: number | null
          last_mystery_box_opened_at: string | null
          legacy_id: string | null
          login_locked_at: string | null
          member_since: string | null
          monthly_amount: number | null
          must_change_password: boolean
          mystery_box_pick_id: number | null
          name: string
          next_payment: string | null
          payment_day: number | null
          payment_frequency:
            | Database["public"]["Enums"]["payment_frequency"]
            | null
          phone: string | null
          plan_punctuality: number | null
          product: Database["public"]["Enums"]["product_id"] | null
          product_type: Database["public"]["Enums"]["product_type"] | null
          qualified_products: Database["public"]["Enums"]["product_id"][] | null
          rating: number | null
          remaining_sessions: number | null
          reopened_levels: string[] | null
          report_punctuality: number | null
          reschedule_custom_hours: number | null
          reschedule_custom_pct: number | null
          reschedule_policy: string | null
          role: Database["public"]["Enums"]["user_role"]
          session_duration: number | null
          sessions_auto: boolean | null
          sessions_per_week: number | null
          status: Database["public"]["Enums"]["student_status"] | null
          teacher_status: Database["public"]["Enums"]["teacher_status"] | null
          tier_frozen_days: number | null
          tier_frozen_since: string | null
          tier_reset_at: string | null
          updated_at: string
          video_call_link: string | null
        }
        SetofOptions: {
          from: "*"
          to: "app_users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_sessions_for_pay_review: {
        Args: { p_from: string; p_teacher_id: string; p_to: string }
        Returns: {
          date_time: string
          duration_minutes: number
          excluded_from_pay: boolean
          id: number
          status: Database["public"]["Enums"]["ext_session_status"]
          student_id: string
          student_name: string
        }[]
      }
      admin_set_session_excluded_from_pay: {
        Args: { p_excluded: boolean; p_session_id: number }
        Returns: undefined
      }
      group_profile_for_teacher: {
        Args: never
        Returns: {
          access_plan: Database["public"]["Enums"]["access_plan"]
          addon_bookclubs_per_month: number
          addon_insights_per_month: number
          addon_spotlight_per_month: number
          addon_workshops_enabled: boolean
          company_client: string
          contracted_levels: string[]
          current_roadmap_level: string
          focus: string
          hired_sessions: number
          id: number
          max_capacity: number
          name: string
          product: Database["public"]["Enums"]["product_id"]
          product_type: Database["public"]["Enums"]["product_type"]
          remaining_sessions: number
          session_duration: number
          sessions_per_week: number
          teacher_id: string
          video_call_link: string
        }[]
      }
      is_login_locked: { Args: { p_email: string }; Returns: boolean }
      legacy_id_lookup: {
        Args: never
        Returns: {
          id: string
          legacy_id: string
        }[]
      }
      log_session_connect: {
        Args: { p_role: string; p_session_id: number }
        Returns: undefined
      }
      record_failed_login: { Args: { p_email: string }; Returns: Json }
      record_successful_login: { Args: { p_email: string }; Returns: undefined }
      replace_teacher_availability: {
        Args: { p_blocks: Json; p_confirmed_at: string; p_teacher_id: string }
        Returns: undefined
      }
      save_teacher_kpi_snapshot: {
        Args: { p_base_composite?: number }
        Returns: undefined
      }
      student_convert_session_to_spotlight: {
        Args: { p_original_session_id: number; p_spotlight_context: string }
        Returns: number
      }
      student_profile_for_teacher: {
        Args: never
        Returns: {
          access_plan: Database["public"]["Enums"]["access_plan"]
          addon_bookclubs_per_month: number
          attendance_percentage: number
          avatar_url: string
          bookclub_strikes: number
          company: string
          contracted_levels: string[]
          current_level: string
          current_roadmap_level: string
          email: string
          focus: string
          hired_sessions: number
          id: string
          insights_strikes: number
          legacy_id: string
          name: string
          product: Database["public"]["Enums"]["product_id"]
          product_type: Database["public"]["Enums"]["product_type"]
          remaining_sessions: number
          session_duration: number
          sessions_per_week: number
          status: Database["public"]["Enums"]["student_status"]
          video_call_link: string
        }[]
      }
      student_set_session_status: {
        Args: {
          p_cancellation_note?: string
          p_session_id: number
          p_status: Database["public"]["Enums"]["ext_session_status"]
        }
        Returns: undefined
      }
      teacher_profile_for_peek: {
        Args: never
        Returns: {
          hire_date: string
          hours_month: number
          id: string
          legacy_id: string
          name: string
          qualified_products: Database["public"]["Enums"]["product_id"][]
          rating: number
          teacher_status: Database["public"]["Enums"]["teacher_status"]
          tier_frozen_days: number
          tier_frozen_since: string
          tier_reset_at: string
        }[]
      }
      upsert_session_member_statuses: {
        Args: {
          p_members: Json
          p_report_locked: boolean
          p_report_submitted_at: string
          p_session_id: number
          p_set_report_locked: boolean
          p_set_top_status: boolean
          p_top_status: Database["public"]["Enums"]["ext_session_status"]
        }
        Returns: undefined
      }
      user_avatar_for_peek: {
        Args: never
        Returns: {
          avatar_url: string
          id: string
          legacy_id: string
        }[]
      }
    }
    Enums: {
      access_plan: "Core" | "Advance" | "Elite" | "Signature"
      admin_type: "super_admin" | "coordinator_ops" | "coordinator_fin"
      announcement_audience: "all" | "students" | "teachers"
      attendance_sub_status:
        | "absent_work"
        | "absent_illness"
        | "absent_vacation"
        | "cancelled_illness"
        | "cancelled_holiday"
        | "cancelled_work"
      badge_metric:
        | "completedCount"
        | "longestStreak"
        | "distinctCategories"
        | "hasCompletedPremium"
        | "tenureMonths"
        | "attendancePercentage"
        | "unitsCompletedCount"
        | "levelsCompletedCount"
        | "loginStreakDays"
        | "level1MissionsCompleted"
        | "level2MissionsCompleted"
        | "level3MissionsCompleted"
        | "level4MissionsCompleted"
      badge_system: "profile" | "challenge"
      cancellation_reason: "illness" | "personal" | "major_issue" | "other"
      challenge_difficulty: "esencial" | "intermedio" | "avanzado" | "experto"
      challenge_kind: "standard" | "flash"
      challenge_submission_format:
        | "normal"
        | "mystery_box"
        | "lightning"
        | "season"
      challenge_submission_status:
        | "pending_review"
        | "approved"
        | "needs_resubmission"
        | "rejected"
      club_report_event_type: "insight" | "book" | "spotlight"
      club_type: "insight" | "book"
      conduct_report_status: "pending" | "reviewed" | "dismissed"
      conduct_report_target: "teacher" | "student"
      content_issue_entity_type: "unit" | "challenge"
      content_issue_status: "pending" | "resolved" | "dismissed"
      custom_unit_kind: "vip" | "tailored"
      day_key: "mon" | "tue" | "wed" | "thu" | "fri" | "sat"
      exercise_type:
        | "fill_gaps"
        | "drag_drop"
        | "listen_select"
        | "read_select"
        | "record"
        | "read_complete"
        | "match"
      ext_session_status:
        | "scheduled"
        | "rescheduled"
        | "ready"
        | "rearranged"
        | "completed"
        | "absent"
        | "delayed"
        | "cancelled"
        | "pending_reschedule"
        | "no_show"
        | "converted_to_spotlight"
      fill_mode: "solid" | "gradient"
      flash_format: "mystery_box" | "lightning" | "season"
      group_member_status: "active" | "pending_removal" | "archived"
      justification_cause: "evidence_provided" | "force_majeure" | "illness"
      kpi_metric:
        | "connectionPunctuality"
        | "planningPunctuality"
        | "completionRate"
        | "ratingNormalized"
        | "cancellationScore"
        | "responsiveness"
        | "composite"
        | "bonusStreak"
      lesson_session_type:
        | "Syllabus content"
        | "Additional Content"
        | "Review Session"
        | "Casual Topic"
        | "Evaluation"
      material_type: "book" | "pdf" | "verb-list" | "video" | "image"
      paid_entity_type: "individual" | "group"
      payment_frequency: "weekly" | "biweekly" | "monthly"
      payment_record_status: "pending" | "paid"
      product_id: "enterprise" | "go" | "international" | "vip"
      product_type: "performance" | "workshops" | "insights"
      session_origin: "course" | "workshop" | "spotlight" | "group"
      student_request_kind: "reschedule" | "spotlight"
      student_request_status:
        | "open"
        | "claimed"
        | "escalated"
        | "assigned"
        | "cancelled"
      student_status: "active" | "suspended" | "frozen"
      teacher_status: "active" | "frozen" | "removed"
      time_status: "upcoming" | "live" | "completed" | "cancelled"
      unit_access_action: "unlocked" | "locked"
      user_role: "student" | "teacher" | "admin"
      workshop_participant_kind: "student" | "standalone"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      access_plan: ["Core", "Advance", "Elite", "Signature"],
      admin_type: ["super_admin", "coordinator_ops", "coordinator_fin"],
      announcement_audience: ["all", "students", "teachers"],
      attendance_sub_status: [
        "absent_work",
        "absent_illness",
        "absent_vacation",
        "cancelled_illness",
        "cancelled_holiday",
        "cancelled_work",
      ],
      badge_metric: [
        "completedCount",
        "longestStreak",
        "distinctCategories",
        "hasCompletedPremium",
        "tenureMonths",
        "attendancePercentage",
        "unitsCompletedCount",
        "levelsCompletedCount",
        "loginStreakDays",
        "level1MissionsCompleted",
        "level2MissionsCompleted",
        "level3MissionsCompleted",
        "level4MissionsCompleted",
      ],
      badge_system: ["profile", "challenge"],
      cancellation_reason: ["illness", "personal", "major_issue", "other"],
      challenge_difficulty: ["esencial", "intermedio", "avanzado", "experto"],
      challenge_kind: ["standard", "flash"],
      challenge_submission_format: [
        "normal",
        "mystery_box",
        "lightning",
        "season",
      ],
      challenge_submission_status: [
        "pending_review",
        "approved",
        "needs_resubmission",
        "rejected",
      ],
      club_report_event_type: ["insight", "book", "spotlight"],
      club_type: ["insight", "book"],
      conduct_report_status: ["pending", "reviewed", "dismissed"],
      conduct_report_target: ["teacher", "student"],
      content_issue_entity_type: ["unit", "challenge"],
      content_issue_status: ["pending", "resolved", "dismissed"],
      custom_unit_kind: ["vip", "tailored"],
      day_key: ["mon", "tue", "wed", "thu", "fri", "sat"],
      exercise_type: [
        "fill_gaps",
        "drag_drop",
        "listen_select",
        "read_select",
        "record",
        "read_complete",
        "match",
      ],
      ext_session_status: [
        "scheduled",
        "rescheduled",
        "ready",
        "rearranged",
        "completed",
        "absent",
        "delayed",
        "cancelled",
        "pending_reschedule",
        "no_show",
        "converted_to_spotlight",
      ],
      fill_mode: ["solid", "gradient"],
      flash_format: ["mystery_box", "lightning", "season"],
      group_member_status: ["active", "pending_removal", "archived"],
      justification_cause: ["evidence_provided", "force_majeure", "illness"],
      kpi_metric: [
        "connectionPunctuality",
        "planningPunctuality",
        "completionRate",
        "ratingNormalized",
        "cancellationScore",
        "responsiveness",
        "composite",
        "bonusStreak",
      ],
      lesson_session_type: [
        "Syllabus content",
        "Additional Content",
        "Review Session",
        "Casual Topic",
        "Evaluation",
      ],
      material_type: ["book", "pdf", "verb-list", "video", "image"],
      paid_entity_type: ["individual", "group"],
      payment_frequency: ["weekly", "biweekly", "monthly"],
      payment_record_status: ["pending", "paid"],
      product_id: ["enterprise", "go", "international", "vip"],
      product_type: ["performance", "workshops", "insights"],
      session_origin: ["course", "workshop", "spotlight", "group"],
      student_request_kind: ["reschedule", "spotlight"],
      student_request_status: [
        "open",
        "claimed",
        "escalated",
        "assigned",
        "cancelled",
      ],
      student_status: ["active", "suspended", "frozen"],
      teacher_status: ["active", "frozen", "removed"],
      time_status: ["upcoming", "live", "completed", "cancelled"],
      unit_access_action: ["unlocked", "locked"],
      user_role: ["student", "teacher", "admin"],
      workshop_participant_kind: ["student", "standalone"],
    },
  },
} as const
