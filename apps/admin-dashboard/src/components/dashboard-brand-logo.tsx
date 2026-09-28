"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const CACHE_KEY = "taxi_platform_branding_v2";

interface DashboardBrandLogoProps {
  className?: string;
  priority?: boolean;
}

type BrandingCache = {
  logoVersion: string | null;
  dataUrl: string | null;
  appName: string;
};

export type PlatformBrandingState = {
  ready: boolean;
  logoSrc: string | null;
  appName: string;
};

const EMPTY: PlatformBrandingState = { ready: false, logoSrc: null, appName: "" };
let current: PlatformBrandingState = EMPTY;
let syncing: Promise<void> | null = null;
const listeners = new Set<(state: PlatformBrandingState) => void>();

function readCache(): BrandingCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BrandingCache;
    if (!parsed || typeof parsed !== "object") return null;
    const dataUrl =
      typeof parsed.dataUrl === "string" && parsed.dataUrl.startsWith("data:image/") ? parsed.dataUrl : null;
    const appName = typeof parsed.appName === "string" ? parsed.appName.trim() : "";
    const logoVersion = typeof parsed.logoVersion === "string" ? parsed.logoVersion : null;
    if (!dataUrl && !appName) return null;
    return { logoVersion, dataUrl, appName };
  } catch {
    return null;
  }
}

function writeCache(cache: BrandingCache) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function emit(state: PlatformBrandingState) {
  current = state;
  listeners.forEach((listener) => listener(state));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function syncBranding(force: boolean) {
  const cached = readCache();
  if (cached) {
    emit({ ready: true, logoSrc: cached.dataUrl, appName: cached.appName });
  }

  const res = await fetch(`${API_BASE}/public/branding`, { cache: "no-store" });
  if (!res.ok) {
    if (!cached) emit({ ready: true, logoSrc: null, appName: "" });
    return;
  }
  const body = (await res.json()) as {
    appName?: string;
    logo?: { url?: string | null; version?: string | null };
  };
  const appName = typeof body.appName === "string" ? body.appName.trim() : "";
  const url = body.logo?.url ?? null;
  const version = body.logo?.version ?? null;

  if (!url || !version) {
    const next = { logoVersion: null, dataUrl: null, appName };
    try {
      writeCache(next);
    } catch {
      /* ignore */
    }
    emit({ ready: true, logoSrc: null, appName });
    return;
  }

  if (!force && cached?.logoVersion === version && cached.dataUrl) {
    const next = { logoVersion: version, dataUrl: cached.dataUrl, appName };
    try {
      writeCache(next);
    } catch {
      /* ignore */
    }
    emit({ ready: true, logoSrc: cached.dataUrl, appName });
    return;
  }

  const imageRes = await fetch(url, { cache: "force-cache" });
  if (!imageRes.ok) {
    emit({ ready: true, logoSrc: cached?.dataUrl ?? null, appName });
    return;
  }
  const dataUrl = await blobToDataUrl(await imageRes.blob());
  const next = { logoVersion: version, dataUrl, appName };
  try {
    writeCache(next);
  } catch {
    /* الصورة تبقى للجلسة الحالية إن امتلأت الذاكرة */
  }
  emit({ ready: true, logoSrc: dataUrl, appName });
}

function ensureSynced(force = false) {
  if (!force && syncing) return syncing;
  const run = syncBranding(force)
    .catch(() => {
      if (!current.ready) emit({ ready: true, logoSrc: null, appName: current.appName });
    })
    .finally(() => {
      if (syncing === run) syncing = null;
    });
  syncing = run;
  return run;
}

function subscribe(listener: (state: PlatformBrandingState) => void) {
  listeners.add(listener);
  listener(current.ready ? current : EMPTY);
  void ensureSynced(false);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyPlatformLogoChanged() {
  notifyPlatformBrandingChanged();
}

export function notifyPlatformBrandingChanged() {
  const pending = syncing ?? Promise.resolve();
  void pending.then(() => ensureSynced(true));
}

export function usePlatformBranding(): PlatformBrandingState {
  const [state, setState] = useState<PlatformBrandingState>(EMPTY);

  useEffect(() => subscribe(setState), []);

  return state;
}

export const DashboardBrandLogo = ({ className }: DashboardBrandLogoProps) => {
  const { ready, logoSrc } = usePlatformBranding();
  if (!ready || !logoSrc) {
    return <span className={className} aria-hidden />;
  }
  return <img src={logoSrc} alt="" className={className} />;
};
