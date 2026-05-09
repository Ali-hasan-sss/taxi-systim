import { create } from "zustand";

interface DriverState {
  isOnline: boolean;
  setOnline: (v: boolean) => void;
  /** عدد الطلبات المعلّقة في غرفة الطلبات (للبادج على التاب) */
  roomPendingCount: number;
  setRoomPendingCount: (n: number) => void;
}

export const useDriverStore = create<DriverState>((set) => ({
  isOnline: false,
  setOnline: (v) => set({ isOnline: v }),
  roomPendingCount: 0,
  setRoomPendingCount: (n) => set({ roomPendingCount: Math.max(0, n) })
}));
