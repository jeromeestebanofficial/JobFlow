import api from "./client";
import type { DocumentTemplate } from "../types";

export const getDocumentTemplates = (template_type?: "resume" | "cover_letter") =>
  api.get<DocumentTemplate[]>("/document-templates/", {
    params: template_type ? { template_type } : {},
  });
