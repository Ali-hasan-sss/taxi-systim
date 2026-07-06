import "dotenv/config";
import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { Server } from "socket.io";
import { apiRouter } from "./routes";
import { buildSwaggerSpec } from "./swagger";
import { errorMiddleware } from "./shared/error-middleware";
import { initSocket } from "./socket";
import { generalApiRateLimit } from "./shared/rate-limit";
import { startChatImageCleanupJob } from "./modules/chat/chat-cleanup";
import { chatService } from "./modules/chat/chat.service";
import { authService } from "./modules/auth/auth.service";

const app = express();
/** يمنع ETag وبالتالي 304 بدون جسم — عملاء الجوال (OkHttp) يكسرون JSON على 304 */
app.set("etag", false);
// عند العمل خلف Nginx على الـ VPS نحتاج IP الحقيقي لتعمل قيود المعدل بشكل صحيح.
app.set("trust proxy", 1);
app.use(helmet());
// طلب المستخدم: السماح بجميع الأصول مؤقتًا لتجاوز مشاكل CORS على الويب والتطبيق.
app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: "*" }));
app.use(express.json());
app.use(morgan("combined"));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  next();
});
app.use("/api", generalApiRateLimit);
app.use("/api", apiRouter);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(buildSwaggerSpec()));
app.use(errorMiddleware);

const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.set("io", io);
initSocket(io);

const port = Number(process.env.API_PORT ?? 4000);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API running on ${port}`);
  void chatService.ensureGlobalRoom();
  startChatImageCleanupJob();
  void authService.extendExistingRefreshTokensForPermanentSessions().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Failed to extend refresh tokens for permanent sessions", error);
  });
  void chatService.archiveRoomsForCompletedOrders().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Failed to archive chat rooms for completed orders", error);
  });
});

process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.error("[unhandledRejection]", reason);
});
