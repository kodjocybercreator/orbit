import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";
import { db, getSettings, type Deadline } from "./db";

const ANDROID_CHANNEL = "orbit-reminders";

let channelReady = false;

export function notificationsSupported(): boolean {
  return Capacitor.isNativePlatform();
}

export async function ensurePermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display === "granted") {
      await ensureChannel();
      return true;
    }
    const req = await LocalNotifications.requestPermissions();
    if (req.display === "granted") {
      await ensureChannel();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function ensureChannel(): Promise<void> {
  if (channelReady || !Capacitor.getPlatform().match(/android/)) return;
  try {
    await LocalNotifications.createChannel({
      id: ANDROID_CHANNEL,
      name: "Deadline reminders",
      importance: 4,
      sound: "default",
      vibration: true,
      lights: true,
    });
    channelReady = true;
  } catch {
    /* older plugin versions may not support channels */
  }
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
