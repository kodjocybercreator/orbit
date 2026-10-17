import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { db, getSettings, type Deadline } from "./db";

const ANDROID_CHANNEL = "orbit-reminders";
const FOCUS_CHANNEL = "orbit-focus";
const UPDATE_CHANNEL = "orbit-updates";
const UPDATE_NOTIF_ID = 99001;
const FOCUS_NOTIF_ID = 91001;
const UPDATE_NOTIFIED_KEY = "orbit-update-notified";

const createdChannels = new Set<string>();

export function notificationsSupported(): boolean {
  return Capacitor.isNativePlatform();
}

export async function ensurePermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display === "granted") {
      await ensureChannel(ANDROID_CHANNEL, "Deadline reminders");
      return true;
    }
    const req = await LocalNotifications.requestPermissions();
    if (req.display === "granted") {
      await ensureChannel(ANDROID_CHANNEL, "Deadline reminders");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function ensureChannel(id: string, name: string): Promise<void> {
  if (createdChannels.has(id) || !Capacitor.getPlatform().match(/android/)) return;
  try {
    await LocalNotifications.createChannel({
      id,
      name,
      importance: 5, // MAX: heads-up banner + sound even on the lock screen
      sound: "default",
      vibration: true,
      lights: true,
    });
    createdChannels.add(id);
  } catch {
    /* older plugin versions may not support channels */
  }
}

/**
 * Ask for notification permission and refresh every reminder. Runs on each app
 * launch so reminders work even if the phone rebooted or the app was reinstalled.
 */
export async function bootstrapNotifications(): Promise<void> {
  if (!notificationsSupported()) return;
  try {
    const settings = await getSettings();
    if (settings.notificationsOn === false) return;
  } catch {
    /* no settings yet — still worth asking */
  }
  const granted = await ensurePermission();
  if (!granted) return;
  await rescheduleAllReminders();
}

function scheduleId(): number {
  return Math.floor(100000 + Math.random() * 900000);
}

/** Schedule a reminder for a deadline: 1 day before and 2 hours before (if still in the future). */
export async function scheduleDeadlineReminder(d: Deadline): Promise<void> {
  if (!notificationsSupported()) return;
  if (!d.id || d.done) return;
  try {
    const settings = await getSettings();
    if (settings.notificationsOn === false) return;

    const offsets = [
      { ms: 24 * 3_600_000, title: `Due tomorrow: ${d.title}` },
      { ms: 2 * 3_600_000, title: `Due soon: ${d.title}` },
    ];

    for (const { ms, title } of offsets) {
      const at = d.dueAt - ms;
      if (at <= Date.now()) continue;
      await ensurePermission();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: scheduleId(),
            title,
            body: d.course ? `${d.course} · Orbit reminder` : "Orbit reminder",
            schedule: { at: new Date(at) },
            channelId: ANDROID_CHANNEL,
            extra: { deadlineId: d.id, kind: "deadline" },
          },
        ],
      });
    }
  } catch {
    /* scheduling is best-effort */
  }
}

export async function cancelDeadlineReminders(deadlineId: number): Promise<void> {
  if (!notificationsSupported()) return;
  try {
    const pending = await LocalNotifications.getPending();
    const ids = pending.notifications
      .filter((n) => (n.extra as { deadlineId?: number })?.deadlineId === deadlineId)
      .map((n) => n.id);
    if (ids.length) await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  } catch {
    /* best-effort */
  }
}

/** Reschedule reminders for all open deadlines (used after import / settings change). */
export async function rescheduleAllReminders(): Promise<void> {
  if (!notificationsSupported()) return;
  try {
    const pending = await LocalNotifications.getPending();
    const stale = pending.notifications.filter((n) => (n.extra as { kind?: string })?.kind === "deadline");
    if (stale.length) await LocalNotifications.cancel({ notifications: stale.map((n) => ({ id: n.id })) });
  } catch {
    /* best-effort */
  }
  const open = (await db.deadlines.toArray()).filter((d) => !d.done);
  await Promise.all(open.map((d) => scheduleDeadlineReminder(d)));
}

