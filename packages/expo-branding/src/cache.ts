import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";

export type BrandingKind = "driver" | "coordinator";

export type RemoteAsset = {
  url: string | null;
  version: string | null;
};

export type PublicBranding = {
  appName: string;
  logo: RemoteAsset;
  coordinatorBackground: RemoteAsset;
  driverBackground: RemoteAsset;
};

type StoredSlot = {
  version: string;
  filename: string;
};

type StoredBranding = {
  appName?: string;
  logo?: StoredSlot;
  background?: StoredSlot;
};

const STORAGE_PREFIX = "taxi.platformBranding.v2";

function storageKey(kind: BrandingKind) {
  return `${STORAGE_PREFIX}:${kind}`;
}

function ensureDir(): Directory | null {
  const root = Paths.document;
  if (!root?.uri) return null;
  const dir = new Directory(root, "branding");
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

function filenameFromUrl(url: string, slot: string) {
  const clean = url.split("?")[0] ?? url;
  const base = decodeURIComponent(clean.split("/").pop() ?? slot);
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "");
  return safe || `${slot}.img`;
}

async function readStored(kind: BrandingKind): Promise<StoredBranding> {
  const raw = await AsyncStorage.getItem(storageKey(kind));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as StoredBranding;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStored(kind: BrandingKind, stored: StoredBranding) {
  await AsyncStorage.setItem(storageKey(kind), JSON.stringify(stored));
}

function uriIfExists(slot: StoredSlot | undefined): string | null {
  if (!slot?.filename) return null;
  const dir = ensureDir();
  if (!dir) return null;
  const file = new File(dir, slot.filename);
  return file.exists ? file.uri : null;
}

function deleteStoredFile(filename: string | undefined) {
  if (!filename) return;
  const dir = ensureDir();
  if (!dir) return;
  const file = new File(dir, filename);
  if (!file.exists) return;
  try {
    file.delete();
  } catch {
    /* ignore */
  }
}

export async function readCachedBrandingUris(
  kind: BrandingKind
): Promise<{ logo: string | null; background: string | null; appName: string }> {
  const stored = await readStored(kind);
  return {
    logo: uriIfExists(stored.logo),
    background: uriIfExists(stored.background),
    appName: typeof stored.appName === "string" ? stored.appName.trim() : ""
  };
}

async function reconcileSlot(current: StoredSlot | undefined, remote: RemoteAsset): Promise<StoredSlot | undefined> {
  if (!remote.url || !remote.version) {
    deleteStoredFile(current?.filename);
    return undefined;
  }

  if (current?.version === remote.version) {
    const existing = uriIfExists(current);
    if (existing) return current;
  }

  const filename = filenameFromUrl(remote.url, "asset");
  const dir = ensureDir();
  if (!dir) return current;

  const destination = new File(dir, filename);
  await File.downloadFileAsync(remote.url, destination, { idempotent: true });
  if (!destination.exists) return current;

  if (current?.filename && current.filename !== filename) {
    deleteStoredFile(current.filename);
  }

  return { version: remote.version, filename };
}

function cleanupOrphans(stored: StoredBranding) {
  const dir = ensureDir();
  if (!dir) return;
  const keep = new Set([stored.logo?.filename, stored.background?.filename].filter((name): name is string => !!name));
  for (const entry of dir.list()) {
    if (!(entry instanceof File)) continue;
    if (keep.has(entry.name)) continue;
    try {
      entry.delete();
    } catch {
      /* ignore */
    }
  }
}

export async function syncBrandingCache(
  kind: BrandingKind,
  remote: PublicBranding
): Promise<{ logo: string | null; background: string | null; appName: string }> {
  const stored = await readStored(kind);
  const backgroundRemote = kind === "driver" ? remote.driverBackground : remote.coordinatorBackground;
  stored.appName = remote.appName.trim();

  try {
    const nextLogo = await reconcileSlot(stored.logo, remote.logo);
    if (nextLogo) stored.logo = nextLogo;
    else delete stored.logo;
  } catch {
    /* أبقِ النسخة المحلية إن فشل تنزيل اللوجو */
  }

  try {
    const nextBackground = await reconcileSlot(stored.background, backgroundRemote);
    if (nextBackground) stored.background = nextBackground;
    else delete stored.background;
  } catch {
    /* أبقِ الخلفية المحلية إن فشل التنزيل */
  }

  await writeStored(kind, stored);
  try {
    cleanupOrphans(stored);
  } catch {
    /* ignore */
  }

  return {
    logo: uriIfExists(stored.logo),
    background: uriIfExists(stored.background),
    appName: stored.appName
  };
}

export async function fetchPublicBranding(apiBase: string): Promise<PublicBranding | null> {
  const root = apiBase.replace(/\/+$/, "");
  const res = await fetch(`${root}/public/branding`);
  if (!res.ok) return null;
  const body = (await res.json()) as Partial<PublicBranding>;
  const asset = (value: RemoteAsset | undefined): RemoteAsset => ({
    url: typeof value?.url === "string" && value.url ? value.url : null,
    version: typeof value?.version === "string" && value.version ? value.version : null
  });
  return {
    appName: typeof body.appName === "string" ? body.appName.trim() : "",
    logo: asset(body.logo),
    coordinatorBackground: asset(body.coordinatorBackground),
    driverBackground: asset(body.driverBackground)
  };
}
