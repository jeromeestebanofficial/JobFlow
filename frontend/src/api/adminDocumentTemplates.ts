import api from "./client";
import type { DocumentTemplate } from "../types";

export type AvailableSlugs = { resume: string[]; cover_letter: string[] };

export const getAvailableSlugs = () => api.get<AvailableSlugs>("/admin/document-templates/available-slugs");

export const adminListTemplates = () => api.get<DocumentTemplate[]>("/admin/document-templates/");

export const adminCreateTemplate = (data: {
  template_type: "resume" | "cover_letter";
  slug: string;
  name: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
}) => api.post<DocumentTemplate>("/admin/document-templates/", data);

export const adminUpdateTemplate = (
  id: number,
  data: { name?: string; description?: string | null; sort_order?: number; is_active?: boolean }
) => api.patch<DocumentTemplate>(`/admin/document-templates/${id}`, data);

export const adminDeleteTemplate = (id: number) => api.delete(`/admin/document-templates/${id}`);
