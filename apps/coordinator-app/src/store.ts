import { create } from "zustand";

export type ChatRoomPreview = {
  senderName: string;
  body: string | null;
  imageUrl: string | null;
};

interface CoordinatorUiState {
  stuckOrdersCount: number;
  setStuckOrdersCount: (n: number) => void;
  unreadChatCount: number;
  unreadByRoom: Record<string, number>;
  chatPreviewByRoom: Record<string, ChatRoomPreview>;
  handledChatMessageIds: Record<string, true>;
  activeChatRoomId: string | null;
  setActiveChatRoomId: (roomId: string | null) => void;
  authEpoch: number;
  bumpAuthEpoch: () => void;
  notifyIncomingChatMessage: (
    roomId: string,
    messageId: string,
    preview?: ChatRoomPreview
  ) => boolean;
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

export const useCoordinatorStore = create<CoordinatorUiState>((set, get) => ({
  stuckOrdersCount: 0,
  setStuckOrdersCount: (n) => set({ stuckOrdersCount: Math.max(0, n) }),
  unreadChatCount: 0,
  unreadByRoom: {},
  chatPreviewByRoom: {},
  handledChatMessageIds: {},
  activeChatRoomId: null,
  setActiveChatRoomId: (roomId) => set({ activeChatRoomId: roomId }),
  authEpoch: 0,
  bumpAuthEpoch: () => set((s) => ({ authEpoch: s.authEpoch + 1 })),
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
    const updates: Partial<CoordinatorUiState> = {
      handledChatMessageIds: handled,
      unreadByRoom: nextUnread,
      unreadChatCount: sumUnread(nextUnread)
    };
    if (preview) {
      updates.chatPreviewByRoom = { ...state.chatPreviewByRoom, [roomId]: preview };
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
  webInquiryCount: 0,
  setWebInquiryCount: (n) => set({ webInquiryCount: Math.max(0, n) }),
  incrementWebInquiryCount: () => set((s) => ({ webInquiryCount: s.webInquiryCount + 1 })),
  orderRefreshTick: 0,
  bumpOrderRefresh: () => set((s) => ({ orderRefreshTick: s.orderRefreshTick + 1 }))
}));
