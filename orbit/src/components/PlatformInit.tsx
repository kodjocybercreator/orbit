"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

export default function PlatformInit() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const init = async () => {
      try {
        await StatusBar.setOverlaysWebView({ overlay: false });
      } catch {
        /* plugin unavailable */
      }
      try {
        await StatusBar.setStyle({ style: Style.Dark });
      } catch {
        /* plugin unavailable */
      }
      try {
        await StatusBar.setBackgroundColor({ color: "#0e1012" });
      } catch {
        /* unsupported on iOS */
      }
    };
    init();
  }, []);
  return null;
}
