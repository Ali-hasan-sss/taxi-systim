import { create } from "zustand";

interface CoordinatorUiState {
  /** عدد الطلبات المتعثرة (STUCK) في قائمة الطلبات النشطة — لبادج التاب */
  stuckOrdersCount: number;
  setStuckOrdersCount: (n: number) => void;
}

export const useCoordinatorStore = create<CoordinatorUiState>((set) => ({
  stuckOrdersCount: 0,
  setStuckOrdersCount: (n) => set({ stuckOrdersCount: Math.max(0, n) })
}));
