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
  DRIVER_OFFLINE: "DRIVER_OFFLINE"
} as const;
