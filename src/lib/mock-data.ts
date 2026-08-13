// Mock database — replace with Lovable Cloud later.
import { assignedStudentIdsFor } from "./assignments-store";

export type Role = "student" | "teacher" | "admin";
export type AdminType = "super_admin" | "coordinator_ops" | "coordinator_fin";

/** Formats a challenge submission can come from. */
export type ChallengeSubmissionFormat = "normal" | "mystery_box" | "lightning" | "season";

/** Review lifecycle of a student's challenge delivery. Completion counters and
 *  streak/badge effects are only applied by the teacher-side approval step. */
export type ChallengeSubmissionStatus =
  | "pending_review"
  | "needs_resubmission"
  | "rejected"
  | "approved";

export interface ChallengeSubmission {
  challenge_id: string;
  challenge_format: ChallengeSubmissionFormat;
  status: ChallengeSubmissionStatus;
  link: string;
  note?: string;
  submitted_at: string;
  /** Every previous attempt, appended on each resubmission. */
  history: Array<{ link: string; note?: string; submitted_at: string }>;
  /** current_streak value BEFORE this submission touched it — lets the review
   *  step roll the streak back if the delivery is rejected. */
  streak_before?: number;
  reviewed_at?: string;
  reviewer_id?: string;
  teacher_feedback?: string;
}



export interface User {
  id: string;
  name: string;
  email: string;
  /** Contact phone number — informational only, no format enforced. Shown to
   *  admin in the Student/Teacher Info panels; used to build a WhatsApp
   *  (wa.me) link when present. */
  phone?: string;
  password: string;
  role: Role;
  /** When true, the user is forced to change their password on next sign-in
   *  (e.g. new student just registered by an admin). Cleared on completion. */
  must_change_password?: boolean;
  current_level?: string;
  admin_type?: AdminType; // only meaningful when role === "admin"
  attendance_percentage?: number;
  avatar?: string;
  // Corporate profile (students)
  company?: string;
  hired_plan?: string; // legacy display alias — mirrors access_plan
  member_since?: string; // ISO date
  hired_sessions?: number;
  remaining_sessions?: number;
  // ----- Commercial model (see src/lib/student-model.ts) -----
  product?: "enterprise" | "go" | "international" | "vip";
  focus?: string; // enfoque name (GO / International only)
  access_plan?: "Core" | "Advance" | "Elite" | "Signature";
  contracted_levels?: string[]; // commercial level names from the product roadmap
  current_roadmap_level?: string; // level currently in progress
  reopened_levels?: string[]; // completed levels reopened by admin for read-only review
  sessions_per_week?: number;
  session_duration?: number; // minutes
  reschedule_policy?: string; // preset label or "Custom"
  reschedule_custom_hours?: number;
  reschedule_custom_pct?: number;
  payment_day?: number; // 1–31
  cycle_start?: string; // ISO date
  next_payment?: string; // ISO date override (set when "marked as paid")
  video_call_link?: string;
  status?: "active" | "suspended" | "frozen";
  insights_strikes?: number;
  bookclub_strikes?: number;
  sessions_auto?: boolean; // false once sessions were edited manually
  admin_notes?: string;
  freeze_start?: string;
  freeze_end?: string;
  // ----- Challenges (student) -----
  chosen_challenges?: { challenge_id: string; chosen_at: string }[];
  completed_challenges?: {
    challenge_id: string;
    completed_at: string;
    shared_link?: string;
    /** Timestamp of the FIRST time this result was shared. Persists on edits. */
    shared_at?: string;
    /** Distinguishes source: traditional bank (undefined/"traditional"),
     *  Mystery Box, or Lightning. */
    format?: "traditional" | "mystery_box" | "lightning";
  }[];
  last_completed_at?: string | null;
  current_streak?: number;
  longest_streak?: number;
  /** Timestamp of the last Mystery Box opening (Verbo Flash). Independent
   *  from the challenge-completion cooldown. */
  last_mystery_box_opened_at?: string | null;
  /** Id of the challenge currently revealed by the Mystery Box and not yet
   *  completed. Cleared implicitly on completion (we simply stop treating it
   *  as "active" once the challenge is completed). */
  mystery_box_pick_id?: string | null;
  /** Lightning-specific counters — independent from the traditional-bank
   *  24h cooldown so a student can complete both a Lightning and a normal
   *  challenge in the same day. */
  last_lightning_completed_at?: string | null;
  lightning_completions?: number;
  /** Verbo Flash Seasons — per-season last-open timestamps and completion
   *  counters, keyed by season.id. Independent from Mystery Box and Lightning. */
  last_season_opened_at?: Record<string, string>;
  season_completions?: Record<string, number>;
  /** Teacher-reviewed challenge submissions (Etapa 2). One entry per challenge
   *  id; the student only earns completion once the teacher approves it. */
  challenge_submissions?: ChallengeSubmission[];
  // ----- Product-type branch (Register Student flow) -----
  // "performance" is the classic Performance Sessions student. "workshops"
  // and "insights" are standalone customers who only bought that add-on and
  // don't have live Performance sessions. Legacy records default to
  // "performance" when this field is missing.
  product_type?: "performance" | "workshops" | "insights";
  // Add-on caps (monthly). Zero / undefined means no access.
  addon_insights_per_month?: number;
  addon_bookclubs_per_month?: number;
  addon_spotlight_per_month?: number;
  // Toggle that gates the workshops cohort picker in the Register form.
  // Cohort memberships themselves live in the workshops store (source of
  // truth), not on the user record.
  addon_workshops_enabled?: boolean;
  // ----- Teacher profile (see src/lib/teacher-model.ts) -----
  qualified_products?: ("enterprise" | "go" | "international" | "vip")[];
  hourly_rate?: number; // MXN per hour
  teacher_status?: "active" | "frozen" | "removed";
  /** ISO date (YYYY-MM-DD). Drives the 6-month bonus-streak tracking window. */
  hire_date?: string;
  // ----- Tier clock (see src/lib/teacher-tiers.ts) -----
  /** ISO timestamp when the current "frozen" period started (null if active). */
  tier_frozen_since?: string | null;
  /** Total days the tier clock has been paused across all past freezes. */
  tier_frozen_days?: number;
  /** ISO timestamp of the last tier reset (e.g. reactivation after "removed"). */
  tier_reset_at?: string | null;
  rating?: number; // avg student rating (0–5)
  plan_punctuality?: number; // % lesson plans submitted on time
  report_punctuality?: number; // % post-class reports submitted on time
  hours_month?: number; // accumulated teaching hours this month
  availability?: { day: string; slots: string[] }[];
  availability_request?: { note: string; requested_on: string } | null;
  // ----- Financial (payroll) -----
  payment_frequency?: "weekly" | "biweekly" | "monthly";
  hours_cycle?: number; // hours worked this cycle
  payment_records?: { id: string; date: string; status: "pending" | "paid" }[];
  adjustments?: { id: string; date: string; amount: number; reason: string }[];
}


