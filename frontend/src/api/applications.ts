import api from "./client";

export const getApplications = (status?: string) =>
  api.get("/applications/", { params: status ? { status } : {} });

export const createApplication = (data: { job_id: number; resume_id?: number; cover_letter?: string }) =>
  api.post("/applications/", data);

export const swipe = (data: { job_id: number; action: "right" | "left"; resume_id?: number }) =>
  api.post("/applications/swipe", data);

export const tailorForJob = (job_id: number, resume_id?: number) =>
  api.post("/applications/tailor", { job_id, resume_id });

export const getSavedTailorJobIds = () =>
  api.get<{ job_ids: number[] }>("/applications/tailor/saved-job-ids");

export const getSavedTailorDraft = (job_id: number) =>
  api.get<{
    saved: boolean;
    job_id?: number;
    resume_id?: number | null;
    tailored_resume?: Record<string, any>;
    cover_letter?: string;
    updated_at?: string | null;
  }>(`/applications/tailor/saved/${job_id}`);

export const saveTailorDraft = (payload: {
  job_id: number;
  resume_id?: number;
  tailored_resume: Record<string, any>;
  cover_letter: string;
  resume_style?: string;
}) => api.post("/applications/tailor/save", payload);

export const getAbExperimentMetrics = () =>
  api.get<{ rows: Array<{ role_type: string; variant: "A" | "B"; total: number; responses: number; response_rate: number }> }>("/applications/experiments/ab");

export type TailorExportPayload = {
  tailored_resume: Record<string, unknown>;
  cover_letter: string;
  resume_template_id: number;
  cover_template_id: number;
  job_title?: string;
  company?: string;
};

export const exportTailoredPdfs = (payload: TailorExportPayload) =>
  api.post("/applications/tailor/export", payload, { responseType: "arraybuffer" });

export const updateApplication = (id: number, data: { status?: string; notes?: string }) =>
  api.put(`/applications/${id}`, data);

export const deleteApplication = (id: number) => api.delete(`/applications/${id}`);
