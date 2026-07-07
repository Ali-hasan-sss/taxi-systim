import { chatService } from "./chat.service";

const CLEANUP_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.CHAT_IMAGE_CLEANUP_INTERVAL_MS ?? 60 * 60 * 1000)
);

export function startChatImageCleanupJob() {
  const run = async () => {
    try {
      const [images, voice] = await Promise.all([
        chatService.cleanupExpiredImages(),
        chatService.cleanupExpiredVoice()
      ]);
      const scanned = images.scanned + voice.scanned;
      const filesDeleted = images.filesDeleted + voice.filesDeleted;
      if (scanned > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[chat-cleanup] expired=${scanned} filesDeleted=${filesDeleted} (images=${images.scanned}, voice=${voice.scanned})`
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