export type SessionStatus = "scheduled" | "completed" | "absent" | "delayed";

export interface Session {
  id: string;
  student_id: string;
  teacher_id: string;
  date_time: string; // ISO
  duration_minutes: number;
  teams_link: string;
  status: SessionStatus;
  absent_cause?: "student" | "teacher"; // only meaningful when status is "absent"
  report_pdf_url?: string;
  student_rating?: number;
  student_comment?: string; // free-text feedback attached to the rating
  review_status?: "pending" | "reviewed" | "discarded"; // admin review state for low ratings
  review_note?: string; // admin resolution note OR discard justification
  notes?: string;
  // Attendance metadata captured on Session Report. `delayed` is not a
  // canonical session status (the session still lands in "completed") —
  // this flag preserves that the student arrived late for KPIs.
  attendance_delayed?: boolean;
  // Timestamp of Session Report submission — powers the report_punctuality
  // KPI already computed by Admin > Financial / Composite Score.
  report_submitted_at?: string;
  // Origin of this session — course-style 1:1 by default, or a Focus Workshop
  // cohort session. Workshop sessions carry the cohort/template reference so
  // the Focus Workshops tab can render them without duplicating any state.
  // For workshop sessions, `student_id` stores the cohort id (participants
  // are read from the workshop cohort itself) and teacher hours accrue via
  // `teacher_id` like any other session.
  origin?: "course" | "workshop" | "spotlight";
  workshop_cohort_id?: string;
  workshop_template_id?: string;
  workshop_topic?: string;
}

export interface Unit {
  id: string;
  title: string;
  video_url: string;
  pdf_url: string;
}

export interface Level {
  id: string; // A1, A2…
  title: string;
  units: Unit[];
}

export type MaterialType = "book" | "pdf" | "verb-list" | "video" | "image";
export interface Material {
  id: string;
  title: string;
  material_type: MaterialType;
  upload_url: string;
  category: string;
}

