"use client";

import { useEffect, useRef, useState, FormEvent, ChangeEvent } from "react";
import {
  getSettings,
  saveSettings,
  exportAllData,
  importAllData,
  clearAllData,
  type Settings,
} from "@/lib/db";
import { ensurePermission, rescheduleAllReminders, notifyUpdateAvailable } from "@/lib/notify";
import { checkForUpdate, recordCheck, setPendingUpdate, APP_VERSION } from "@/lib/update";
import type { UpdateManifest } from "@/lib/update";
import { Bell, Database, Download, KeyRound, RefreshCw, Trash2, Upload, User, Wallet } from "lucide-react";

const inputStyle = {
  background: "var(--surface)",
  borderColor: "var(--card-border)",
  color: "var(--foreground)",
};

const CURRENCY_CHOICES: { symbol: string; name: string }[] = [
  { symbol: "₵", name: "Ghana cedi" },
  { symbol: "$", name: "US dollar" },
  { symbol: "€", name: "Euro" },
  { symbol: "£", name: "British pound" },
  { symbol: "₦", name: "Nigerian naira" },
  { symbol: "₹", name: "Indian rupee" },
  { symbol: "R", name: "South African rand" },
  { symbol: "¥", name: "Japanese yen" },
];

function FieldLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span
      className="label-cap flex items-center gap-1.5"
      style={{ color: "var(--muted)" }}
    >
      {icon}
      {children}
    </span>
  );
}

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [settings, setLocal] = useState<Settings | null>(null);
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("50");
  const [currency, setCurrency] = useState("$");
  const [weekStart, setWeekStart] = useState<0 | 1>(0);
  const [apiKey, setApiKey] = useState("");
  const [notif, setNotif] = useState(true);
  const [feedUrl, setFeedUrl] = useState("");
  const [updateMsg, setUpdateMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [dataMsg, setDataMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    getSettings().then((s) => {
      setLocal(s);
      setName(s.name || "");
      setBudget(String(s.weeklyBudget));
      setCurrency(s.currency || "$");
      setWeekStart(s.weekStart ?? 0);
      setApiKey(s.groqApiKey || "");
      setNotif(s.notificationsOn !== false);
      setFeedUrl(s.updateFeedUrl || "");
    });
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    await saveSettings({
      name: name.trim() || undefined,
      weeklyBudget: parseFloat(budget) || 50,
      currency: currency.trim().slice(0, 4) || "$",
      weekStart,
      groqApiKey: apiKey.trim() || undefined,
      updateFeedUrl: feedUrl.trim() || undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function onCheckUpdate() {
    setChecking(true);
    setUpdateMsg(null);
    try {
      const trimmed = feedUrl.trim();
      if (trimmed && !/^https?:\/\//.test(trimmed)) {
        setUpdateMsg({ ok: false, text: "Feed URL must start with http:// or https://" });
        return;
      }
      if (trimmed) await saveSettings({ updateFeedUrl: trimmed });
      recordCheck();
      const update: UpdateManifest | null = await checkForUpdate(trimmed || undefined);
      if (update) {
        setPendingUpdate(update);
        void notifyUpdateAvailable(update);
        setUpdateMsg({
          ok: true,
          text: `Orbit v${update.version} is available — you have v${APP_VERSION}.`,
          url: update.url,
        });
      } else {
        setUpdateMsg({ ok: true, text: `You're on the latest version (v${APP_VERSION}).` });
      }
    } finally {
      setChecking(false);
    }
  }

  async function toggleNotif() {
    const next = !notif;
    setNotif(next);
    if (next) await ensurePermission();
    await saveSettings({ notificationsOn: next });
  }

  async function onExport() {
    try {
      const json = await exportAllData();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orbit-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDataMsg("Backup exported.");
    } catch {
      setDataMsg("Export failed. Try again.");
    }
  }

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      await importAllData(text);
      try {
        await rescheduleAllReminders();
      } catch {
        /* reminders are best-effort; import already succeeded */
      }
      const s = await getSettings();
      setLocal(s);
      setName(s.name || "");
      setBudget(String(s.weeklyBudget));
      setCurrency(s.currency || "$");
      setWeekStart(s.weekStart ?? 0);
      setApiKey(s.groqApiKey || "");
      setNotif(s.notificationsOn !== false);
      setFeedUrl(s.updateFeedUrl || "");
      setDataMsg("Backup imported.");
    } catch {
      setDataMsg("Import failed — not a valid Orbit backup file.");
    }
  }

  async function onClear() {
    await clearAllData();
    setConfirmClear(false);
    const s = await getSettings();
    setLocal(s);
    setName(s.name || "");
    setBudget(String(s.weeklyBudget));
    setCurrency(s.currency || "$");
    setWeekStart(s.weekStart ?? 0);
      setApiKey(s.groqApiKey || "");
      setNotif(s.notificationsOn !== false);
      setFeedUrl(s.updateFeedUrl || "");
      setDataMsg("All data cleared.");
  }

  if (!mounted || !settings) return null;

  return (
    <div className="space-y-4 pt-2">
      <header>
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
        <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
          Stored on this device only
        </p>
      </header>

      <form onSubmit={save} className="space-y-4">
        <section className="card space-y-4">
          <p className="label-cap">You</p>
          <label className="block space-y-1.5">
            <FieldLabel icon={<User size={13} />}>Name</FieldLabel>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={inputStyle}
            />
          </label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="block space-y-1.5">
              <FieldLabel icon={<Wallet size={13} />}>Weekly budget</FieldLabel>
              <input
                type="number"
                min="1"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="tnum w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={inputStyle}
              />
            </label>
            <label className="block space-y-1.5">
              <FieldLabel icon={<span className="text-xs font-bold">¤</span>}>Currency</FieldLabel>
              <input
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                maxLength={4}
                placeholder="$"
                className="w-20 rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={inputStyle}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="label-cap" style={{ color: "var(--muted)" }}>
              Quick pick
            </span>
            {CURRENCY_CHOICES.map(({ symbol, name }) => {
              const active = currency.trim() === symbol;
              return (
                <button
                  key={symbol}
                  type="button"
                  title={name}
                  aria-label={`${name} (${symbol})`}
                  aria-pressed={active}
                  onClick={() => setCurrency(symbol)}
                  className="press rounded-lg border px-2.5 py-1 text-xs font-semibold"
                  style={{
                    borderColor: active ? "var(--accent)" : "var(--card-border)",
                    background: active ? "var(--accent-soft)" : "transparent",
                    color: active ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {symbol}
                </button>
              );
            })}
          </div>
          <label className="block space-y-1.5">
            <FieldLabel icon={<span className="text-xs font-bold">W</span>}>Week starts</FieldLabel>
            <select
              value={weekStart}
              onChange={(e) => setWeekStart(Number(e.target.value) as 0 | 1)}
              className="w-full appearance-none rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={inputStyle}
            >
              <option value={0}>Sunday</option>
              <option value={1}>Monday</option>
            </select>
          </label>
        </section>

        <section className="card space-y-2">
          <p className="label-cap">AI</p>
          <label className="block space-y-1.5">
            <FieldLabel icon={<KeyRound size={13} />}>Groq API key</FieldLabel>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="gsk_..."
              autoComplete="off"
              className="w-full rounded-xl border px-3 py-2.5 font-mono text-sm outline-none"
              style={inputStyle}
            />
          </label>
          <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            Optional. Day plans work offline without it. Get a free key at
            console.groq.com — it&apos;s stored only on this device and used only for AI
            calls.
          </p>
        </section>

        <button
          type="submit"
          className="press w-full rounded-xl py-3 text-sm font-semibold"
          style={{ background: saved ? "var(--success)" : "var(--accent)", color: "var(--accent-ink)" }}
        >
          {saved ? "Saved ✓" : "Save settings"}
        </button>
      </form>

      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Bell size={14} style={{ color: "var(--accent)" }} />
              Deadline reminders
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              Local notifications a day and two hours before a task is due.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={notif}
            onClick={toggleNotif}
            className="press relative h-7 w-12 shrink-0 rounded-full border"
            style={{
              background: notif ? "var(--accent)" : "var(--surface)",
              borderColor: notif ? "var(--accent)" : "var(--card-border)",
            }}
          >
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full transition-all duration-200"
              style={{
                left: notif ? 24 : 4,
                background: notif ? "var(--accent-ink)" : "var(--muted)",
              }}
            />
          </button>
        </div>
      </section>

      <section className="card space-y-3">
        <p className="label-cap flex items-center gap-1.5">
          <RefreshCw size={13} /> Updates
        </p>
        <label className="block space-y-1.5">
          <FieldLabel icon={<Download size={13} />}>Update feed URL (optional)</FieldLabel>
          <input
            type="url"
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="https://example.com/orbit-version.json"
            autoComplete="off"
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={inputStyle}
          />
        </label>
        <button
          type="button"
          onClick={onCheckUpdate}
          disabled={checking}
          className="press w-full rounded-xl border py-2.5 text-xs font-semibold disabled:opacity-60"
          style={{ borderColor: "var(--card-border)", color: "var(--foreground)" }}
        >
          {checking ? "Checking…" : "Check for updates"}
        </button>
        {updateMsg && (
          <div className="space-y-1.5 text-center">
            <p className="text-xs font-semibold" style={{ color: updateMsg.ok ? "var(--success)" : "var(--danger)" }}>
              {updateMsg.text}
            </p>
            {updateMsg.ok && updateMsg.url && (
              <a
                href={updateMsg.url}
                target="_blank"
                rel="noopener noreferrer"
                className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
                style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
              >
                <Download size={13} />
                Get update
              </a>
            )}
          </div>
        )}
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          Web installs update themselves automatically. APK installs check the default Orbit feed
          once a day and notify you when a new release ships — point the URL above at your own
          orbit-version.json to use a custom feed instead.
        </p>
      </section>

      <section className="card space-y-3">
        <p className="label-cap flex items-center gap-1.5">
          <Database size={13} /> Data
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onExport}
            className="press flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-semibold"
            style={{ borderColor: "var(--card-border)", color: "var(--foreground)" }}
          >
            <Download size={14} style={{ color: "var(--accent)" }} />
            Export backup
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="press flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-semibold"
            style={{ borderColor: "var(--card-border)", color: "var(--foreground)" }}
          >
            <Upload size={14} style={{ color: "var(--accent)" }} />
            Import backup
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onImport}
        />
        {confirmClear ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClear}
              className="press flex-1 rounded-xl py-2.5 text-xs font-semibold"
              style={{ background: "var(--danger)", color: "var(--accent-ink)" }}
            >
              Confirm clear
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="press rounded-xl border px-4 py-2.5 text-xs font-semibold"
              style={{ borderColor: "var(--card-border)", color: "var(--muted)" }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="press flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-semibold"
            style={{ borderColor: "var(--card-border)", color: "var(--danger)" }}
          >
            <Trash2 size={14} />
            Clear all data
          </button>
        )}
        {dataMsg && (
          <p className="text-center text-xs font-semibold" style={{ color: "var(--success)" }}>
            {dataMsg}
          </p>
        )}
      </section>

      <p className="pb-2 text-center text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
        Orbit v{APP_VERSION} · Local-first · data never leaves this device except AI calls
      </p>
    </div>
  );
}
