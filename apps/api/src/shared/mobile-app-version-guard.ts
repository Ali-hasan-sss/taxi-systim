import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import {
  APP_UPDATE_REQUIRED_CODE,
  APP_UPDATE_REQUIRED_STATUS,
  evaluateMobileAppVersion,
  evaluateUnknownMobileAppVersion,
  type MobileAppKind
} from "./app-version";

function headerValue(req: Request, name: string): string {
  const raw = req.headers[name];
  if (Array.isArray(raw)) return raw[0]?.trim() ?? "";
  return typeof raw === "string" ? raw.trim() : "";
}

export function readHandshakeAppMeta(handshake: {
  auth?: unknown;
  query?: unknown;
}): { kind: MobileAppKind | null; version: string } {
  const auth =
    handshake.auth && typeof handshake.auth === "object" ? (handshake.auth as Record<string, unknown>) : {};
  const query =
    handshake.query && typeof handshake.query === "object" ? (handshake.query as Record<string, unknown>) : {};
  const kindRaw = String(auth.appKind ?? query.appKind ?? "").toLowerCase();
  const kind: MobileAppKind | null = kindRaw === "driver" || kindRaw === "coordinator" ? kindRaw : null;
  const versionRaw = auth.appVersion ?? query.appVersion ?? "";
  const version = Array.isArray(versionRaw) ? String(versionRaw[0] ?? "") : String(versionRaw);
  return { kind, version: version.trim() };
}

export function isNativeMobileUserAgent(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  if (!ua || ua.includes("mozilla")) return false;
  return ua.includes("okhttp") || ua.includes("expo") || ua.includes("cfnetwork") || ua.includes("reactnative") || ua.includes("react-native");
}

function headerAppKind(req: Request): MobileAppKind | null {
  const raw = headerValue(req, "x-app-kind").toLowerCase();
  if (raw === "driver" || raw === "coordinator") return raw;
  return null;
}

function requestPath(req: Request): string {
  const raw = (req.originalUrl || req.path || "").split("?")[0];
  return raw.replace(/^\/api(?=\/|$)/, "") || "/";
}

function isExemptPath(path: string, method: string): boolean {
  if (method === "OPTIONS") return true;
  if (path === "/public/app-config" && method === "GET") return true;
  if (path === "/public/taxi-request" && method === "POST") return true;
  return false;
}

function peekJwtRole(token: string | undefined): string | null {
  if (!token) return null;
  const payload = jwt.decode(token);
  if (!payload || typeof payload !== "object" || !("role" in payload)) return null;
  const role = (payload as { role?: unknown }).role;
  return typeof role === "string" ? role : null;
}

function roleToKind(role: string | null): MobileAppKind | null {
  if (role === "DRIVER") return "driver";
  if (role === "COORDINATOR") return "coordinator";
  return null;
}

function inferAppKind(req: Request): MobileAppKind | null {
  const fromHeader = headerAppKind(req);
  if (fromHeader) return fromHeader;

  const path = requestPath(req);
  if (path === "/auth/login" || path.startsWith("/auth/driver") || path.startsWith("/drivers")) {
    return "driver";
  }
  if (path.startsWith("/auth/coordinator")) {
    return "coordinator";
  }
  if (path.startsWith("/auth/admin") || path.startsWith("/admin") || path.startsWith("/settings") || path.startsWith("/users")) {
    return null;
  }

  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const fromAccess = roleToKind(peekJwtRole(bearer));
  if (fromAccess) return fromAccess;

  if (path === "/auth/refresh") {
    const refreshToken =
      req.body && typeof req.body === "object" && typeof (req.body as { refreshToken?: unknown }).refreshToken === "string"
        ? (req.body as { refreshToken: string }).refreshToken
        : "";
    return roleToKind(peekJwtRole(refreshToken));
  }

  return null;
}

function sendUpdateRequired(res: Response, message: string) {
  res.status(APP_UPDATE_REQUIRED_STATUS).json({
    message,
    code: APP_UPDATE_REQUIRED_CODE
  });
}

/** يقطع تطبيقات السائق/المنسق القديمة التي لا تملك شاشة التحديث */
export async function mobileAppVersionGuard(req: Request, res: Response, next: NextFunction) {
  try {
    const path = requestPath(req);
    if (isExemptPath(path, req.method)) {
      next();
      return;
    }

    const kindFromHeader = headerAppKind(req);
    const native = isNativeMobileUserAgent(headerValue(req, "user-agent"));
    if (!kindFromHeader && !native) {
      next();
      return;
    }

    const version = headerValue(req, "x-app-version");
    const kind = inferAppKind(req);
    const result = kind
      ? await evaluateMobileAppVersion(kind, version)
      : await evaluateUnknownMobileAppVersion(version);
    if (!result.ok) {
      sendUpdateRequired(res, result.message);
      return;
    }
    next();
  } catch {
    next();
  }
}
