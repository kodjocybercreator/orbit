"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { registerUpdateAction, bootstrapNotifications } from "@/lib/notify";

/**
 * Android 15+ (targetSdk 36) enforces edge-to-edge: the deprecated
 * setOverlaysWebView(false) no longer insets the WebView, and Chromium's
 * env(safe-area-inset-top) resolves to 0 there — which let page content slide
 * under the status bar. Measure the real inset natively (StatusBar.getInfo
 * returns dp == CSS px) and expose it as --native-safe-top instead.
 */
async function applyNativeTopInset(): Promise<void> {
  const root = document.documentElement;

  // What does CSS env() already provide on this device?
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;top:0;left:0;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  const envTop = probe.offsetHeight;
  probe.remove();

  const androidMajor = Number((navigator.userAgent.match(/Android\s+(\d+)/) || [])[1] || 0);

  let nativeTop = 0;
  try {
    const info = await StatusBar.getInfo();
    nativeTop = Math.max(0, Math.round(info.height || 0));
  } catch {
    /* plugin unavailable */
  }

  // Old Android: setOverlaysWebView(false) genuinely insets the WebView, and
  // env() works where supported — only Android 15+ with a dead env() needs the
  // native value.
  const shouldPad = androidMajor >= 15 && envTop < 4 && nativeTop > 0;
  if (shouldPad) {
    root.style.setProperty("--native-safe-top", `${nativeTop}px`);
    try {
      localStorage.setItem("orbit-safe-top", String(nativeTop));
    } catch {
      /* private mode */
    }
  } else {
    root.style.removeProperty("--native-safe-top");
    try {
      localStorage.removeItem("orbit-safe-top");
    } catch {
      /* private mode */
    }
  }
}

export default function PlatformInit() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    registerUpdateAction();
    // Permission + channels + refresh all deadline reminders, every launch.
    void bootstrapNotifications();
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
      await applyNativeTopInset();
    };
    init();
  }, []);
  return null;
}
