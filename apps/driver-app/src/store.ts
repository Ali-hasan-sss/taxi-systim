import { create } from "zustand";

interface DriverState {
  isOnline: boolean;
  setOnline: (v: boolean) => void;
}

export const useDriverStore = create<DriverState>((set) => ({
  isOnline: false,
  setOnline: (v) => set({ isOnline: v })
}));
