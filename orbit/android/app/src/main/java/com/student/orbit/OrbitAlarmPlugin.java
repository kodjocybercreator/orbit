package com.student.orbit;

import android.content.Intent;
import android.provider.AlarmClock;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridges to the phone's Clock app: create a real system alarm (rings with the
 * user's chosen alarm tone, survives Doze and app kills) and best-effort
 * dismissal by exact clock time.
 */
@CapacitorPlugin(name = "OrbitAlarm")
public class OrbitAlarmPlugin extends Plugin {

    @PluginMethod
    public void setAlarm(PluginCall call) {
        String title = call.getString("title", "Orbit focus session");
        Integer hour = call.getInt("hour");
        Integer minute = call.getInt("minute");
        if (hour == null || minute == null) {
            call.reject("hour and minute are required");
            return;
        }
        try {
            Intent intent = new Intent(AlarmClock.ACTION_SET_ALARM)
                .putExtra(AlarmClock.EXTRA_MESSAGE, title)
                .putExtra(AlarmClock.EXTRA_HOUR, hour.intValue())
                .putExtra(AlarmClock.EXTRA_MINUTES, minute.intValue())
                .putExtra(AlarmClock.EXTRA_SKIP_UI, true);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("No clock app handled the alarm: " + e.getMessage());
        }
    }

    @PluginMethod
    public void dismissAlarm(PluginCall call) {
        Integer hour = call.getInt("hour");
        Integer minute = call.getInt("minute");
        if (hour == null || minute == null) {
            call.reject("hour and minute are required");
            return;
        }
        try {
            Intent intent = new Intent(AlarmClock.ACTION_DISMISS_ALARM)
                .putExtra(AlarmClock.EXTRA_ALARM_SEARCH_MODE, AlarmClock.ALARM_SEARCH_MODE_TIME)
                .putExtra(AlarmClock.EXTRA_HOUR, hour.intValue())
                .putExtra(AlarmClock.EXTRA_MINUTES, minute.intValue());
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("dismiss failed: " + e.getMessage());
        }
    }
}
