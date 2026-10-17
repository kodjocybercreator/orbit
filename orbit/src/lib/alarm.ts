import { Capacitor, registerPlugin } from "@capacitor/core";

interface OrbitAlarmApi {
  setAlarm(options: { title: string; hour: number; minute: number }): Promise<void>;
  dismissAlarm(options: { hour: number; minute: number }): Promise<void>;
}

const NativeAlarm = registerPlugin<OrbitAlarmApi>("OrbitAlarm");

/** True on the native Android build, where the Clock-app bridge is registered. */
export function systemAlarmAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("OrbitAlarm");
}

/**
 * Arm the phone's real Clock alarm (its own ringtone, rings even if this app
 * is killed). Returns false on web or when no clock app handles the intent.
 */
export async function setSystemAlarm(title: string, when: Date): Promise<boolean> {
  if (!systemAlarmAvailable()) return false;
  try {
    await NativeAlarm.setAlarm({
      title,
      hour: when.getHours(),
      minute: when.getMinutes(),
    });
    return true;
  } catch {
    return false;
  }
}

/** Best-effort: ask the Clock app to dismiss the alarm at this clock time. */
export async function dismissSystemAlarm(when: Date): Promise<void> {
  if (!systemAlarmAvailable()) return;
  try {
    await NativeAlarm.dismissAlarm({ hour: when.getHours(), minute: when.getMinutes() });
  } catch {
    /* some clock apps open their UI instead — user can dismiss there */
  }
}
