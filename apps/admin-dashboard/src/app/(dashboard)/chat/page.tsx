"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { api, getSocketOrigin, type ChatMessageRow, type ChatRoomRow } from "../../../lib/api";
import styles from "./page.module.css";

const SESSION_KEY = "taxi_admin_session";
const CHAT_MESSAGE = "CHAT_MESSAGE";

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

  const [rooms, setRooms] = useState<ChatRoomRow[]>([]);
  const [scope, setScope] = useState<ChatScope>("active");
  const [activeRoom, setActiveRoom] = useState<ChatRoomRow | null>(null);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const onChatImageReady = useCallback(() => scrollToBottom(true), [scrollToBottom]);

  const loadRooms = useCallback(async () => {
    if (!token) return;
    const data = await api.listChatRooms(token, scope);
    setRooms(data);
    setActiveRoom((prev) => {
      if (prev && data.some((r) => r.id === prev.id)) return prev;
      return data[0] ?? null;
    });
  }, [token, scope]);

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
    setLoading(true);
    setActiveRoom(null);
    setMessages([]);
    loadRooms()
      .catch((e) => alert(e instanceof Error ? e.message : "خطأ"))
      .finally(() => setLoading(false));
  }, [token, router, loadRooms, scope]);

  useEffect(() => {
    if (!activeRoom || !token) return;
    void loadMessages(activeRoom.id);
  }, [activeRoom, token, loadMessages]);

  useEffect(() => {
    if (messages.length === 0) return;
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!token || !activeRoom) return;
    const origin = getSocketOrigin();
    const socket = io(origin, { transports: ["websocket"] });
    socketRef.current = socket;
    const onConnect = () => {
      socket.emit("admin:register");
      socket.emit("chat:join", activeRoom.id);
    };
    const onMessage = (msg: ChatMessageRow) => {
      if (msg.roomId !== activeRoom.id) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    };
    socket.on("connect", onConnect);
    socket.on(CHAT_MESSAGE, onMessage);
    return () => {
      socket.emit("chat:leave", activeRoom.id);
      socket.disconnect();
    };
  }, [token, activeRoom]);

  const send = async () => {
    if (!token || !activeRoom || !draft.trim() || sending) return;
    setSending(true);
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
    if (!token || !activeRoom || !file || sending) return;
    setSending(true);
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

  if (loading) {
    return <div className="dashboard-page"><p>جاري التحميل…</p></div>;
  }

  const isArchivedView = scope === "archived";

  return (
    <div className={`dashboard-page ${styles.page}`}>
      <div className={styles.layout}>
        <aside className={styles.rooms}>
          <h2 className={styles.roomsTitle}>المحادثات</h2>
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
          {rooms.length === 0 ? (
            <p className={styles.emptyRooms}>
              {isArchivedView ? "لا توجد محادثات مؤرشفة." : "لا توجد محادثات نشطة."}
            </p>
          ) : null}
          {rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              className={`${styles.roomBtn} ${activeRoom?.id === room.id ? styles.roomBtnActive : ""} ${room.type === "GLOBAL" ? styles.roomGlobal : ""}`}
              onClick={() => setActiveRoom(room)}
            >
              <strong>{room.title}</strong>
              {room.orderLabel ? <span>{room.orderLabel}</span> : null}
              {room.archivedAt ? (
                <small>أُرشفت: {new Date(room.archivedAt).toLocaleString("ar-SY")}</small>
              ) : null}
              {room.lastMessage?.body ? <small>{room.lastMessage.body}</small> : null}
            </button>
          ))}
        </aside>
        <section className={styles.thread}>
          <header className={styles.threadHeader}>
            <h2>{activeRoom?.title ?? "اختر محادثة"}</h2>
            {isArchivedView && activeRoom?.archivedAt ? (
              <p className={styles.archivedHint}>
                محادثة مؤرشفة — للقراءة فقط (أُرشفت{" "}
                {new Date(activeRoom.archivedAt).toLocaleString("ar-SY")})
              </p>
            ) : null}
          </header>
          <div className={styles.messages} ref={listRef}>
            {messages.map((m) => {
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
                  <time>{new Date(m.createdAt).toLocaleTimeString("ar-SY")}</time>
                </div>
              );
            })}
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
              <button type="button" className="btn btn--secondary" onClick={() => fileRef.current?.click()} disabled={sending || !activeRoom}>
                صورة
              </button>
              <input
                className={styles.input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="اكتب رسالة…"
                disabled={!activeRoom}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button type="button" className="btn btn--primary" onClick={() => void send()} disabled={sending || !activeRoom}>
                إرسال
              </button>
            </footer>
          ) : null}
        </section>
      </div>
    </div>
  );
}
