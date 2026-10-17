"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getTodayEnergy, logEnergy, todayKey } from "@/lib/db";
import { askOrbit } from "@/lib/ai";
import { Loader2, Send, Trash2, Zap } from "lucide-react";

const ENERGY_CHIPS = [1, 3, 5];

type HistItem = { role: "user" | "orbit"; text: string };
type QueuedAsk = { t: string; history: HistItem[]; base: number };

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [offlineIds, setOfflineIds] = useState<number[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Synchronous guards: React state lags a tick, which let double-taps race.
  const busyRef = useRef(false);
  const queueRef = useRef<QueuedAsk[]>([]);
  const lastTsRef = useRef(0);
  const prefillUsedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // The Money page hands off a pre-written question via localStorage.
  useEffect(() => {
    if (!mounted || prefillUsedRef.current) return;
    prefillUsedRef.current = true;
    let pre: string | null = null;
    try {
      pre = localStorage.getItem("orbit-prefill");
      localStorage.removeItem("orbit-prefill");
    } catch {
      /* private mode */
    }
    if (pre && pre.trim()) send(pre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Last 150 messages only — the full table made long chats janky over time.
  const messages =
    useLiveQuery(
      () =>
        db.chatMessages
          .orderBy("createdAt")
          .reverse()
          .limit(150)
          .toArray()
          .then((rows) => rows.reverse()),
      []
    ) ?? [];
  const energy = useLiveQuery(() => getTodayEnergy(), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  function stamp(): number {
    const ts = Math.max(Date.now(), lastTsRef.current + 1);
    lastTsRef.current = ts;
    return ts;
  }

  async function quickEnergy(level: number) {
    if (busyRef.current) return;
    await logEnergy(level);
    const base = stamp();
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

  /** One queued ask, start to finish. Reply lands right after its question. */
  async function answerOne({ t, history, base }: QueuedAsk): Promise<void> {
    try {
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
      await db.chatMessages
        .add({
          role: "orbit",
          text: `Something went wrong: ${
            e instanceof Error ? e.message : "unknown"
          }. Check your connection or API key in Settings.`,
          createdAt: base + 1,
        })
        .catch(() => {});
    }
  }

  /** Drain the queue serially; one runner max, exit always resets busy. */
  async function processQueue(): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      let item = queueRef.current.shift();
      while (item) {
        await answerOne(item);
        item = queueRef.current.shift();
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  /** Every tap is honored: the message shows instantly and is sent after the current reply. */
  function send(text: string) {
    const t = text.trim();
    if (!t) return;
    const history = messages.slice(-8).map((m) => ({ role: m.role, text: m.text }));
    const base = stamp();
    setInput("");
    void db.chatMessages.add({ role: "user", text: t, createdAt: base }).catch(() => {});
    queueRef.current.push({ t, history, base });
    void processQueue();
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
          placeholder={busy ? "Keep typing — tap send to queue it…" : "Ask Orbit anything…"}
          className="min-w-0 flex-1 rounded-2xl border px-4 py-3 text-sm outline-none"
          style={{ background: "var(--card)", borderColor: "var(--card-border)", color: "var(--foreground)" }}
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          aria-label={busy ? "Queue message" : "Send"}
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </form>
    </div>
  );
}
