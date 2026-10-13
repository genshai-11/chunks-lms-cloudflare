-- Complete D1 Schema generated from Supabase tables
CREATE TABLE IF NOT EXISTS assessment_attempts (
  id TEXT PRIMARY KEY,
  learning_session_id TEXT,
  session_question_id TEXT,
  learner_user_id TEXT,
  teacher_user_id TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS assessment_attempt_snapshots (
  attempt_id TEXT,
  status TEXT,
  provisional_color TEXT,
  effective_color TEXT,
  effective_score INTEGER,
  probe_count INTEGER,
  max_probe_count INTEGER,
  entered_probe_flow INTEGER,
  finalized_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS assessment_events (
  id TEXT PRIMARY KEY,
  attempt_id TEXT,
  event_type TEXT,
  payload TEXT,
  actor_user_id TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  learning_session_id TEXT,
  learner_user_id TEXT,
  status TEXT DEFAULT 'present',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audio_assets (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  storage_bucket TEXT,
  storage_path TEXT,
  mime_type TEXT,
  duration_ms TEXT,
  sha256 TEXT,
  created_at TEXT,
  visibility TEXT,
  bytes INTEGER,
  source_kind TEXT,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS cci_categories (
  id TEXT PRIMARY KEY,
  profile_id TEXT,
  category_order INTEGER,
  label TEXT,
  value INTEGER,
  description TEXT,
  metadata TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS cci_profiles (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  name TEXT,
  version_label TEXT,
  status TEXT,
  description TEXT,
  created_by_user_id TEXT,
  created_at TEXT,
  updated_at TEXT,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  course_id TEXT,
  name TEXT,
  capacity INTEGER,
  teacher_user_id TEXT,
  status TEXT,
  created_at TEXT,
  starts_on TEXT,
  ends_on TEXT,
  schedule TEXT
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  code TEXT,
  name TEXT,
  status TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  class_id TEXT,
  learner_user_id TEXT,
  status TEXT,
  started_at TEXT,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS learning_sessions (
  id TEXT PRIMARY KEY,
  class_id TEXT,
  scheduled_session_id TEXT,
  status TEXT,
  planned_question_count TEXT,
  started_at TEXT,
  completed_at TEXT,
  max_probe_count INTEGER,
  session_number TEXT,
  owner_user_id TEXT,
  lock_expires_at TEXT,
  session_kind TEXT,
  participant_learner_ids TEXT,
  session_format TEXT,
  prompt_language TEXT,
  live_test_resource_id TEXT,
  live_test_block_id TEXT,
  test_package_version_id TEXT,
  test_section_id TEXT,
  section_measurement_snapshot_id TEXT
);

CREATE TABLE IF NOT EXISTS narration_variants (
  id TEXT PRIMARY KEY,
  package_version_id TEXT,
  test_section_id TEXT,
  test_item_id TEXT,
  narration_target TEXT,
  language TEXT,
  voice_id TEXT,
  voice_label TEXT,
  source_text_hash TEXT,
  provider_metadata TEXT,
  audio_asset_id TEXT,
  approval_status TEXT,
  approved_by_user_id TEXT,
  approved_at TEXT,
  generation_job_id TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT,
  clerk_org_id TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  user_id TEXT,
  role TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS organization_workspace_versions (
  organization_id TEXT PRIMARY KEY,
  revision INTEGER,
  updated_at TEXT,
  updated_by TEXT,
  checksum TEXT
);

CREATE TABLE IF NOT EXISTS org_settings (
  organization_id TEXT PRIMARY KEY,
  default_max_probe_count INTEGER,
  metric_settings TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS scheduled_sessions (
  id TEXT PRIMARY KEY,
  class_id TEXT,
  session_number INTEGER,
  session_kind TEXT DEFAULT 'regular',
  scheduled_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS section_measurement_snapshots (
  id TEXT PRIMARY KEY,
  test_section_id TEXT,
  package_version_id TEXT,
  target_cvr_ohm INTEGER,
  cci_profile_id TEXT,
  cci_category_id TEXT,
  cci_category_label TEXT,
  cci_value INTEGER,
  snapshot_metadata TEXT,
  supersedes_snapshot_id TEXT,
  override_reason TEXT,
  created_by_user_id TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS session_questions (
  id TEXT PRIMARY KEY,
  learning_session_id TEXT,
  sequence_number INTEGER,
  external_ref TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS staff_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  role TEXT,
  active INTEGER,
  granted_by_user_id TEXT,
  created_at TEXT,
  updated_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS standalone_test_assignments (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  learner_user_id TEXT,
  package_version_id TEXT,
  assigned_by_user_id TEXT,
  assignment_number INTEGER,
  status TEXT,
  assigned_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT
);

CREATE TABLE IF NOT EXISTS standalone_test_attempts (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  run_item_id TEXT,
  learner_user_id TEXT,
  teacher_user_id TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS standalone_test_attempt_snapshots (
  attempt_id TEXT,
  status TEXT,
  provisional_color TEXT,
  effective_color TEXT,
  effective_score INTEGER,
  probe_count INTEGER,
  max_probe_count INTEGER,
  entered_probe_flow INTEGER,
  latest_event_sequence INTEGER,
  finalized_at TEXT,
  corrected_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS standalone_test_events (
  id TEXT PRIMARY KEY,
  attempt_id TEXT,
  event_sequence INTEGER,
  event_type TEXT,
  payload TEXT,
  actor_user_id TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS standalone_test_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  assignment_id TEXT,
  learner_user_id TEXT,
  test_section_id TEXT,
  section_measurement_snapshot_id TEXT,
  attempt_number INTEGER,
  prompt_language TEXT,
  voice_id TEXT,
  intro_narration_variant_id TEXT,
  session_number INTEGER,
  target_cvr_ohm INTEGER,
  cci_source_id TEXT,
  cci_name TEXT,
  cci_value INTEGER,
  item_cpd INTEGER,
  readiness_hash TEXT,
  status TEXT,
  created_by_user_id TEXT,
  created_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT
);

CREATE TABLE IF NOT EXISTS standalone_test_run_items (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  test_item_id TEXT,
  item_order INTEGER,
  source_item_hash TEXT,
  prompt_text TEXT,
  narration_variant_id TEXT,
  audio_asset_id TEXT,
  target_cvr_ohm INTEGER,
  cci_value INTEGER,
  item_cpd INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS test_items (
  id TEXT PRIMARY KEY,
  package_version_id TEXT,
  section_id TEXT,
  item_order INTEGER,
  source_day TEXT,
  source_stt TEXT,
  term_vi TEXT,
  term_en TEXT,
  prompt_vi TEXT,
  prompt_en TEXT,
  tc TEXT,
  lc TEXT,
  tl TEXT,
  measured_cvr TEXT,
  cvr_breakdown TEXT,
  source_metadata TEXT,
  created_at TEXT,
  updated_at TEXT,
  spoken_script_vi TEXT,
  spoken_script_en TEXT
);

CREATE TABLE IF NOT EXISTS test_packages (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  title TEXT,
  slug TEXT,
  description TEXT,
  created_by_user_id TEXT,
  source_metadata TEXT,
  created_at TEXT,
  updated_at TEXT,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS test_package_versions (
  id TEXT PRIMARY KEY,
  package_id TEXT,
  version_label TEXT,
  status TEXT,
  draft_of_version_id TEXT,
  snapshot_hash TEXT,
  source_metadata TEXT,
  created_by_user_id TEXT,
  published_by_user_id TEXT,
  created_at TEXT,
  updated_at TEXT,
  published_at TEXT,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS test_sections (
  id TEXT PRIMARY KEY,
  package_version_id TEXT,
  section_order INTEGER,
  title TEXT,
  target_cvr_ohm INTEGER,
  cci_profile_id TEXT,
  cci_category_id TEXT,
  cci_snapshot TEXT,
  intro_text_vi TEXT,
  intro_text_en TEXT,
  metadata TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT,
  display_name TEXT,
  email TEXT,
  created_at TEXT,
  updated_at TEXT,
  avatar_url TEXT,
  account_status TEXT,
  allow_multi_class INTEGER,
  auth_user_id TEXT,
  legacy_clerk_user_id TEXT,
  username TEXT
);

CREATE TABLE IF NOT EXISTS guest_assessment_tokens (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  assignment_id TEXT NOT NULL,
  learner_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  guest_name TEXT,
  expires_at TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
