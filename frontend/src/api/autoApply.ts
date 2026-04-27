import api from "./client";

export interface LinkedInCredentials {
  email: string;
  password: string;
}

export interface CredentialsStatus {
  configured: boolean;
  email_hint: string | null;
}

export interface TaskStatus {
  status: "pending" | "queued" | "running" | "done" | "error" | "cancelled";
  messages: string[];
  result: { success: boolean; message: string; screenshot?: string } | null;
  current_step?: string;
  progress?: number;
}

export interface LinkedInQuestionnaire {
  work_authorization?: string;
  visa_sponsorship?: string;
  valid_work_pass?: string;
  years_experience?: string;
  language_proficiency?: string;
  completed_degree?: string;
  expected_salary?: string;
  commute_ok?: string;
  work_setting_ok?: string;
  notice_period?: string;
  gender?: string;
  race_ethnicity?: string;
  protected_veteran?: string;
  disability?: string;
  why_join?: string;
  project_example?: string;
  portfolio_link?: string;
}

export interface ApplyGuardrailCheck {
  name: string;
  ok: boolean;
  message: string;
}

export interface ApplyGuardrailsResponse {
  ready: boolean;
  apply_mode: "external" | "linkedin_easy";
  checks: ApplyGuardrailCheck[];
}

export const autoApplyApi = {
  saveCredentials: (data: LinkedInCredentials) =>
    api.post("/auto-apply/credentials", data),

  getCredentialsStatus: () =>
    api.get<CredentialsStatus>("/auto-apply/credentials"),

  deleteCredentials: () => api.delete("/auto-apply/credentials"),

  getQuestionnaire: () =>
    api.get<LinkedInQuestionnaire>("/auto-apply/questionnaire"),

  saveQuestionnaire: (data: LinkedInQuestionnaire) =>
    api.put("/auto-apply/questionnaire", data),

  triggerApply: (
    jobId: number,
    payload?: { resume_id?: number; cover_letter?: string; phone?: string; tailored_resume?: Record<string, any> }
  ) =>
    api.post<{ task_id: string; status: string }>(
      `/auto-apply/apply/${jobId}`,
      payload ?? {}
    ),

  getStatus: (taskId: string) =>
    api.get<TaskStatus>(`/auto-apply/status/${taskId}`),

  applyByUrl: (payload: { job_url: string; cover_letter?: string; phone?: string }) =>
    api.post<{ task_id: string; status: string }>("/auto-apply/apply-by-url", payload),

  getGuardrails: (jobId: number) =>
    api.get<ApplyGuardrailsResponse>(`/extension/guardrails/${jobId}`),
};
