"use client";

import { create } from "zustand";

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: "ADMIN";
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AdminUser | null;
  setSession: (payload: { accessToken: string; refreshToken: string; user: AdminUser }) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  setSession: ({ accessToken, refreshToken, user }) => set({ accessToken, refreshToken, user }),
  clearSession: () => set({ accessToken: null, refreshToken: null, user: null })
}));