export const USERS: User[] = [
  { id: "u1", name: "Admin Verbo", email: "admin@verbo.com", password: "", role: "admin" },
  { id: "u2", name: "Sarah Mitchell", email: "sarah@verbo.com", password: "", role: "teacher", qualified_products: ["enterprise", "go", "international", "vip"], hourly_rate: 140, teacher_status: "active", hire_date: "2024-01-15", rating: 4.6, plan_punctuality: 96, report_punctuality: 92, hours_month: 48, availability: [{ day: "Monday", slots: ["09:00–12:00", "16:00–19:00"] }, { day: "Wednesday", slots: ["09:00–13:00"] }, { day: "Friday", slots: ["15:00–19:00"] }], availability_request: { note: "Solicito mover mi bloque de los viernes a los jueves por la tarde.", requested_on: "2026-06-28" } },
  { id: "u3", name: "James Carter", email: "james@verbo.com", password: "", role: "teacher", qualified_products: ["go", "vip"], hourly_rate: 120, teacher_status: "active", hire_date: "2023-08-20", rating: 4.9, plan_punctuality: 100, report_punctuality: 98, hours_month: 32, availability: [{ day: "Tuesday", slots: ["08:00–12:00"] }, { day: "Thursday", slots: ["10:00–14:00", "17:00–20:00"] }], availability_request: null },
  { id: "u7", name: "Sofía Herrera", email: "sofia@verbo.com", password: "", role: "teacher", qualified_products: ["go", "international"], hourly_rate: 110, teacher_status: "frozen", hire_date: "2025-11-05", rating: 4.3, plan_punctuality: 88, report_punctuality: 90, hours_month: 0, availability: [{ day: "Monday", slots: ["14:00–18:00"] }, { day: "Wednesday", slots: ["14:00–18:00"] }], availability_request: null },
  { id: "u8", name: "David Chen", email: "david@verbo.com", password: "", role: "teacher", qualified_products: ["enterprise"], hourly_rate: 150, teacher_status: "removed", hire_date: "2024-06-10", rating: 4.1, plan_punctuality: 82, report_punctuality: 79, hours_month: 0, availability: [], availability_request: null },
  { id: "u4", name: "Elena Ruiz", email: "elena@student.com", password: "", role: "student", current_level: "B1", attendance_percentage: 92, company: "Nubank", hired_plan: "Elite", member_since: "2024-09-15", hired_sessions: 90, remaining_sessions: 61, product: "enterprise", access_plan: "Elite", contracted_levels: ["Core Foundations", "Strategic Fluency", "Executive Presence"], current_roadmap_level: "Strategic Fluency", sessions_per_week: 2, session_duration: 60, reschedule_policy: "6h notice, max 70% of monthly sessions", payment_day: 15, cycle_start: "2024-09-15", video_call_link: "https://teams.microsoft.com/l/meetup-join/elena", status: "active", insights_strikes: 1, sessions_auto: true },
  { id: "u5", name: "Marco Silva", email: "marco@student.com", password: "", role: "student", current_level: "A2", attendance_percentage: 78, company: "Itaú", hired_plan: "Advance", member_since: "2025-02-01", hired_sessions: 60, remaining_sessions: 9, product: "international", focus: "Survival", access_plan: "Advance", contracted_levels: ["Survival Basics", "Travel Ready"], current_roadmap_level: "Survival Basics", sessions_per_week: 3, session_duration: 40, reschedule_policy: "12h notice, max 40% of monthly sessions", payment_day: 6, cycle_start: "2025-02-01", video_call_link: "https://teams.microsoft.com/l/meetup-join/marco", status: "active", insights_strikes: 3, sessions_auto: true },
  { id: "u6", name: "Yuki Tanaka", email: "yuki@student.com", password: "", role: "student", current_level: "B2", attendance_percentage: 88, company: "Rakuten", hired_plan: "Core", member_since: "2024-11-20", hired_sessions: 120, remaining_sessions: 82, product: "go", focus: "Global Experience", access_plan: "Core", contracted_levels: ["Kickstart", "Everyday Flow", "Confident Voice", "Culture Master"], current_roadmap_level: "Everyday Flow", sessions_per_week: 2, session_duration: 60, reschedule_policy: "24h notice, max 25% of monthly sessions", payment_day: 20, cycle_start: "2024-11-20", video_call_link: "https://teams.microsoft.com/l/meetup-join/yuki", status: "active", insights_strikes: 0, sessions_auto: true },
];

// Teacher <-> student assignments used to live here as a hardcoded,
// never-persisted array (`ASSIGNMENTS`). Moved to `assignments-store.ts`
// (backed by the real `public.assignments` Supabase table) on 2026-08-08 —
// see that file for why: the old array reset on every page load and was
// never shared between browsers/devices, so any student an admin assigned
// to a teacher after the initial 3 seed rows was invisible to that teacher
// anywhere but the admin's own tab.

const now = new Date();
const inMinutes = (m: number) => new Date(now.getTime() + m * 60_000).toISOString();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

