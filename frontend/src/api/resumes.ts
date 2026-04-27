import api from "./client";
import type { Resume } from "../types";

export const getResumes = () => api.get<Resume[]>("/resumes/");
export const getResume = (id: number) => api.get<Resume>(`/resumes/${id}`);
export const createResume = (data: Partial<Resume>) => api.post<Resume>("/resumes/", data);
export const updateResume = (id: number, data: Partial<Resume>) => api.put<Resume>(`/resumes/${id}`, data);
export const deleteResume = (id: number) => api.delete(`/resumes/${id}`);
