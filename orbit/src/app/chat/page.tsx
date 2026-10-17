"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getTodayEnergy, logEnergy, todayKey } from "@/lib/db";
import { askOrbit } from "@/lib/ai";
import { Send, Trash2, Zap } from "lucide-react";

const ENERGY_CHIPS = [1, 3, 5];

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [offlineIds, setOfflineIds] = useState<number[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const messages = useLiveQuery(() => db.chatMessages.orderBy("createdAt").toArray(), []) ?? [];
  const energy = useLiveQuery(() => getTodayEnergy(), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  async function quickEnergy(level: number) {
    if (busy) return;
    await logEnergy(level);
    const base = Date.now();
    await db.chatMessages.add({
      role: "user",
      text: `Energy ${level}/5 today`,
      createdAt: base,
    });
    await db.chatMessages.add({
      role: "orbit",
      text:
        level <= 2
          ? "Logged. Low battery — today's plan stays light and sleep gets protected."
          : level >= 4
          ? "Logged. Solid energy — a good day for the hard stuff."
          : "Logged. Mid energy — a balanced plan ahead.",
      createdAt: base + 1,
    });
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    setBusy(true);
    const history = messages.slice(-8).map((m) => ({ role: m.role, text: m.text }));
    const base = Date.now();
    try {
      await db.chatMessages.add({ role: "user", text: t, createdAt: base });
      const result = await askOrbit(t, history);
      const id = await db.chatMessages.add({
        role: "orbit",
        text: result.reply,
        plan: result.plan.length > 0 ? result.plan : undefined,
        tradeoff: result.tradeoff,
        createdAt: base + 1,
      });
      if (result.source === "offline") setOfflineIds((prev) => [...prev, id]);
      await db.checkIns.add({
        date: todayKey(),
        userMessage: t,
        aiReply: result.reply,
        plan: result.plan,
        tradeoff: result.tradeoff,
        createdAt: Date.now(),
      });
    } catch (e) {
      await db.chatMessages.add({
        role: "orbit",
        text: `Something went wrong: ${
          e instanceof Error ? e.message : "unknown"
        }. Check your connection or API key in Settings.`,
        createdAt: base + 1,
      });
    } finally {
      setBusy(false);
    }
  }

  async function clearChat() {
    await db.chatMessages.clear();
    setOfflineIds([]);
  }

  if (!mounted) return null;

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col">
      <header className="mb-3 flex items-start justify-between gap-3 pt-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Chat</h1>
          <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            Energy today:{" "}
            <span
              className="tnum font-semibold"
              style={{ color: energy?.energy ? "var(--accent)" : "var(--muted)" }}
            >
              {energy?.energy ? `${energy.energy}/5` : "not logged"}
            </span>
          </p>
        </div>
        <button
          onClick={clearChat}
          disabled={messages.length === 0}
          className="press flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold disabled:opacity-40"
          style={{ borderColor: "var(--card-border)", color: "var(--muted)" }}
        >
          <Trash2 size={13} /> Clear
        </button>
      </header>

      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto pb-2">
        {messages.length === 0 && (
          <div className="card space-y-4">
            <div>
              <p className="label-cap">Campus copilot</p>
              <p className="mt-2 text-sm leading-relaxed">
                Tell Orbit how you&apos;re doing, or ask for a plan. It works from your
                deadlines, budget, energy and timetable — all on this device.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => send("Plan my day")}
                className="press rounded-full px-3.5 py-2 text-xs font-semibold"
                style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
              >
                Plan my day
              </button>
              {ENERGY_CHIPS.map((level) => (
                <button
                  key={level}
                  onClick={() => quickEnergy(level)}
                  className="press flex items-center gap-1 rounded-full border px-3.5 py-2 text-xs font-semibold"
                  style={{ borderColor: "var(--card-border)", color: "var(--foreground)" }}
                >
                  <Zap size={12} style={{ color: "var(--accent)" }} />
                  Energy {level}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "ml-auto max-w-[85%]" : "max-w-[92%]"}>
            <div
              className={
                m.role === "user"
                  ? "rounded-2xl rounded-br-md px-4 py-2.5 text-sm"
                  : "card rounded-2xl rounded-bl-md px-4 py-3 text-sm"
              }
              style={
                m.role === "user"
                  ? { background: "var(--accent)", color: "var(--accent-ink)" }
                  : undefined
              }
            >
              <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
              {m.plan && m.plan.length > 0 && (
                <ol
                  className="mt-3 space-y-2.5 border-t pt-2.5"
                  style={{ borderColor: "var(--card-border)" }}
                >
                  {m.plan.map((p, j) => (
                    <li key={j} className="flex gap-2.5">
                      <span
                        className="tnum mt-px text-sm font-bold"
                        style={{ color: "var(--accent)" }}
                      >
                        {j + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-snug">{p.title}</p>
                        <p
                          className="mt-0.5 text-xs leading-relaxed"
                          style={{ color: "var(--muted)" }}
                        >
                          {p.why} · <span className="tnum">{p.minutes}m</span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {m.tradeoff && (
                <p
                  className="mt-2.5 border-t pt-2 text-xs leading-relaxed"
                  style={{ borderColor: "var(--card-border)", color: "var(--muted)" }}
                >
                  <span className="font-semibold" style={{ color: "var(--warning)" }}>
                    Trade-off{" "}
                  </span>
                  {m.tradeoff}
                </p>
              )}
              {m.id !== undefined && offlineIds.includes(m.id) && (
                <p
                  className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: "var(--muted)" }}
                >
                  Offline plan
                </p>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div
            className="card animate-pulse text-sm"
            style={{ color: "var(--muted)", background: "var(--surface)" }}
          >
            Orbit is thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2 border-t pt-3"
        style={{ borderColor: "var(--card-border)" }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Orbit anything…"
          disabled={busy}
          className="min-w-0 flex-1 rounded-2xl border px-4 py-3 text-sm outline-none disabled:opacity-60"
          style={{ background: "var(--card)", borderColor: "var(--card-border)", color: "var(--foreground)" }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          aria-label="Send"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