export const SESSIONS: Session[] = [
  // Upcoming — the live one starts soon for demoing the rating popup
  { id: "s1", student_id: "u4", teacher_id: "u2", date_time: inMinutes(-50), duration_minutes: 60, teams_link: "https://teams.microsoft.com/l/meetup", status: "scheduled" },
  { id: "s2", student_id: "u4", teacher_id: "u2", date_time: inMinutes(60 * 24), duration_minutes: 60, teams_link: "https://teams.microsoft.com/l/meetup", status: "scheduled" },
  { id: "s3", student_id: "u5", teacher_id: "u2", date_time: inMinutes(60 * 6), duration_minutes: 60, teams_link: "https://teams.microsoft.com/l/meetup", status: "scheduled" },
  { id: "s4", student_id: "u6", teacher_id: "u3", date_time: inMinutes(60 * 3), duration_minutes: 60, teams_link: "https://teams.microsoft.com/l/meetup", status: "scheduled" },
  // History
  { id: "s5", student_id: "u4", teacher_id: "u2", date_time: daysAgo(2), duration_minutes: 60, teams_link: "", status: "completed", report_pdf_url: "/mock-report.pdf", student_rating: 5 },
  { id: "s6", student_id: "u4", teacher_id: "u2", date_time: daysAgo(5), duration_minutes: 60, teams_link: "", status: "completed", report_pdf_url: "/mock-report.pdf", student_rating: 4 },
  { id: "s7", student_id: "u4", teacher_id: "u2", date_time: daysAgo(9), duration_minutes: 60, teams_link: "", status: "absent" },
  { id: "s8", student_id: "u5", teacher_id: "u2", date_time: daysAgo(3), duration_minutes: 60, teams_link: "", status: "completed", report_pdf_url: "/mock-report.pdf", student_rating: 4 },
  // Low ratings (flagged reviews)
  { id: "s9", student_id: "u4", teacher_id: "u2", date_time: daysAgo(6), duration_minutes: 60, teams_link: "", status: "completed", report_pdf_url: "/mock-report.pdf", student_rating: 2, student_comment: "The teacher arrived 10 minutes late and I felt the class wasn't prepared. We lost valuable time.", review_status: "pending" },
  { id: "s10", student_id: "u5", teacher_id: "u2", date_time: daysAgo(11), duration_minutes: 60, teams_link: "", status: "completed", report_pdf_url: "/mock-report.pdf", student_rating: 1, student_comment: "Audio issues throughout the session and we didn't cover the planned material.", review_status: "pending" },
  { id: "s11", student_id: "u6", teacher_id: "u3", date_time: daysAgo(14), duration_minutes: 60, teams_link: "", status: "completed", report_pdf_url: "/mock-report.pdf", student_rating: 2, student_comment: "The class felt rushed; I wanted more free-conversation practice.", review_status: "reviewed", review_note: "Talked with James. He adjusted the pace and added 10 min of free speaking. Follow up in 2 weeks." },
];

export const LEVELS: Level[] = [
  { id: "A1", title: "A1 — Beginner", units: [
    { id: "A1-U1", title: "Introductions & greetings", video_url: "", pdf_url: "" },
    { id: "A1-U2", title: "Daily routines", video_url: "", pdf_url: "" },
  ]},
  { id: "A2", title: "A2 — Elementary", units: [
    { id: "A2-U1", title: "Past simple narratives", video_url: "", pdf_url: "" },
    { id: "A2-U2", title: "Travel & directions", video_url: "", pdf_url: "" },
  ]},
  { id: "B1", title: "B1 — Intermediate", units: [
    { id: "B1-U1", title: "Workplace communication", video_url: "", pdf_url: "" },
    { id: "B1-U2", title: "Expressing opinions", video_url: "", pdf_url: "" },
    { id: "B1-U3", title: "Conditional structures", video_url: "", pdf_url: "" },
  ]},
  { id: "B2", title: "B2 — Upper-Intermediate", units: [
    { id: "B2-U1", title: "Business negotiations", video_url: "", pdf_url: "" },
  ]},
];

export const MATERIALS: Material[] = [
  { id: "m1", title: "Cambridge English in Use — B1", material_type: "book", upload_url: "#", category: "Grammar" },
  { id: "m2", title: "Irregular verbs cheat sheet", material_type: "verb-list", upload_url: "#", category: "Vocabulary" },
  { id: "m3", title: "Business idioms PDF", material_type: "pdf", upload_url: "#", category: "Business" },
  { id: "m4", title: "Pronunciation masterclass", material_type: "video", upload_url: "#", category: "Speaking" },
];

export const QUOTES = [
  "The limits of my language mean the limits of my world. — Ludwig Wittgenstein",
  "One language sets you in a corridor for life. Two languages open every door along the way. — Frank Smith",
  "To have another language is to possess a second soul. — Charlemagne",
];

export function userById(id: string) {
  return USERS.find((u) => u.id === id);
}

export function studentsOfTeacher(teacherId: string) {
  const ids = assignedStudentIdsFor(teacherId);
  return USERS.filter((u) => ids.includes(u.id));
}
