import { create } from "zustand";

interface DriverState {
  isOnline: boolean;
  setOnline: (v: boolean) => void;
  /** عدد الطلبات المعلّقة في غرفة الطلبات (للبادج على التاب) */
  roomPendingCount: number;
  setRoomPendingCount: (n: number) => void;
  unreadChatCount: number;
  unreadByRoom: Record<string, number>;
  activeChatRoomId: string | null;
  setActiveChatRoomId: (roomId: string | null) => void;
  incrementUnreadChat: (roomId: string) => void;
  markChatRoomRead: (roomId: string) => void;
  incrementRoomPendingCount: () => void;
}

function sumUnread(map: Record<string, number>) {
  return Object.values(map).reduce((a, b) => a + b, 0);
}

export const useDriverStore = create<DriverState>((set, get) => ({
  isOnline: false,
  setOnline: (v) => set({ isOnline: v }),
  roomPendingCount: 0,
  setRoomPendingCount: (n) => set({ roomPendingCount: Math.max(0, n) }),
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
  incrementRoomPendingCount: () =>
    set((s) => ({ roomPendingCount: s.roomPendingCount + 1 }))
}));
