export interface User {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_admin?: boolean;
  created_at: string;
}

export interface DocumentTemplate {
  id: number;
  template_type: "resume" | "cover_letter";
  slug: string;
  name: string;
  description?: string | null;
  sort_order: number;
  is_active?: boolean;
  is_system?: boolean;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface ExperienceItem {
  title: string;
  company: string;
  location?: string;
  start_date: string;
  end_date?: string;
  bullets: string[];
}

export interface EducationItem {
  degree: string;
  school: string;
  year?: string;
  gpa?: string;
}

export interface ProjectItem {
  name: string;
  description: string;
  tech: string[];
  url?: string;
}

export interface Resume {
  id: number;
  name: string;
  is_default: boolean;
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
  summary?: string;
  experience?: ExperienceItem[];
  education?: EducationItem[];
  skills?: string[];
  certifications?: string[];
  projects?: ProjectItem[];
  created_at: string;
  updated_at?: string;
}

export interface Job {
  id: number;
  external_id?: string;
  source?: string;
  title: string;
  company?: string;
  location?: string;
  is_remote: boolean;
  job_type?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  description?: string;
  url?: string;
  apply_url?: string;
  logo_url?: string;
  tags?: string[];
  posted_at?: string;
  expires_at?: string;
  fetched_at?: string;
  match_score?: number;
  is_easy_apply?: boolean;
  is_available?: boolean;
  availability_reason?: string | null;
}

export interface Application {
  id: number;
  status: ApplicationStatus;
  match_score?: number;
  cover_letter?: string;
  notes?: string;
  is_auto_applied: boolean;
  auto_apply_status?: "queued" | "running" | "done" | "error" | "cancelled" | null;
  auto_apply_task_id?: string | null;
  auto_apply_error?: string | null;
  applied_at?: string;
  created_at: string;
  job: Job;
  resume?: {
    id: number;
    name?: string;
    full_name?: string;
  } | null;
}

export type ApplicationStatus =
  | "pending"
  | "applied"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "skipped";

export interface Preferences {
  job_titles?: string[];
  locations?: string[];
  remote_only?: boolean;
  min_salary?: number;
  job_types?: string[];
  skills?: string[];
  excluded_companies?: string[];
  auto_apply_enabled?: boolean;
  auto_apply_min_score?: number;
  auto_sync_enabled?: boolean;
  auto_sync_highest_match_only?: boolean;
  auto_sync_limit?: number;
  auto_sync_offset?: number;
  auto_sync_location_filter?: string;
  auto_sync_description_type?: "text" | "html";
  auto_sync_type_filter?: string;
  auto_sync_remote?: "any" | "true" | "false";
  auto_sync_description_filter?: string;
  auto_sync_organization_filter?: string;
  auto_sync_industry_filter?: string;
  auto_sync_seniority_filter?: string;
  auto_sync_external_apply_url?: "any" | "true";
  auto_sync_ai_work_arrangement_filter?: string;
  auto_sync_ai_experience_level_filter?: string;
  auto_sync_ai_visa_sponsorship_filter?: "any" | "true";
  auto_sync_order?: "" | "asc" | "desc";
  auto_sync_endpoint?: string;
  auto_sync_daily_budget?: number;
  auto_sync_max_per_run?: number;
  auto_sync_last_run_at?: string;
  auto_sync_last_fetched?: number;
  auto_sync_last_saved?: number;
  auto_sync_last_highest_match?: number;
  auto_sync_last_reason?: string;
}
