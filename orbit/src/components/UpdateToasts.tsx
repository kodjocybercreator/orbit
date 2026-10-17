"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Download, X } from "lucide-react";
import { checkForUpdate, shouldAutoCheck, recordCheck } from "@/lib/update";

type Notice =
  | { kind: "sw"; title: string; body: string }
  | { kind: "feed"; title: string; body: string; url?: string };

export default function UpdateToasts() {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // Only offer a reload when a NEW service worker replaces an existing one
    // (first-ever install does not reload the page).
    const wasControlled = Boolean(navigator.serviceWorker.controller);
    const onControllerChange = () => {
      if (!wasControlled) return;
      setNotice({
        kind: "sw",
        title: "Update ready",
        body: "A new version of Orbit was installed. Reload to switch to it.",
      });
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let cancelled = false;
    (async () => {
      if (!shouldAutoCheck()) return;
      const update = await checkForUpdate().catch(() => null);
      if (cancelled || !update) return;
      setNotice({
        kind: "feed",
        title: `Orbit v${update.version} available`,
        body: update.notes || `You have an older version installed (v${update.versionCode - 1} or earlier).`,
        url: update.url,
      });
    })();

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!notice) return null;

  const action =
    notice.kind === "sw" ? (
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="press flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
        style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
      >
        <RefreshCw size={13} />
        Reload
      </button>
    ) : notice.url ? (
      <a
        href={notice.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setNotice(null)}
        className="press flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
        style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
      >
        <Download size={13} />
        Get update
      </a>
    ) : (
      <button
        type="button"
        onClick={() => {
          recordCheck();
          setNotice(null);
        }}
        className="press flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
        style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
      >
        Got it
      </button>
    );

  return (
    <div
      role="status"
      className="fixed left-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border p-3 shadow-lg"
      style={{
        bottom: "calc(env(safe-area-inset-bottom) + 76px)",
        background: "var(--card, var(--surface))",
        borderColor: "var(--card-border)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
      }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            {notice.title}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            {notice.body}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          <button
            type="button"
            aria-label="Dismiss update notice"
            onClick={() => setNotice(null)}
            className="press rounded-lg p-2"
            style={{ color: "var(--muted)" }}
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
