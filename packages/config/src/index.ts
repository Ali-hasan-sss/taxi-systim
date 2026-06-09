export const socketEvents = {
  NEW_ORDER: "NEW_ORDER",
  /** إسناد الطلب من المنسق — يُرسل لغرفة السائق ويُبث للتحديث */
  ORDER_ASSIGNED: "ORDER_ASSIGNED",
  /** إلغاء طلب معلق من المنسق — يزيله من قائمة السائقين */
  ORDER_PENDING_CANCELLED: "ORDER_PENDING_CANCELLED",
  /** تحديث حالة الطلب (ركوب، متعثر، إكمال، …) لتحديث قوائم المنسق */
  ORDER_STATUS_UPDATED: "ORDER_STATUS_UPDATED",
  ORDER_ACCEPTED: "ORDER_ACCEPTED",
  ORDER_STARTED: "ORDER_STARTED",
  ORDER_COMPLETED: "ORDER_COMPLETED",
  DRIVER_LOCATION_UPDATED: "DRIVER_LOCATION_UPDATED",
  DRIVER_ONLINE: "DRIVER_ONLINE",
  DRIVER_OFFLINE: "DRIVER_OFFLINE",
  /** رسالة محادثة جديدة في غرفة */
  CHAT_MESSAGE: "CHAT_MESSAGE",
  /** الطرف الآخر يكتب */
  CHAT_TYPING: "CHAT_TYPING",
  /** توقف الكتابة */
  CHAT_TYPING_STOP: "CHAT_TYPING_STOP",
  /** تحديث حالة تسليم/قراءة رسالة */
  CHAT_RECEIPT: "CHAT_RECEIPT",
  /** اتصال/انقطاع مستخدم الدردشة (chat:register) */
  CHAT_USER_PRESENCE: "CHAT_USER_PRESENCE"
} as const;

export const chatSocketEvents = {
  REGISTER: "chat:register",
  JOIN_ROOM: "chat:join",
  LEAVE_ROOM: "chat:leave",
  TYPING: "chat:typing",
  TYPING_STOP: "chat:typing-stop",
  DELIVERED: "chat:delivered",
  READ: "chat:read"
} as const;

export type ChatReceiptStatus = "sent" | "delivered" | "read";
