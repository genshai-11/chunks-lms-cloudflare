/**
 * Minimal hand-written Database types for V1 foundation.
 * Replace with `supabase gen types typescript` once local Supabase is running.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          clerk_org_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          clerk_org_id?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>
      }
      users: {
        Row: {
          id: string
          auth_user_id: string | null
          clerk_user_id: string | null
          legacy_clerk_user_id: string | null
          display_name: string
          email: string | null
          username: string | null
          avatar_url: string | null
          account_status: 'active' | 'inactive'
          allow_multi_class: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          auth_user_id?: string | null
          clerk_user_id?: string | null
          legacy_clerk_user_id?: string | null
          display_name: string
          email?: string | null
          username?: string | null
          avatar_url?: string | null
          account_status?: 'active' | 'inactive'
          allow_multi_class?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['users']['Insert']>
      }
      staff_roles: {
        Row: {
          id: string
          user_id: string
          role: 'admin' | 'teacher'
          active: boolean
          granted_by_user_id: string | null
          created_at: string
          updated_at: string
          revoked_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          role: 'admin' | 'teacher'
          active?: boolean
          granted_by_user_id?: string | null
          created_at?: string
          updated_at?: string
          revoked_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['staff_roles']['Insert']>
      }
      organization_memberships: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role: 'admin' | 'teacher' | 'learner'
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role: 'admin' | 'teacher' | 'learner'
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['organization_memberships']['Insert']>
      }
      courses: {
        Row: {
          id: string
          organization_id: string
          code: string
          name: string
          status: 'active' | 'archived'
          starts_on: string | null
          ends_on: string | null
          schedule: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          code: string
          name: string
          status?: 'active' | 'archived'
          starts_on?: string | null
          ends_on?: string | null
          schedule?: Json | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['courses']['Insert']>
      }
      scheduled_sessions: {
        Row: {
          id: string
          class_id: string
          planned_start: string
          duration_minutes: number
          status: string
          rescheduled_from_id: string | null
        }
        Insert: {
          id?: string
          class_id: string
          planned_start: string
          duration_minutes: number
          status?: string
          rescheduled_from_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['scheduled_sessions']['Insert']>
      }
      learning_sessions: {
        Row: {
          id: string
          class_id: string
          scheduled_session_id: string | null
          status: string
          planned_question_count: number | null
          started_at: string
          completed_at: string | null
          max_probe_count: number
          session_format: 'lesson' | 'test'
          prompt_language: 'vi' | 'en' | null
          live_test_resource_id: string | null
          live_test_block_id: string | null
          test_package_version_id: string | null
          test_section_id: string | null
          section_measurement_snapshot_id: string | null
        }
        Insert: {
          id?: string
          class_id: string
          scheduled_session_id?: string | null
          status?: string
          planned_question_count?: number | null
          started_at?: string
          completed_at?: string | null
          max_probe_count?: number
          session_format?: 'lesson' | 'test'
          prompt_language?: 'vi' | 'en' | null
          live_test_resource_id?: string | null
          live_test_block_id?: string | null
          test_package_version_id?: string | null
          test_section_id?: string | null
          section_measurement_snapshot_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['learning_sessions']['Insert']>
      }
      attendance_records: {
        Row: {
          id: string
          learning_session_id: string
          learner_user_id: string
          status: string
          recorded_at: string
        }
        Insert: {
          id?: string
          learning_session_id: string
          learner_user_id: string
          status: string
          recorded_at?: string
        }
        Update: Partial<Database['public']['Tables']['attendance_records']['Insert']>
      }
      classes: {
        Row: {
          id: string
          course_id: string
          name: string
          capacity: number
          teacher_user_id: string
          status: 'active' | 'ended'
          created_at: string
        }
        Insert: {
          id?: string
          course_id: string
          name: string
          capacity?: number
          teacher_user_id: string
          status?: 'active' | 'ended'
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['classes']['Insert']>
      }
      enrollments: {
        Row: {
          id: string
          class_id: string
          learner_user_id: string
          status: 'active' | 'ended'
          started_at: string
          ended_at: string | null
        }
        Insert: {
          id?: string
          class_id: string
          learner_user_id: string
          status?: 'active' | 'ended'
          started_at?: string
          ended_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['enrollments']['Insert']>
      }
      assessment_attempt_snapshots: {
        Row: {
          id: string
          attempt_id: string
          status: string
          provisional_color: string | null
          effective_color: string | null
          effective_score: number | null
          probe_count: number
          max_probe_count: number
          entered_probe_flow: boolean
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      audio_assets: {
        Row: {
          id: string
          organization_id: string | null
          storage_bucket: string
          storage_path: string
          mime_type: string
          duration_ms: number | null
          sha256: string | null
          visibility: 'private' | 'public'
          bytes: number | null
          source_kind: 'custom_upload' | 'generated_tts' | 'legacy_import' | null
          metadata: Json
          created_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      live_test_resources: {
        Row: {
          id: string
          organization_id: string | null
          title: string
          version: string
          status: 'draft' | 'active' | 'archived'
          source_filename: string | null
          source_metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      live_test_blocks: {
        Row: Record<string, unknown>
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      live_test_items: {
        Row: Record<string, unknown>
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      test_packages: {
        Row: {
          id: string
          organization_id: string
          title: string
          slug: string
          description: string | null
          created_by_user_id: string | null
          source_metadata: Json
          created_at: string
          updated_at: string
          archived_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          title: string
          slug: string
          description?: string | null
          created_by_user_id?: string | null
          source_metadata?: Json
          created_at?: string
          updated_at?: string
          archived_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['test_packages']['Insert']>
      }
      test_package_versions: {
        Row: {
          id: string
          package_id: string
          version_label: string
          status: 'draft' | 'published' | 'archived'
          draft_of_version_id: string | null
          snapshot_hash: string | null
          source_metadata: Json
          created_by_user_id: string | null
          published_by_user_id: string | null
          created_at: string
          updated_at: string
          published_at: string | null
          archived_at: string | null
        }
        Insert: {
          id?: string
          package_id: string
          version_label: string
          status?: 'draft' | 'published' | 'archived'
          draft_of_version_id?: string | null
          snapshot_hash?: string | null
          source_metadata?: Json
          created_by_user_id?: string | null
          published_by_user_id?: string | null
          created_at?: string
          updated_at?: string
          published_at?: string | null
          archived_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['test_package_versions']['Insert']>
      }
      cci_profiles: {
        Row: {
          id: string
          organization_id: string
          name: string
          version_label: string
          status: 'draft' | 'active' | 'archived'
          description: string | null
          created_by_user_id: string | null
          created_at: string
          updated_at: string
          archived_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          version_label?: string
          status?: 'draft' | 'active' | 'archived'
          description?: string | null
          created_by_user_id?: string | null
          created_at?: string
          updated_at?: string
          archived_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['cci_profiles']['Insert']>
      }
      cci_categories: {
        Row: {
          id: string
          profile_id: string
          category_order: number
          label: string
          value: number
          description: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          category_order: number
          label: string
          value: number
          description?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['cci_categories']['Insert']>
      }
      test_sections: {
        Row: {
          id: string
          package_version_id: string
          section_order: number
          title: string | null
          target_cvr_ohm: number | null
          cci_profile_id: string | null
          cci_category_id: string | null
          cci_snapshot: Json
          intro_text_vi: string | null
          intro_text_en: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      section_measurement_snapshots: {
        Row: {
          id: string
          test_section_id: string
          package_version_id: string
          target_cvr_ohm: number
          cci_profile_id: string
          cci_category_id: string
          cci_category_label: string
          cci_value: number
          snapshot_metadata: Json
          supersedes_snapshot_id: string | null
          override_reason: string | null
          created_by_user_id: string | null
          created_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      test_items: {
        Row: {
          id: string
          package_version_id: string
          section_id: string
          item_order: number
          source_day: string | null
          source_stt: string | null
          term_vi: string | null
          term_en: string | null
          prompt_vi: string | null
          prompt_en: string | null
          tc: number | null
          lc: number | null
          tl: number | null
          measured_cvr: number | null
          cvr_breakdown: Json
          source_metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      narration_variants: {
        Row: {
          id: string
          package_version_id: string
          test_section_id: string | null
          test_item_id: string | null
          narration_target: 'section_intro' | 'test_item'
          language: 'vi' | 'en'
          voice_id: string
          voice_label: string | null
          source_text_hash: string
          provider_metadata: Json
          audio_asset_id: string | null
          approval_status: 'draft' | 'generated' | 'approved' | 'rejected' | 'archived'
          approved_by_user_id: string | null
          approved_at: string | null
          generation_job_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      generation_jobs: {
        Row: {
          id: string
          organization_id: string
          requested_by_user_id: string | null
          package_version_id: string | null
          test_section_id: string | null
          test_item_id: string | null
          narration_variant_id: string | null
          job_type: 'test_item' | 'section_intro_narration' | 'item_narration'
          status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
          prompt_hash: string | null
          source_hash: string | null
          provider_metadata: Json
          attempts: Json
          error_code: string | null
          error_message: string | null
          requested_at: string
          started_at: string | null
          completed_at: string | null
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      live_test_v2_migration_runs: {
        Row: {
          id: string
          run_label: string
          source_filename: string
          dry_run: boolean
          report: Json
          report_checksum: string
          created_by_user_id: string | null
          created_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      live_test_v2_csv_rows: {
        Row: {
          source_filename: string
          row_number: number
          session_no: number
          source_session: string | null
          source_stt: string | null
          term_vi: string | null
          term_en: string | null
          prompt_vi: string | null
          prompt_en: string | null
          unit_ohm: number | null
          tc: number | null
          lc: number | null
          tl: number | null
          cvr: number | null
          row_payload: Json
          row_checksum: string
          staged_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      live_test_v2_item_mappings: {
        Row: {
          legacy_live_test_resource_id: string
          legacy_live_test_block_id: string
          legacy_live_test_item_id: string
          target_test_package_id: string
          target_package_version_id: string
          target_test_section_id: string
          target_test_item_id: string
          legacy_external_ref: string
          v2_external_ref: string
          source_row_checksum: string
          source_metadata: Json
          created_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
    }
    Views: Record<string, never>
    Functions: {
      create_teacher_learner_and_enroll: {
        Args: {
          p_class_id: string
          p_display_name: string
          p_email?: string | null
          p_avatar_url?: string | null
        }
        Returns: Json
      }
      live_test_v2_deterministic_uuid: {
        Args: { p_basis: string }
        Returns: string
      }
      stage_live_test_v2_csv_rows: {
        Args: { p_source_filename: string; p_rows: Json }
        Returns: Json
      }
      live_test_v2_source_row_checksum: {
        Args: { p_item: Json }
        Returns: string
      }
      preview_live_test_v2_migration: {
        Args: { p_source_filename?: string }
        Returns: Json
      }
      apply_live_test_v2_catalog_backfill: {
        Args: { p_run_label: string; p_source_filename?: string; p_dry_run?: boolean }
        Returns: Json
      }
    }
    Enums: {
      app_role: 'admin' | 'teacher' | 'learner'
      result_color: 'red' | 'yellow' | 'green' | 'purple'
    }
  }
}

export type AppRole = Database['public']['Enums']['app_role']
