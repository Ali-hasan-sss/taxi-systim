import { create } from "zustand";

export type ChatRoomPreview = {
  senderName: string;
  body: string | null;
  imageUrl: string | null;
  hasVoice?: boolean;
};

export type ChatIncomingToast = {
  roomId: string;
  messageId: string;
  senderName: string;
  body: string | null;
  imageUrl: string | null;
  hasVoice?: boolean;
};

export type DriverAppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

interface DriverState {
  isOnline: boolean;
  setOnline: (v: boolean) => void;
  workBlocked: boolean;
  workBlockMessage: string | null;
  setWorkBlocked: (blocked: boolean, message?: string | null) => void;
  applyDebtWorkState: (stats: { workBlocked?: boolean; workBlockMessage?: string | null }) => void;
  /** عدد الطلبات المعلّقة في غرفة الطلبات (للبادج على التاب) */
  roomPendingCount: number;
  setRoomPendingCount: (n: number) => void;
  unreadChatCount: number;
  unreadByRoom: Record<string, number>;
  chatPreviewByRoom: Record<string, ChatRoomPreview>;
  handledChatMessageIds: Record<string, true>;
  activeChatRoomId: string | null;
  setActiveChatRoomId: (roomId: string | null) => void;
  notifyIncomingChatMessage: (
    roomId: string,
    messageId: string,
    preview?: ChatRoomPreview
  ) => boolean;
  pendingChatToast: ChatIncomingToast | null;
  clearChatToast: () => void;
  incrementUnreadChat: (roomId: string) => void;
  markChatRoomRead: (roomId: string) => void;
  incrementRoomPendingCount: () => void;
  notifications: DriverAppNotification[];
  unreadNotificationCount: number;
  setNotifications: (rows: DriverAppNotification[], unreadCount: number) => void;
  prependNotification: (row: DriverAppNotification) => void;
  markNotificationsRead: () => void;
}

function sumUnread(map: Record<string, number>) {
  return Object.values(map).reduce((a, b) => a + b, 0);
}

const HANDLED_CHAT_MESSAGE_LIMIT = 200;

function pruneHandledChatMessageIds(handled: Record<string, true>): Record<string, true> {
  const keys = Object.keys(handled);
  if (keys.length <= HANDLED_CHAT_MESSAGE_LIMIT) return handled;
  const next: Record<string, true> = {};
  for (const key of keys.slice(-HANDLED_CHAT_MESSAGE_LIMIT)) {
    next[key] = true;
  }
  return next;
}

export const useDriverStore = create<DriverState>((set, get) => ({
  isOnline: false,
  setOnline: (v) => set({ isOnline: v }),
  workBlocked: false,
  workBlockMessage: null,
  setWorkBlocked: (blocked, message) =>
    set({
      workBlocked: blocked,
      workBlockMessage: blocked ? (message ?? get().workBlockMessage) : null
    }),
  applyDebtWorkState: (stats) =>
    set({
      workBlocked: Boolean(stats.workBlocked),
      workBlockMessage: stats.workBlocked ? (stats.workBlockMessage ?? get().workBlockMessage) : null
    }),
  roomPendingCount: 0,
  setRoomPendingCount: (n) => set({ roomPendingCount: Math.max(0, n) }),
  unreadChatCount: 0,
  unreadByRoom: {},
  chatPreviewByRoom: {},
  handledChatMessageIds: {},
  activeChatRoomId: null,
  pendingChatToast: null,
  clearChatToast: () => set({ pendingChatToast: null }),
  setActiveChatRoomId: (roomId) => set({ activeChatRoomId: roomId }),
  notifyIncomingChatMessage: (roomId, messageId, preview) => {
    const state = get();
    if (state.activeChatRoomId === roomId) return false;
    if (state.handledChatMessageIds[messageId]) return false;

    const handled = pruneHandledChatMessageIds({
      ...state.handledChatMessageIds,
      [messageId]: true
    });
    const nextUnread = {
      ...state.unreadByRoom,
      [roomId]: (state.unreadByRoom[roomId] ?? 0) + 1
    };
    const updates: Partial<DriverState> = {
      handledChatMessageIds: handled,
      unreadByRoom: nextUnread,
      unreadChatCount: sumUnread(nextUnread)
    };
    if (preview) {
      updates.chatPreviewByRoom = { ...state.chatPreviewByRoom, [roomId]: preview };
      updates.pendingChatToast = {
        roomId,
        messageId,
        senderName: preview.senderName,
        body: preview.body,
        imageUrl: preview.imageUrl,
        hasVoice: preview.hasVoice
      };
    }
    set(updates);
    return true;
  },
  incrementUnreadChat: (roomId) => {
    get().notifyIncomingChatMessage(roomId, `${roomId}:${Date.now()}:${Math.random()}`);
  },
  markChatRoomRead: (roomId) => {
    if (!get().unreadByRoom[roomId]) return;
    const next = { ...get().unreadByRoom };
    delete next[roomId];
    set({ unreadByRoom: next, unreadChatCount: sumUnread(next) });
  },
  incrementRoomPendingCount: () =>
    set((s) => ({ roomPendingCount: s.roomPendingCount + 1 })),
  notifications: [],
  unreadNotificationCount: 0,
  setNotifications: (rows, unreadCount) =>
    set({
      notifications: rows,
      unreadNotificationCount: Math.max(0, unreadCount)
    }),
  prependNotification: (row) => {
    const state = get();
    if (state.notifications.some((n) => n.id === row.id)) return;
    const unread = row.readAt ? state.unreadNotificationCount : state.unreadNotificationCount + 1;
    set({
      notifications: [row, ...state.notifications].slice(0, 50),
      unreadNotificationCount: unread
    });
  },
  markNotificationsRead: () => {
    const now = new Date().toISOString();
    set((s) => ({
      unreadNotificationCount: 0,
      notifications: s.notifications.map((n) => (n.readAt ? n : { ...n, readAt: now }))
    }));
  }
}));
