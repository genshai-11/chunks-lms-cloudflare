import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// ==========================================
// 1. Core Organization & Workspace
// ==========================================

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

export const organizationWorkspaceVersions = sqliteTable('organization_workspace_versions', {
  organizationId: text('organization_id').primaryKey().references(() => organizations.id),
  revision: integer('revision').notNull().default(1),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
  updatedBy: text('updated_by'),
  checksum: text('checksum'),
});

export const orgSettings = sqliteTable('org_settings', {
  organizationId: text('organization_id').primaryKey().references(() => organizations.id),
  defaultMaxProbeCount: integer('default_max_probe_count').default(5),
  metricSettings: text('metric_settings', { mode: 'json' }),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

// ==========================================
// 2. Users, Staff & Memberships
// ==========================================

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  email: text('email'),
  username: text('username'),
  avatarUrl: text('avatar_url'),
  accountStatus: text('account_status', { enum: ['active', 'inactive'] }).default('active'),
  allowMultiClass: integer('allow_multi_class', { mode: 'boolean' }).default(false),
  passwordHash: text('password_hash'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

export const staffRoles = sqliteTable('staff_roles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  role: text('role', { enum: ['admin', 'teacher', 'guest'] }).notNull(),
  active: integer('active', { mode: 'boolean' }).default(true),
  grantedByUserId: text('granted_by_user_id'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

export const organizationMemberships = sqliteTable('organization_memberships', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  userId: text('user_id').notNull().references(() => users.id),
  role: text('role').notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

// ==========================================
// 3. Roster: Courses, Classes & Enrollments
// ==========================================

export const courses = sqliteTable('courses', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  code: text('code').notNull(),
  name: text('name').notNull(),
  status: text('status').default('active'),
  startsOn: text('starts_on'),
  endsOn: text('ends_on'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

export const classes = sqliteTable('classes', {
  id: text('id').primaryKey(),
  courseId: text('course_id').notNull().references(() => courses.id),
  name: text('name').notNull(),
  capacity: integer('capacity').default(30),
  teacherUserId: text('teacher_user_id').notNull().references(() => users.id),
  status: text('status').default('active'),
  schedule: text('schedule'),
  startsOn: text('starts_on'),
  endsOn: text('ends_on'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

export const enrollments = sqliteTable('enrollments', {
  id: text('id').primaryKey(),
  classId: text('class_id').notNull().references(() => classes.id),
  learnerUserId: text('learner_user_id').notNull().references(() => users.id),
  status: text('status').default('active'),
  enrolledAt: text('enrolled_at').default('CURRENT_TIMESTAMP'),
});

// ==========================================
// 4. Learning Sessions & Live Observation
// ==========================================

export const learningSessions = sqliteTable('learning_sessions', {
  id: text('id').primaryKey(),
  classId: text('class_id').notNull().references(() => classes.id),
  sessionNumber: integer('session_number').notNull(),
  sessionKind: text('session_kind', { enum: ['regular', 'pretest', 'posttest'] }).default('regular'),
  status: text('status').default('active'),
  startedAt: text('started_at'),
  endedAt: text('ended_at'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

export const scheduledSessions = sqliteTable('scheduled_sessions', {
  id: text('id').primaryKey(),
  classId: text('class_id').notNull().references(() => classes.id),
  sessionNumber: integer('session_number').notNull(),
  sessionKind: text('session_kind').default('regular'),
  scheduledAt: text('scheduled_at'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

export const sessionQuestions = sqliteTable('session_questions', {
  id: text('id').primaryKey(),
  learningSessionId: text('learning_session_id').notNull().references(() => learningSessions.id),
  questionOrder: integer('question_order').notNull(),
  prompt: text('prompt'),
  maxProbeCount: integer('max_probe_count').default(5),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

export const assessmentAttempts = sqliteTable('assessment_attempts', {
  id: text('id').primaryKey(),
  sessionQuestionId: text('session_question_id').notNull().references(() => sessionQuestions.id),
  learnerUserId: text('learner_user_id').notNull().references(() => users.id),
  teacherUserId: text('teacher_user_id').notNull().references(() => users.id),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

export const assessmentAttemptSnapshots = sqliteTable('assessment_attempt_snapshots', {
  id: text('id').primaryKey(),
  attemptId: text('attempt_id').notNull().references(() => assessmentAttempts.id),
  currentResultColor: text('current_result_color'),
  enteredProbeFlow: integer('entered_probe_flow', { mode: 'boolean' }).default(false),
  probeCount: integer('probe_count').default(0),
  isFinalized: integer('is_finalized', { mode: 'boolean' }).default(false),
  finalizedAt: text('finalized_at'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

export const assessmentEvents = sqliteTable('assessment_events', {
  id: text('id').primaryKey(),
  attemptId: text('attempt_id').notNull().references(() => assessmentAttempts.id),
  eventType: text('event_type').notNull(),
  resultColor: text('result_color'),
  probeCount: integer('probe_count').default(0),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

export const attendanceRecords = sqliteTable('attendance_records', {
  id: text('id').primaryKey(),
  learningSessionId: text('learning_session_id').notNull().references(() => learningSessions.id),
  learnerUserId: text('learner_user_id').notNull().references(() => users.id),
  status: text('status').default('present'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

// ==========================================
// 5. Test Packages, Items & CCI Profiles
// ==========================================

export const testPackages = sqliteTable('test_packages', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  createdByUserId: text('created_by_user_id'),
  sourceMetadata: text('source_metadata', { mode: 'json' }),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
  archivedAt: text('archived_at'),
});

export const testPackageVersions = sqliteTable('test_package_versions', {
  id: text('id').primaryKey(),
  packageId: text('package_id').notNull().references(() => testPackages.id),
  versionLabel: text('version_label').notNull(),
  status: text('status').default('draft'),
  sourceMetadata: text('source_metadata', { mode: 'json' }),
  createdByUserId: text('created_by_user_id'),
  publishedByUserId: text('published_by_user_id'),
  publishedAt: text('published_at'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

export const cciProfiles = sqliteTable('cci_profiles', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  versionLabel: text('version_label').notNull(),
  status: text('status').default('draft'),
  description: text('description'),
  createdByUserId: text('created_by_user_id'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

export const cciCategories = sqliteTable('cci_categories', {
  id: text('id').primaryKey(),
  profileId: text('profile_id').notNull().references(() => cciProfiles.id),
  categoryOrder: integer('category_order').notNull(),
  label: text('label').notNull(),
  value: real('value').notNull(),
  description: text('description'),
  metadata: text('metadata', { mode: 'json' }),
});

export const testSections = sqliteTable('test_sections', {
  id: text('id').primaryKey(),
  packageVersionId: text('package_version_id').notNull().references(() => testPackageVersions.id),
  sectionOrder: integer('section_order').notNull(),
  title: text('title').notNull(),
  targetCvrOhm: real('target_cvr_ohm').default(1),
  cciProfileId: text('cci_profile_id').references(() => cciProfiles.id),
  cciCategoryId: text('cci_category_id').references(() => cciCategories.id),
  cciSnapshot: text('cci_snapshot', { mode: 'json' }),
  introTextVi: text('intro_text_vi'),
  introTextEn: text('intro_text_en'),
  metadata: text('metadata', { mode: 'json' }),
});

export const sectionMeasurementSnapshots = sqliteTable('section_measurement_snapshots', {
  id: text('id').primaryKey(),
  testSectionId: text('test_section_id').notNull().references(() => testSections.id),
  packageVersionId: text('package_version_id').notNull().references(() => testPackageVersions.id),
  targetCvrOhm: real('target_cvr_ohm'),
  cciProfileId: text('cci_profile_id'),
  cciCategoryId: text('cci_category_id'),
  cciCategoryLabel: text('cci_category_label'),
  cciValue: real('cci_value'),
  snapshotMetadata: text('snapshot_metadata', { mode: 'json' }),
});

export const testItems = sqliteTable('test_items', {
  id: text('id').primaryKey(),
  packageVersionId: text('package_version_id').notNull().references(() => testPackageVersions.id),
  sectionId: text('section_id').notNull().references(() => testSections.id),
  itemOrder: integer('item_order').notNull(),
  sourceDay: text('source_day'),
  sourceStt: text('source_stt'),
  termVi: text('term_vi'),
  termEn: text('term_en'),
  promptVi: text('prompt_vi'),
  promptEn: text('prompt_en'),
  spokenScriptVi: text('spoken_script_vi'),
  spokenScriptEn: text('spoken_script_en'),
  tc: real('tc').default(1),
  lc: real('lc').default(1),
  tl: real('tl').default(1),
  measuredCvr: real('measured_cvr'),
  cvrBreakdown: text('cvr_breakdown', { mode: 'json' }),
  sourceMetadata: text('source_metadata', { mode: 'json' }),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

export const audioAssets = sqliteTable('audio_assets', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id'),
  storageBucket: text('storage_bucket').notNull(),
  storagePath: text('storage_path').notNull(),
  mimeType: text('mime_type').default('audio/wav'),
  byteSize: integer('byte_size'),
  durationSeconds: real('duration_seconds'),
  sha256: text('sha256'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

export const narrationVariants = sqliteTable('narration_variants', {
  id: text('id').primaryKey(),
  packageVersionId: text('package_version_id').notNull().references(() => testPackageVersions.id),
  testSectionId: text('test_section_id').references(() => testSections.id),
  testItemId: text('test_item_id').references(() => testItems.id),
  variantType: text('variant_type').notNull(),
  language: text('language').notNull(),
  voiceId: text('voice_id').notNull(),
  audioAssetId: text('audio_asset_id').references(() => audioAssets.id),
  approvalStatus: text('approval_status').default('approved'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

// ==========================================
// 6. Standalone Tests & 1-on-1 Test Runs
// ==========================================

export const standaloneTestAssignments = sqliteTable('standalone_test_assignments', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  packageVersionId: text('package_version_id').notNull().references(() => testPackageVersions.id),
  classId: text('class_id').notNull().references(() => classes.id),
  learnerUserId: text('learner_user_id').notNull().references(() => users.id),
  assignedByUserId: text('assigned_by_user_id').notNull().references(() => users.id),
  status: text('status').default('assigned'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  completedAt: text('completed_at'),
});

export const standaloneTestRuns = sqliteTable('standalone_test_runs', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  assignmentId: text('assignment_id').notNull().references(() => standaloneTestAssignments.id),
  learnerUserId: text('learner_user_id').notNull().references(() => users.id),
  testSectionId: text('test_section_id').notNull().references(() => testSections.id),
  sectionMeasurementSnapshotId: text('section_measurement_snapshot_id'),
  attemptNumber: integer('attempt_number').default(1),
  promptLanguage: text('prompt_language').default('vi'),
  voiceId: text('voice_id'),
  introNarrationVariantId: text('intro_narration_variant_id'),
  sessionNumber: integer('session_number').notNull(),
  targetCvrOhm: real('target_cvr_ohm'),
  cciSourceId: text('cci_source_id'),
  cciName: text('cci_name'),
  cciValue: real('cci_value'),
  itemCpd: real('item_cpd'),
  readinessHash: text('readiness_hash'),
  status: text('status').default('in_progress'),
  createdByUserId: text('created_by_user_id'),
  assessorRole: text('assessor_role', { enum: ['teacher', 'admin', 'guest'] }).default('teacher'),
  assessorName: text('assessor_name'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  cancelledAt: text('cancelled_at'),
  cancellationReason: text('cancellation_reason'),
});

export const standaloneTestRunItems = sqliteTable('standalone_test_run_items', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => standaloneTestRuns.id),
  testItemId: text('test_item_id').notNull().references(() => testItems.id),
  itemOrder: integer('item_order').notNull(),
  narrationVariantId: text('narration_variant_id'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

export const standaloneTestAttempts = sqliteTable('standalone_test_attempts', {
  id: text('id').primaryKey(),
  runItemId: text('run_item_id').notNull().references(() => standaloneTestRunItems.id),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

export const standaloneTestAttemptSnapshots = sqliteTable('standalone_test_attempt_snapshots', {
  id: text('id').primaryKey(),
  attemptId: text('attempt_id').notNull().references(() => standaloneTestAttempts.id),
  currentResultColor: text('current_result_color'),
  enteredProbeFlow: integer('entered_probe_flow', { mode: 'boolean' }).default(false),
  probeCount: integer('probe_count').default(0),
  isFinalized: integer('is_finalized', { mode: 'boolean' }).default(false),
  finalizedAt: text('finalized_at'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

export const standaloneTestEvents = sqliteTable('standalone_test_events', {
  id: text('id').primaryKey(),
  attemptId: text('attempt_id').notNull().references(() => standaloneTestAttempts.id),
  eventType: text('event_type').notNull(),
  resultColor: text('result_color'),
  probeCount: integer('probe_count').default(0),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

// ==========================================
// 7. GUEST Assessor Secure Tokens
// ==========================================

export const guestAssessmentTokens = sqliteTable('guest_assessment_tokens', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(), // Secure cryptographic token (64 hex characters)
  assignmentId: text('assignment_id').notNull().references(() => standaloneTestAssignments.id),
  learnerId: text('learner_id').notNull().references(() => users.id),
  createdByUserId: text('created_by_user_id').notNull().references(() => users.id),
  guestName: text('guest_name'),
  expiresAt: text('expires_at').notNull(),
  status: text('status', { enum: ['active', 'submitted', 'revoked'] }).default('active'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});
