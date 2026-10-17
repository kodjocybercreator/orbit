package com.student.orbit;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must run before super.onCreate — that is where the bridge loads.
        registerPlugin(OrbitAlarmPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
