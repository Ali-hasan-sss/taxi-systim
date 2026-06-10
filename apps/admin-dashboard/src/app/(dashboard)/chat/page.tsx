"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { chatSocketEvents, socketEvents, type ChatReceiptStatus } from "@taxi/config";
import { ChatMessageReceipt } from "../../../components/chat-message-receipt";
import { api, getSocketOrigin, type ChatMessageRow, type ChatRoomRow } from "../../../lib/api";
import { useDebouncedSearch } from "../../../lib/use-debounced-value";
import { useChatMobileViewport } from "../../../lib/use-chat-mobile-viewport";
import styles from "./page.module.css";

const SESSION_KEY = "taxi_admin_session";

type ChatScope = "active" | "archived";

function AuthChatImage({
  url,
  token,
  onReady
}: {
  url: string;
  token: string;
  onReady?: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    void api
      .fetchChatImageObjectUrl(token, url)
      .then((next) => {
        if (cancelled) return;
        if (!next) {
          setFailed(true);
          return;
        }
        objectUrl = next;
        setSrc(next);
        onReady?.();
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, token]);
  if (failed) return <p>[تعذر تحميل الصورة]</p>;
  if (!src) return <p>…</p>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={styles.image} />;
}

function formatOrderRoomHeading(room: ChatRoomRow): string {
  if (room.type === "GLOBAL") return room.title;
  if (room.coordinatorName || room.driverName) {
    const coord = room.coordinatorName?.trim() || "—";
    const driver = room.driverName?.trim() || "سائق غير معيّن";
    return `${coord} -- ${driver}`;
  }
  return room.title;
}

function formatOrderRoomPickup(room: ChatRoomRow): string | null {
  if (room.type !== "ORDER") return null;
  const pickup = room.pickupAddress?.trim() || room.orderLabel?.replace(/^طلب:\s*/u, "").trim();
  if (!pickup) return null;
  return `طلب : ${pickup}`;
}

export default function ChatPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return (JSON.parse(raw) as { accessToken: string }).accessToken;
    } catch {
      return null;
    }
  }, []);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myFullName, setMyFullName] = useState("");
  const [rooms, setRooms] = useState<ChatRoomRow[]>([]);
  const [scope, setScope] = useState<ChatScope>("active");
  const [roomSearchDraft, setRoomSearchDraft] = useState("");
  const { query: roomSearchQuery, isPending: roomSearchPending } = useDebouncedSearch(roomSearchDraft);
  const [activeRoom, setActiveRoom] = useState<ChatRoomRow | null>(null);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [typingFrom, setTypingFrom] = useState<{ userId: string; fullName: string } | null>(null);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const draftInputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActiveRef = useRef(false);

  const scrollToBottom = useCallback((instant = false) => {
    const run = () => {
      const el = listRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    };
    requestAnimationFrame(() => {
      run();
      if (!instant) {
        setTimeout(run, 50);
        setTimeout(run, 250);
      }
    });
  }, []);

  useChatMobileViewport(layoutRef, scrollToBottom, !initialLoading);

  const pickRoom = useCallback((room: ChatRoomRow) => {
    setActiveRoom(room);
    setRoomsOpen(false);
  }, []);

  const onComposerFocus = useCallback(() => {
    scrollToBottom(true);
    window.setTimeout(() => scrollToBottom(true), 120);
    window.setTimeout(() => scrollToBottom(true), 350);
    window.setTimeout(() => scrollToBottom(true), 600);
  }, [scrollToBottom]);

  useEffect(() => {
    if (!roomsOpen) return;
    const mq = window.matchMedia("(max-width: 900px)");
    if (!mq.matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [roomsOpen]);

  useEffect(() => {
    if (!roomsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRoomsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [roomsOpen]);

  const onChatImageReady = useCallback(() => scrollToBottom(true), [scrollToBottom]);

  const updateReceipt = useCallback((messageId: string, status: ChatReceiptStatus) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, receiptStatus: status } : m)));
  }, []);

  const ackIncoming = useCallback(
    (messageId: string, roomId: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      socket.emit(chatSocketEvents.DELIVERED, { messageId });
      socket.emit(chatSocketEvents.READ, { roomId });
      void api.markChatRoomRead(token!, roomId).catch(() => undefined);
    },
    [token]
  );

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (typingActiveRef.current && activeRoom) {
      typingActiveRef.current = false;
      socketRef.current?.emit(chatSocketEvents.TYPING_STOP, { roomId: activeRoom.id });
    }
  }, [activeRoom]);

  const onDraftChange = useCallback(
    (text: string) => {
      setDraft(text);
      const socket = socketRef.current;
      if (!socket || !myUserId || !activeRoom || scope === "archived") return;
      if (text.trim()) {
        if (!typingActiveRef.current) {
          typingActiveRef.current = true;
          socket.emit(chatSocketEvents.TYPING, { roomId: activeRoom.id, fullName: myFullName });
        }
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => stopTyping(), 2000);
      } else {
        stopTyping();
      }
    },
    [activeRoom, myFullName, myUserId, scope, stopTyping]
  );

  const loadRooms = useCallback(async () => {
    if (!token) return;
    const data = await api.listChatRooms(token, scope, roomSearchQuery || undefined);
    setRooms(data);
    setActiveRoom((prev) => {
      if (prev && data.some((r) => r.id === prev.id)) return prev;
      return data[0] ?? null;
    });
  }, [token, scope, roomSearchQuery]);

  const loadMessages = useCallback(
    async (roomId: string) => {
      if (!token) return;
      const page = await api.listChatMessages(token, roomId);
      setMessages(page.messages);
      scrollToBottom(true);
    },
    [token, scrollToBottom]
  );

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }
    void api
      .me(token)
      .then((me) => {
        setMyUserId(me.id);
        setMyFullName(me.fullName);
      })
      .catch(() => {
        localStorage.removeItem(SESSION_KEY);
        router.replace("/login");
      });
  }, [token, router]);

  useEffect(() => {
    if (!token) return;
    setActiveRoom(null);
    setMessages([]);
  }, [scope, token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setRoomsLoading(true);

    void loadRooms()
      .catch((e) => {
        if (!cancelled) alert(e instanceof Error ? e.message : "خطأ");
      })
      .finally(() => {
        if (cancelled) return;
        setRoomsLoading(false);
        setInitialLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, loadRooms, scope, roomSearchQuery]);

  useEffect(() => {
    if (!activeRoom || !token) return;
    void loadMessages(activeRoom.id);
  }, [activeRoom, token, loadMessages]);

  useEffect(() => {
    if (messages.length === 0) return;
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!token || !activeRoom || !myUserId || scope === "archived") return;
    const origin = getSocketOrigin();
    const socket = io(origin, { transports: ["websocket"] });
    socketRef.current = socket;

    const onConnect = () => {
      socket.emit("admin:register");
      socket.emit(chatSocketEvents.REGISTER, myUserId);
      socket.emit(chatSocketEvents.JOIN_ROOM, activeRoom.id);
      socket.emit(chatSocketEvents.READ, { roomId: activeRoom.id });
      void api.markChatRoomRead(token, activeRoom.id).catch(() => undefined);
    };

    const onMessage = (msg: ChatMessageRow) => {
      if (msg.roomId !== activeRoom.id) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.sender.id !== myUserId) {
        ackIncoming(msg.id, activeRoom.id);
      }
    };

    const onTyping = (payload: { roomId?: string; userId?: string; fullName?: string }) => {
      if (payload.roomId !== activeRoom.id || !payload.userId || payload.userId === myUserId) return;
      setTypingFrom({ userId: payload.userId, fullName: payload.fullName ?? "" });
    };

    const onTypingStop = (payload: { roomId?: string; userId?: string }) => {
      if (payload.roomId !== activeRoom.id) return;
      setTypingFrom((prev) => (prev?.userId === payload.userId ? null : prev));
    };

    const onReceipt = (payload: { messageId?: string; status?: ChatReceiptStatus }) => {
      if (!payload.messageId || !payload.status) return;
      updateReceipt(payload.messageId, payload.status);
    };

    socket.on("connect", onConnect);
    socket.on(socketEvents.CHAT_MESSAGE, onMessage);
    socket.on(socketEvents.CHAT_TYPING, onTyping);
    socket.on(socketEvents.CHAT_TYPING_STOP, onTypingStop);
    socket.on(socketEvents.CHAT_RECEIPT, onReceipt);

    return () => {
      stopTyping();
      setTypingFrom(null);
      socket.emit(chatSocketEvents.LEAVE_ROOM, activeRoom.id);
      socket.off("connect", onConnect);
      socket.off(socketEvents.CHAT_MESSAGE, onMessage);
      socket.off(socketEvents.CHAT_TYPING, onTyping);
      socket.off(socketEvents.CHAT_TYPING_STOP, onTypingStop);
      socket.off(socketEvents.CHAT_RECEIPT, onReceipt);
      socket.disconnect();
    };
  }, [token, activeRoom, myUserId, scope, ackIncoming, updateReceipt, stopTyping]);

  const send = async () => {
    if (!token || !activeRoom || !draft.trim() || sending || scope === "archived") return;
    setSending(true);
    stopTyping();
    const text = draft.trim();
    setDraft("");
    try {
      const msg = await api.sendChatMessage(token, activeRoom.id, text);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    } catch (e) {
      setDraft(text);
      alert(e instanceof Error ? e.message : "تعذر الإرسال");
    } finally {
      setSending(false);
    }
  };

  const onPickImage = async (file: File | null) => {
    if (!token || !activeRoom || !file || sending || scope === "archived") return;
    setSending(true);
    stopTyping();
    try {
      const msg = await api.uploadChatImage(token, activeRoom.id, file);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    } catch (e) {
      alert(e instanceof Error ? e.message : "تعذر رفع الصورة");
    } finally {
      setSending(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (initialLoading) {
    return (
      <div className="dashboard-page">
        <p className="loading-row">
          <span className="spinner" aria-hidden />
          جاري التحميل…
        </p>
      </div>
    );
  }

  const isArchivedView = scope === "archived";

  const roomsPanel = (
    <>
      <div className={styles.roomsHead}>
        <h2 className={styles.roomsTitle}>المحادثات</h2>
        <button
          type="button"
          className={styles.roomsCloseBtn}
          onClick={() => setRoomsOpen(false)}
          aria-label="إغلاق قائمة المحادثات"
        >
          ×
        </button>
      </div>
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tabBtn} ${scope === "active" ? styles.tabBtnActive : ""}`}
          onClick={() => setScope("active")}
        >
          نشطة
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${scope === "archived" ? styles.tabBtnActive : ""}`}
          onClick={() => setScope("archived")}
        >
          مؤرشفة
        </button>
      </div>
      <div className={styles.roomSearchWrap}>
        <input
          className={`input-styled ${styles.roomSearch}`}
          type="search"
          value={roomSearchDraft}
          onChange={(e) => setRoomSearchDraft(e.target.value)}
          placeholder="بحث في المحادثات…"
          aria-label="بحث المحادثات"
        />
        {roomSearchPending || (roomsLoading && roomSearchDraft.trim()) ? (
          <span className={styles.roomSearchPending}>جاري البحث…</span>
        ) : null}
      </div>
      {rooms.length === 0 && !roomsLoading && !roomSearchPending ? (
        <p className={styles.emptyRooms}>
          {roomSearchQuery
            ? "لا توجد نتائج مطابقة."
            : isArchivedView
              ? "لا توجد محادثات مؤرشفة."
              : "لا توجد محادثات نشطة."}
        </p>
      ) : null}
      {rooms.map((room) => {
        const pickupLine = formatOrderRoomPickup(room);
        return (
          <button
            key={room.id}
            type="button"
            className={`${styles.roomBtn} ${activeRoom?.id === room.id ? styles.roomBtnActive : ""} ${room.type === "GLOBAL" ? styles.roomGlobal : ""}`}
            onClick={() => pickRoom(room)}
          >
            <strong className={styles.roomBtnTitle}>{formatOrderRoomHeading(room)}</strong>
            {pickupLine ? <span className={styles.roomBtnPickup}>{pickupLine}</span> : null}
          </button>
        );
      })}
    </>
  );

  return (
    <div className={`dashboard-page ${styles.page}`}>
      <div
        ref={layoutRef}
        className={`${styles.layout}${roomsOpen ? ` ${styles.layoutRoomsOpen}` : ""}`}
      >
        {roomsOpen ? (
          <button
            type="button"
            className={styles.roomsBackdrop}
            onClick={() => setRoomsOpen(false)}
            aria-label="إغلاق قائمة المحادثات"
          />
        ) : null}
        <aside className={styles.rooms}>{roomsPanel}</aside>
        <section className={styles.thread}>
          <header className={styles.threadHeader}>
            <div className={styles.threadHeaderMain}>
              <button
                type="button"
                className={styles.roomsToggleBtn}
                onClick={() => setRoomsOpen(true)}
                aria-label="فتح قائمة المحادثات"
                aria-expanded={roomsOpen}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"
                  />
                </svg>
              </button>
              <div>
                <h2>{activeRoom ? formatOrderRoomHeading(activeRoom) : "اختر محادثة"}</h2>
              {(() => {
                const pickupLine = activeRoom ? formatOrderRoomPickup(activeRoom) : null;
                return pickupLine ? <p className={styles.roomThreadPickup}>{pickupLine}</p> : null;
              })()}
              {isArchivedView && activeRoom?.archivedAt ? (
                <p className={styles.archivedHint}>
                  محادثة مؤرشفة — للقراءة فقط (أُرشفت{" "}
                  {new Date(activeRoom.archivedAt).toLocaleString("ar-SY")})
                </p>
              ) : null}
              </div>
            </div>
            {typingFrom ? (
              <p className={styles.typingIndicator} aria-live="polite">
                <span className={styles.typingDots} aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
                {typingFrom.fullName || "مستخدم"} يكتب…
              </p>
            ) : null}
          </header>
          <div className={styles.messages} ref={listRef}>
            {!activeRoom ? (
              <div className={styles.threadEmpty}>
                <p>اختر محادثة من القائمة للبدء.</p>
                <button type="button" className="btn btn-primary" onClick={() => setRoomsOpen(true)}>
                  عرض المحادثات
                </button>
              </div>
            ) : (
              messages.map((m) => {
              const mine = m.sender.role === "ADMIN";
              return (
                <div key={m.id} className={mine ? styles.bubbleMine : styles.bubbleOther}>
                  {!mine ? <div className={styles.sender}>{m.sender.fullName}</div> : null}
                  {m.imageUrl && token ? (
                    <AuthChatImage url={m.imageUrl} token={token} onReady={onChatImageReady} />
                  ) : m.imageExpired ? (
                    <p>[انتهت صلاحية الصورة]</p>
                  ) : null}
                  {m.body ? <p>{m.body}</p> : null}
                  <div className={styles.bubbleMeta}>
                    <time>{new Date(m.createdAt).toLocaleTimeString("ar-SY")}</time>
                    {mine ? <ChatMessageReceipt status={m.receiptStatus} className={styles.receipt} /> : null}
                  </div>
                </div>
              );
            })
            )}
          </div>
          {!isArchivedView ? (
            <footer className={styles.composer}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className={styles.hiddenFile}
                onChange={(e) => void onPickImage(e.target.files?.[0] ?? null)}
              />
              <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={sending || !activeRoom}>
                صورة
              </button>
              <input
                ref={draftInputRef}
                className={styles.input}
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onFocus={onComposerFocus}
                placeholder="اكتب رسالة…"
                disabled={!activeRoom}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button type="button" className="btn btn-primary" onClick={() => void send()} disabled={sending || !activeRoom}>
                إرسال
              </button>
            </footer>
          ) : null}
        </section>
      </div>
    </div>
  );
}
