import { getSettings } from "./db";

export const APP_VERSION = "1.7";
export const APP_VERSION_CODE = 9;

/** Default update feed (GitHub raw) — works from the APK and the website alike.
 *  Overridable in Settings → Updates. */
export const DEFAULT_FEED_URL =
  "https://raw.githubusercontent.com/kodjocybercreator/orbit/main/orbit/public/orbit-version.json";

export interface UpdateManifest {
  version: string;
  versionCode: number;
  notes?: string;
  url?: string;
}

const CHECK_KEY = "orbit-last-update-check";
// Check on launch and whenever the app resumes (min 1h apart).
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const PENDING_KEY = "orbit-pending-update";

/** Remember a discovered update so the banner reappears on every app open
 *  (this is what the update notification deep-links into). */
export function setPendingUpdate(manifest: UpdateManifest): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(manifest));
  } catch {
    /* private mode */
  }
}

export function getPendingUpdate(): UpdateManifest | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw);
    if (m && typeof m.version === "string" && Number.isFinite(m.versionCode)) return m as UpdateManifest;
    return null;
  } catch {
    return null;
  }
}

/** Drop the pending banner once the app itself is that new version (after an update). */
export function clearPendingIfCurrent(): UpdateManifest | null {
  const pending = getPendingUpdate();
  if (pending && pending.versionCode <= APP_VERSION_CODE) {
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {
      /* private mode */
    }
    return null;
  }
  return pending;
}

/** Feed URL: custom one from Settings, else the Orbit default GitHub feed. */
export async function resolveFeedUrl(): Promise<string | undefined> {
  const settings = await getSettings();
  return settings.updateFeedUrl || DEFAULT_FEED_URL;
}

/** Fetch and validate the update manifest. Returns null when unavailable or invalid. */
export async function fetchUpdateManifest(feedUrl: string): Promise<UpdateManifest | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(feedUrl, { cache: "no-store", signal: controller.signal });
      if (!res.ok) return null;
      const data = await res.json();
      if (
        data &&
        typeof data === "object" &&
        typeof data.version === "string" &&
        Number.isFinite(data.versionCode)
      ) {
        return {
          version: data.version,
          versionCode: data.versionCode,
          notes: typeof data.notes === "string" ? data.notes : undefined,
          url: typeof data.url === "string" && /^https?:\/\//.test(data.url) ? data.url : undefined,
        };
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/** Returns the manifest when a strictly newer version exists. */
export async function checkForUpdate(feedUrl?: string): Promise<UpdateManifest | null> {
  const url = feedUrl ?? (await resolveFeedUrl());
  if (!url) return null;
  const manifest = await fetchUpdateManifest(url);
  if (manifest && manifest.versionCode > APP_VERSION_CODE) return manifest;
  return null;
}

/** True when the 24h auto-check is due (and records that a check happened). */
export function shouldAutoCheck(): boolean {
  try {
    const last = Number(localStorage.getItem(CHECK_KEY) || 0);
    if (Date.now() - last < CHECK_INTERVAL_MS) return false;
    localStorage.setItem(CHECK_KEY, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

/** Mark a check as performed (used by the manual Settings button so auto-check doesn't double-fire). */
export function recordCheck(): void {
  try {
    localStorage.setItem(CHECK_KEY, String(Date.now()));
  } catch {
    /* private mode etc. */
  }
}
