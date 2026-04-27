import api from "./client";
import type { TokenResponse } from "../types";

export const register = (email: string, password: string, full_name?: string) =>
  api.post<TokenResponse>("/auth/register", { email, password, full_name });

export const login = (email: string, password: string) =>
  api.post<TokenResponse>("/auth/login", { email, password });

export const getMe = () => api.get("/users/me");
