import { create } from "zustand";

interface CoordinatorUiState {
  stuckOrdersCount: number;
  setStuckOrdersCount: (n: number) => void;
  unreadChatCount: number;
  unreadByRoom: Record<string, number>;
  activeChatRoomId: string | null;
  setActiveChatRoomId: (roomId: string | null) => void;
  incrementUnreadChat: (roomId: string) => void;
  markChatRoomRead: (roomId: string) => void;
  webInquiryCount: number;
  setWebInquiryCount: (n: number) => void;
  incrementWebInquiryCount: () => void;
  orderRefreshTick: number;
  bumpOrderRefresh: () => void;
}

function sumUnread(map: Record<string, number>) {
  return Object.values(map).reduce((a, b) => a + b, 0);
}

export const useCoordinatorStore = create<CoordinatorUiState>((set, get) => ({
  stuckOrdersCount: 0,
  setStuckOrdersCount: (n) => set({ stuckOrdersCount: Math.max(0, n) }),
  unreadChatCount: 0,
  unreadByRoom: {},
  activeChatRoomId: null,
  setActiveChatRoomId: (roomId) => set({ activeChatRoomId: roomId }),
  incrementUnreadChat: (roomId) => {
    if (get().activeChatRoomId === roomId) return;
    const next = { ...get().unreadByRoom, [roomId]: (get().unreadByRoom[roomId] ?? 0) + 1 };
    set({ unreadByRoom: next, unreadChatCount: sumUnread(next) });
  },
  markChatRoomRead: (roomId) => {
    if (!get().unreadByRoom[roomId]) return;
    const next = { ...get().unreadByRoom };
    delete next[roomId];
    set({ unreadByRoom: next, unreadChatCount: sumUnread(next) });
  },
  webInquiryCount: 0,
  setWebInquiryCount: (n) => set({ webInquiryCount: Math.max(0, n) }),
  incrementWebInquiryCount: () => set((s) => ({ webInquiryCount: s.webInquiryCount + 1 })),
  orderRefreshTick: 0,
  bumpOrderRefresh: () => set((s) => ({ orderRefreshTick: s.orderRefreshTick + 1 }))
}));
