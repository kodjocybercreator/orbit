"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  getSettings,
  getBudgetState,
  getUpcomingDeadlines,
  getTodayEnergy,
  getNextClass,
  greeting,
  formatDue,
  formatMinutes,
  todayKey,
  type Settings,
  type Deadline,
  type PlanItem,
} from "@/lib/db";
import { planDayOffline } from "@/lib/planner";
import { Clock3, Timer, Wallet, Zap, ChevronRight } from "lucide-react";

function DueBadge({ dueAt }: { dueAt: number }) {
  const urgent = dueAt - Date.now() < 86_400_000;
  return (
    <span
      className="tnum shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold"
      style={
        urgent
          ? { color: "var(--danger)", background: "var(--danger-soft)" }
          : { color: "var(--accent)", background: "var(--accent-soft)" }
      }
    >
      {formatDue(dueAt)}
    </span>
  );
}

export default function Home() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [mounted, setMounted] = useState(false);
  const [planning, setPlanning] = useState(false);

  useEffect(() => {
    setMounted(true);
    getSettings().then(setSettings);
  }, []);

  const energy = useLiveQuery(() => getTodayEnergy(), []);
  const budget = useLiveQuery(() => getBudgetState(), []);
  const deadlines = useLiveQuery(() => getUpcomingDeadlines(7), []);
  const nextClass = useLiveQuery(() => getNextClass(), []);
  const lastCheckIn = useLiveQuery(async () => {
    const recent = await db.checkIns.orderBy("createdAt").reverse().limit(12).toArray();
    const key = todayKey();
    return recent.find((c) => c.date === key && Array.isArray(c.plan) && c.plan.length > 0);
  }, []);

  if (!mounted) return null;

  const name = settings?.name;
  const energyVal = energy?.energy;
  const currency = budget?.currency || "$";
  const budgetLeft = budget?.left;
  const topDeadlines = (deadlines || []).slice(0, 3);
  const plan: PlanItem[] = lastCheckIn?.plan ?? [];
  const current = nextClass?.current;
  const upcoming = nextClass?.next;

  async function planNow() {
    setPlanning(true);
    try {
      const result = await planDayOffline();
      await db.checkIns.add({
        date: todayKey(),
        userMessage: "Plan my day",
        aiReply: "Here's your plan, built on this device.",
        plan: result.items,
        tradeoff: result.tradeoff,
        createdAt: Date.now(),
      });
    } finally {
      setPlanning(false);
    }
  }

  return (
    <div className="space-y-6 pt-2">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {greeting()}
          </p>
          <h1 className="mt-0.5 text-[28px] font-bold leading-tight tracking-tight text-balance">
            {name || "Orbit"}
          </h1>
        </div>
        <Link prefetch={false}
          href="/chat"
          className="press flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border"
          style={{
            borderColor: energyVal ? "var(--accent)" : "var(--card-border)",
            background: "var(--accent-soft)",
          }}
          aria-label="Log energy in chat"
        >
          <span
            className="tnum text-lg font-bold leading-none"
            style={{ color: energyVal ? "var(--accent)" : "var(--muted)" }}
          >
            {energyVal ?? "—"}
          </span>
          {energyVal ? (
            <span className="mt-0.5 text-[10px] font-semibold" style={{ color: "var(--muted)" }}>
              of 5
            </span>
          ) : null}
        </Link>
      </header>

      {(current || upcoming) && (
        <div
          className="card flex items-center gap-3 py-3.5"
          style={{ borderLeft: "3px solid var(--accent)" }}
        >
          <Clock3 size={18} className="shrink-0" style={{ color: "var(--accent)" }} />
          <div className="min-w-0 flex-1">
            <p className="label-cap">{current ? "In class" : "Next up"}</p>
            <p className="mt-0.5 truncate text-sm font-semibold">
              {current ? current.name : upcoming?.name}
            </p>
          </div>
          <span
            className="tnum shrink-0 text-xs font-semibold"
            style={{ color: "var(--accent)" }}
          >
            {current
              ? `until ${formatMinutes(current.endMin)}`
              : `at ${formatMinutes(upcoming!.startMin)}`}
          </span>
        </div>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="label-cap">Today&apos;s 3 moves</h2>
          {plan.length > 0 && (
            <Link prefetch={false}
              href="/chat"
              className="press flex items-center text-xs font-semibold"
              style={{ color: "var(--accent)" }}
            >
              Check in <ChevronRight size={13} />
            </Link>
          )}
        </div>

        {plan.length === 0 ? (
          <div className="card">
            <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              No plan yet. Orbit can build one right now from your deadlines, energy and
              budget — entirely on this device, no account needed.
            </p>
            <button
              onClick={planNow}
              disabled={planning}
              className="press mt-4 w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-60"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              {planning ? "Planning…" : "Plan my day"}
            </button>
            <Link prefetch={false}
              href="/chat"
              className="press mt-2 block py-2 text-center text-xs font-medium"
              style={{ color: "var(--muted)" }}
            >
              Or ask Orbit in chat
            </Link>
          </div>
        ) : (
          <div className="card overflow-hidden p-0">
            <ol>
              {plan.slice(0, 3).map((item, i) => (
                <li
                  key={i}
                  className={`flex gap-3 px-4 py-3.5 ${i > 0 ? "border-t" : ""}`}
                  style={{ borderColor: "var(--card-border)" }}
                >
                  <span
                    className="tnum w-5 shrink-0 text-xl font-bold leading-none"
                    style={{ color: "var(--accent)" }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug">{item.title}</p>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                      {item.why} · <span className="tnum">{item.minutes}m</span>
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            {lastCheckIn?.tradeoff && (
              <div
                className="border-t px-4 py-3"
                style={{ borderColor: "var(--card-border)", background: "var(--accent-soft)" }}
              >
                <p className="label-cap" style={{ color: "var(--accent)" }}>
                  Trade-off
                </p>
                <p className="mt-1 text-xs leading-relaxed">{lastCheckIn.tradeoff}</p>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Link prefetch={false} href="/chat" className="card press flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="label-cap">Energy</span>
            <Zap size={14} style={{ color: "var(--accent)" }} />
          </div>
          <p className="tnum mt-1 text-2xl font-bold">
            {energyVal ? (
              `${energyVal}/5`
            ) : (
              <span className="text-base font-semibold" style={{ color: "var(--muted)" }}>
                Tap to log
              </span>
            )}
          </p>
          <p className="text-[11px]" style={{ color: "var(--muted)" }}>
            {energyVal ? "Logged today" : "How are you holding up"}
          </p>
        </Link>

        <Link prefetch={false} href="/budget" className="card press flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="label-cap">Budget left</span>
            <Wallet
              size={14}
              style={{ color: (budgetLeft ?? 0) < 0 ? "var(--danger)" : "var(--success)" }}
            />
          </div>
          <p
            className="tnum mt-1 text-2xl font-bold"
            style={{ color: (budgetLeft ?? 0) < 0 ? "var(--danger)" : "var(--foreground)" }}
          >
            {budgetLeft !== undefined ? `${currency}${budgetLeft.toFixed(2)}` : "—"}
          </p>
          <p className="tnum text-[11px]" style={{ color: "var(--muted)" }}>
            of {currency}
            {settings?.weeklyBudget ?? 50} this week
          </p>
        </Link>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="label-cap">Coming up</h2>
          <Link prefetch={false}
            href="/deadlines"
            className="press flex items-center text-xs font-semibold"
            style={{ color: "var(--accent)" }}
          >
            All <ChevronRight size={13} />
          </Link>
        </div>
        {topDeadlines.length === 0 ? (
          <div className="card-flat flex items-center justify-between py-3.5">
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Nothing due in the next 7 days.
            </p>
            <Link prefetch={false}
              href="/deadlines"
              className="press text-xs font-semibold"
              style={{ color: "var(--accent)" }}
            >
              Add task
            </Link>
          </div>
        ) : (
          <ul className="card overflow-hidden p-0">
            {topDeadlines.map((d: Deadline, i) => (
              <li
                key={d.id}
                className={`flex items-center gap-3 px-4 py-3.5 ${i > 0 ? "border-t" : ""}`}
                style={{ borderColor: "var(--card-border)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{d.title}</p>
                  {d.course && (
                    <p className="mt-0.5 truncate text-xs" style={{ color: "var(--muted)" }}>
                      {d.course}
                    </p>
                  )}
                </div>
                <DueBadge dueAt={d.dueAt} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link prefetch={false} href="/focus" className="card-flat press flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--accent-soft)" }}
        >
          <Timer size={16} style={{ color: "var(--accent)" }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Focus</p>
          <p className="text-[11px]" style={{ color: "var(--muted)" }}>
            Start a timed session on a task
          </p>
        </div>
        <ChevronRight size={16} style={{ color: "var(--muted)" }} />
      </Link>
    </div>
  );
}
