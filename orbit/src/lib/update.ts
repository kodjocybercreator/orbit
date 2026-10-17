import { getSettings } from "./db";

export const APP_VERSION = "1.2";
export const APP_VERSION_CODE = 4;

export interface UpdateManifest {
  version: string;
  versionCode: number;
  notes?: string;
  url?: string;
}

const CHECK_KEY = "orbit-last-update-check";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Feed URL: custom one from Settings, else the site's own version file. */
export async function resolveFeedUrl(): Promise<string | undefined> {
  const settings = await getSettings();
  if (settings.updateFeedUrl) return settings.updateFeedUrl;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/orbit-version.json`;
  }
  return undefined;
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
