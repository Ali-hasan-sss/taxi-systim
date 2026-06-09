import { chatService } from "./chat.service";

const CLEANUP_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.CHAT_IMAGE_CLEANUP_INTERVAL_MS ?? 60 * 60 * 1000)
);

export function startChatImageCleanupJob() {
  const run = async () => {
    try {
      const result = await chatService.cleanupExpiredImages();
      if (result.scanned > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[chat-cleanup] expired=${result.scanned} filesDeleted=${result.filesDeleted}`
        );
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[chat-cleanup] failed", err);
    }
  };

  void run();
  return setInterval(() => {
    void run();
  }, CLEANUP_INTERVAL_MS);
}
