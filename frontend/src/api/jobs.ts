import api from "./client";

export const searchJobs = (params: {
  q?: string;
  location?: string;
  remote?: string;
  job_type?: string;
  min_salary?: number;
  max_salary?: number;
  source?: string;
  sort?: string;
  refresh_sources?: boolean;
  page?: number;
  per_page?: number;
}) => api.get("/jobs/", { params });

export const getSwipeQueue = (limit = 10) =>
  api.get("/jobs/swipe", { params: { limit } });

export const getJob = (id: number) => api.get(`/jobs/${id}`);

export const computeMatch = (jobId: number, resumeId?: number) =>
  api.post(`/jobs/${jobId}/match`, null, { params: resumeId ? { resume_id: resumeId } : {} });

export type LinkedinSyncParams = {
  limit?: number;
  offset?: number;
  title_filter?: string;
  location_filter?: string;
  description_filter?: string;
  organization_filter?: string;
  organization_slug_filter?: string;
  description_type?: "text" | "html";
  type_filter?: string;
  remote?: boolean;
  agency?: boolean;
  industry_filter?: string;
  seniority_filter?: string;
  date_filter?: string;
  directapply?: boolean;
  external_apply_url?: boolean;
  ai_work_arrangement_filter?: string;
  ai_experience_level_filter?: string;
  ai_visa_sponsorship_filter?: boolean;
  order?: "asc" | "desc";
  advanced_title_filter?: string;
  advanced_organization_filter?: string;
  include_ai?: boolean;
  endpoint?: string;
};

export const syncLinkedinJobs = (params?: LinkedinSyncParams) =>
  api.post("/jobs/sync/linkedin", null, { params: params || {} });

export const resetLinkedinJobs = () =>
  api.delete("/jobs/sync/linkedin/reset");

export const deleteLinkedinJob = (jobId: number) =>
  api.delete(`/jobs/linkedin/${jobId}`);

export const resetJobsDatabase = (params?: {
  source?: string;
  location_filter?: string;
  remote?: boolean;
  external_apply_url?: boolean;
}) =>
  api.delete("/jobs/reset", { params: params || {} });
