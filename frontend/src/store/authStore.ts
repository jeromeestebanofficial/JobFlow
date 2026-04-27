import { create } from "zustand";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setHydrated: () => void;
}

const storedToken = localStorage.getItem("access_token");

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: storedToken,
  isAuthenticated: !!storedToken,
  isHydrated: false,

  setAuth: (user, accessToken, refreshToken) => {
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("refresh_token", refreshToken);
    set({ user, accessToken, isAuthenticated: true, isHydrated: true });
  },

  logout: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    set({ user: null, accessToken: null, isAuthenticated: false, isHydrated: true });
  },

  setHydrated: () => set({ isHydrated: true }),
}));
