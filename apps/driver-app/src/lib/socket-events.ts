/** يطابق @taxi/config — تجنّب اعتماد الحزمة في ميترو إن لزم */
export const SOCKET_EVENTS = {
  NEW_ORDER: "NEW_ORDER",
  ORDER_ASSIGNED: "ORDER_ASSIGNED",
  ORDER_PENDING_CANCELLED: "ORDER_PENDING_CANCELLED",
  ORDER_STATUS_UPDATED: "ORDER_STATUS_UPDATED"
} as const;