/**
 * Ring a notification the moment a focus session ends — scheduled via
 * AlarmManager, so it fires even when the app is closed or the phone rebooted.
 */
export async function scheduleFocusEnd(endsAt: number, label: string): Promise<void> {
  if (!notificationsSupported()) return;
  if (endsAt <= Date.now() + 800) return;
  try {
    const settings = await getSettings();
    if (settings.notificationsOn === false) return;
    const granted = await ensurePermission();
    if (!granted) return;
    await ensureChannel(FOCUS_CHANNEL, "Focus timers");
    await LocalNotifications.cancel({ notifications: [{ id: FOCUS_NOTIF_ID }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: FOCUS_NOTIF_ID,
          title: "Focus session complete",
          body: label && label !== "Focus session" ? `${label} — time's up.` : "Time's up — nice work.",
          schedule: { at: new Date(endsAt) },
          channelId: FOCUS_CHANNEL,
          extra: { kind: "focus" },
        },
      ],
    });
  } catch {
    /* best-effort */
  }
}

/** Drop a pending focus-end notification (pause / reset / new session). */
export async function cancelFocusEnd(): Promise<void> {
  if (!notificationsSupported()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: FOCUS_NOTIF_ID }] });
  } catch {
    /* best-effort */
  }
}

/**
 * Push a system notification when a newer version exists — once per
 * versionCode. Tapping it opens the download URL from the update feed
 * (or the app itself when no URL is provided).
 */
export async function notifyUpdateAvailable(update: {
  version: string;
  versionCode: number;
  notes?: string;
  url?: string;
}): Promise<void> {
  if (!notificationsSupported()) return;
  try {
    if (localStorage.getItem(UPDATE_NOTIFIED_KEY) === String(update.versionCode)) return;
  } catch {
    /* private mode — fall through and try anyway */
  }

  const granted = await ensurePermission();
  if (!granted) return;

  await ensureChannel(UPDATE_CHANNEL, "App updates");

  try {
    await ensureUpdateActionTypes();
    // Replace any previous update notification so retries never stack.
    await LocalNotifications.cancel({ notifications: [{ id: UPDATE_NOTIF_ID }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: UPDATE_NOTIF_ID,
          title: `Orbit v${update.version} is ready to update`,
          body: update.notes || "A new version of Orbit is available.",
          schedule: { at: new Date(Date.now() + 1200) },
          channelId: UPDATE_CHANNEL,
          actionTypeId: update.url ? UPDATE_ACTION_TYPE : undefined,
          extra: { kind: "update", versionCode: update.versionCode, url: update.url },
        },
      ],
    });
    try {
      localStorage.setItem(UPDATE_NOTIFIED_KEY, String(update.versionCode));
    } catch {
      /* private mode */
    }
  } catch {
    /* best-effort */
  }
}

const ACTION_GET_UPDATE = "get-update";
const UPDATE_ACTION_TYPE = "orbit-update-actions";
let actionListenerReady = false;
let actionTypesReady = false;

/** Register the "Update" button used on the update notification (once). */
async function ensureUpdateActionTypes(): Promise<void> {
  if (actionTypesReady) return;
  try {
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: UPDATE_ACTION_TYPE,
          actions: [{ id: ACTION_GET_UPDATE, title: "Update" }],
        },
      ],
    });
    actionTypesReady = true;
  } catch {
    /* best-effort — notification still shows without the action button */
  }
}

/**
 * Tapping "Update" on the notification opens the download URL straight in the
 * browser — no need to open the app first. Registered once from PlatformInit.
 */
export function registerUpdateAction(): void {
  if (!notificationsSupported() || actionListenerReady) return;
  actionListenerReady = true;
  void LocalNotifications.addListener("localNotificationActionPerformed", (notification) => {
    const extra = (notification.notification.extra || {}) as { kind?: string; url?: string };
    if (extra.kind !== "update") return;
    if (notification.actionId === ACTION_GET_UPDATE && extra.url) {
      void Browser.open({ url: extra.url }).catch(() => {
        /* no browser available */
      });
    }
  }).catch(() => {
    actionListenerReady = false;
  });
}
