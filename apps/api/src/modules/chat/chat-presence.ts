const onlineUsers = new Map<string, number>();

/** @returns true=became online, false=became offline, null=no change in status */
export function setChatUserConnected(userId: string, connected: boolean): boolean | null {
  const count = onlineUsers.get(userId) ?? 0;
  if (connected) {
    onlineUsers.set(userId, count + 1);
    return count === 0 ? true : null;
  }
  if (count <= 1) {
    onlineUsers.delete(userId);
    return count > 0 ? false : null;
  }
  onlineUsers.set(userId, count - 1);
  return null;
}

export function isChatUserOnline(userId: string): boolean {
  return (onlineUsers.get(userId) ?? 0) > 0;
}
