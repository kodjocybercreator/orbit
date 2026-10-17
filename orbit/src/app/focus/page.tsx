"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, formatDue, getOpenDeadlines } from "@/lib/db";
import { scheduleFocusEnd, cancelFocusEnd } from "@/lib/notify";
import { systemAlarmAvailable, setSystemAlarm, dismissSystemAlarm } from "@/lib/alarm";
import { AlarmClock, CircleCheck, Link2, Pause, Play, RotateCcw, Timer } from "lucide-react";

const DURATIONS = [25, 45, 50];
const RADIUS = 108;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Survives app kills: a running session is restored from endsAt. */
const FOCUS_STATE_KEY = "orbit-focus-state-v1";

interface FocusPersist {
  duration?: number;
  secondsLeft?: number;
  running?: boolean;
  endsAt?: number | null;
  linkedId?: string;
  finished?: boolean;
  loggedEndsAt?: number | null;
  armedAt?: number | null;
  alarmOn?: boolean;
}

async function focusLabel(linkId: string): Promise<string> {
  if (!linkId) return "";
  try {
    const d = await db.deadlines.get(Number(linkId));
    return d?.title ?? "";
  } catch {
    return "";
  }
}

async function logFocusSession(endTs: number, minutes: number, linkId: string): Promise<void> {
  try {
    const d = linkId ? await db.deadlines.get(Number(linkId)) : undefined;
    await db.focusSessions.add({
      deadlineId: d?.id,
      label: d?.title ?? "Focus session",
      minutes,
      completed: true,
      createdAt: endTs,
    });
  } catch {
    /* history is best-effort */
  }
}

const FIELD: CSSProperties = {
  background: "var(--background)",
  borderColor: "var(--card-border)",
  color: "var(--foreground)",
};

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function relDay(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function FocusPage() {
  const [mounted, setMounted] = useState(false);
  const [duration, setDuration] = useState(DURATIONS[0]);
  const [secondsLeft, setSecondsLeft] = useState(DURATIONS[0] * 60);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [linkedId, setLinkedId] = useState("");
  const [alarmOn, setAlarmOn] = useState(false);
  const [alarmCapable, setAlarmCapable] = useState(false);
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const savedRef = useRef(false);
  const restoredRef = useRef(false);

  useEffect(() => setMounted(true), []);

  const deadlines = useLiveQuery(() => getOpenDeadlines(), []);
  const sessions = useLiveQuery(
    () => db.focusSessions.orderBy("createdAt").reverse().limit(12).toArray(),
    []
  );

  const endsAtRef = useRef<number | null>(null);

  // Restore a session that was running when the app was killed / swiped away.
  useEffect(() => {
    let saved: FocusPersist | null = null;
    try {
      const raw = localStorage.getItem(FOCUS_STATE_KEY);
      if (raw) saved = JSON.parse(raw) as FocusPersist;
    } catch {
      saved = null;
    }
    if (saved) {
      if (typeof saved.duration === "number" && DURATIONS.includes(saved.duration)) {
        setDuration(saved.duration);
      }
      if (saved.linkedId) setLinkedId(saved.linkedId);
      setAlarmOn(Boolean(saved.alarmOn));
      if (saved.running && saved.endsAt) {
        const left = Math.max(0, Math.round((saved.endsAt - Date.now()) / 1000));
        if (left > 0) {
          // Session still ticking — resume where it left off.
          endsAtRef.current = saved.endsAt;
          setSecondsLeft(left);
          setRunning(true);
          setFinished(false);
          savedRef.current = false;
          setArmedAt(saved.armedAt ?? null);
          void focusLabel(saved.linkedId ?? "").then((label) =>
            scheduleFocusEnd(saved.endsAt as number, label)
          );
        } else {
          // Expired while the app was closed: show done, log once.
          endsAtRef.current = saved.endsAt;
          setSecondsLeft(0);
          setRunning(false);
          setFinished(true);
          setArmedAt(null); // the Clock alarm rang with it — spent
          const alreadyLogged = saved.loggedEndsAt === saved.endsAt;
          savedRef.current = alreadyLogged;
          if (!alreadyLogged) {
            void logFocusSession(
              saved.endsAt,
              saved.duration ?? DURATIONS[0],
              saved.linkedId ?? ""
            );
          }
        }
      } else {
        setRunning(false);
        setFinished(Boolean(saved.finished));
        if (typeof saved.secondsLeft === "number" && saved.secondsLeft >= 0) {
          setSecondsLeft(saved.secondsLeft);
        }
        setArmedAt(saved.armedAt ?? null);
        savedRef.current = Boolean(saved.finished);
      }
    }
    restoredRef.current = true;
    setAlarmCapable(systemAlarmAvailable());
  }, []);

  // Persist state (skip before restore so defaults never clobber stored state).
  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      localStorage.setItem(
        FOCUS_STATE_KEY,
        JSON.stringify({
          duration,
          secondsLeft: running ? 0 : secondsLeft, // running sessions restore from endsAt
          running,
          endsAt: endsAtRef.current,
          linkedId,
          finished,
          loggedEndsAt: finished ? endsAtRef.current ?? null : null,
          armedAt,
          alarmOn,
        })
      );
    } catch {
      /* private mode */
    }
  }, [duration, secondsLeft, running, finished, linkedId, armedAt, alarmOn]);

  useEffect(() => {
    if (!running) return;
    const recompute = () => {
      if (endsAtRef.current === null) return;
      const left = Math.max(0, Math.round((endsAtRef.current - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    const id = window.setInterval(recompute, 500);
    const onVisible = () => {
      if (!document.hidden) recompute();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [running]);

  useEffect(() => {
    if (!running || secondsLeft > 0 || savedRef.current) return;
    savedRef.current = true;
    setRunning(false);
    setFinished(true);
    setArmedAt(null); // the Clock alarm rang with the session — spent
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([140, 70, 140]);
    }
    void logFocusSession(endsAtRef.current ?? Date.now(), duration, linkedId);
  }, [running, secondsLeft, linkedId, duration]);

  /** Schedule the end-of-session notification; optionally arm the Clock alarm. */
  async function armFeedback(): Promise<void> {
    const end = endsAtRef.current;
    if (!end) return;
    const label = await focusLabel(linkedId);
    await scheduleFocusEnd(end, label);
    if (!alarmOn) return;
    if (armedAt && Math.abs(armedAt - end) > 60_000) {
      // Session was paused/resumed — move the alarm to the new end time.
      await dismissSystemAlarm(new Date(armedAt));
      setArmedAt(null);
    }
    if (!armedAt) {
      const ok = await setSystemAlarm(`Orbit: ${label || "focus session"} ends`, new Date(end));
      if (ok) setArmedAt(end);
    }
  }

  function toggleAlarm(): void {
    const next = !alarmOn;
    setAlarmOn(next);
    if (!next && armedAt) {
      void dismissSystemAlarm(new Date(armedAt));
      setArmedAt(null);
    } else if (next && endsAtRef.current && !finished) {
      const end = endsAtRef.current;
      void focusLabel(linkedId).then(async (label) => {
        const ok = await setSystemAlarm(`Orbit: ${label || "focus session"} ends`, new Date(end));
        if (ok) setArmedAt(end);
      });
    }
  }

  function cancelArmedAlarm(): void {
    if (!armedAt) return;
    void dismissSystemAlarm(new Date(armedAt));
    setArmedAt(null);
  }

  function startPause() {
    if (finished || secondsLeft === 0) {
      savedRef.current = false;
      setFinished(false);
      setSecondsLeft(duration * 60);
      endsAtRef.current = Date.now() + duration * 60 * 1000;
      setRunning(true);
      void armFeedback();
      return;
    }
    if (running) {
      endsAtRef.current = null;
      void cancelFocusEnd();
      // Phone alarm stays armed (the Clock alarm is its own commitment);
      // the cancel button below lets the user drop it when stopping early.
    } else {
      endsAtRef.current = Date.now() + secondsLeft * 1000;
      void armFeedback();
    }
    setRunning((r) => !r);
  }

  function reset() {
    savedRef.current = false;
    endsAtRef.current = null;
    void cancelFocusEnd();
    setFinished(false);
    setRunning(false);
    setSecondsLeft(duration * 60);
  }

  function pickDuration(m: number) {
    savedRef.current = false;
    endsAtRef.current = null;
    void cancelFocusEnd();
    setDuration(m);
    setFinished(false);
    setRunning(false);
    setSecondsLeft(m * 60);
  }

  if (!mounted) return null;

  const list = sessions || [];
  const initial = duration * 60;
  const progress = initial > 0 ? secondsLeft / initial : 0;
  const linked = (deadlines || []).find((d) => d.id === Number(linkedId));
  const status = finished ? "Complete" : running ? "Focusing" : "Ready";
  const sub = finished
    ? "Session logged"
    : linked
      ? linked.title
      : `${duration} minutes`;
  const startLabel = running
    ? "Pause"
    : finished || secondsLeft === 0
      ? "Start again"
      : secondsLeft < initial
        ? "Resume"
        : "Start";

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const todaySessions = list.filter((s) => s.createdAt >= dayStart.getTime());
  const todayMinutes = todaySessions.reduce((sum, s) => sum + s.minutes, 0);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Focus</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
          Timed sessions that log themselves
        </p>
      </header>

      <section className="card space-y-5 py-6">
        <div className="relative mx-auto h-56 w-56">
          <svg viewBox="0 0 240 240" className="h-full w-full" role="img" aria-label="Time remaining">
            <circle
              cx="120"
              cy="120"
              r={RADIUS}
              fill="none"
              stroke="var(--card-border)"
              strokeWidth="14"
            />
            <circle
              cx="120"
              cy="120"
              r={RADIUS}
              fill="none"
              stroke={finished ? "var(--success)" : "var(--accent)"}
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
              transform="rotate(-90 120 120)"
              style={{ transition: running ? "stroke-dashoffset 1s linear" : "none" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
            <span className="label-cap">{status}</span>
            <span className="tnum text-[46px] font-bold leading-none tracking-tight">
              {formatClock(secondsLeft)}
            </span>
            <span
              className="max-w-full truncate text-[11px]"
              style={{ color: "var(--muted)" }}
            >
              {sub}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2">
          {DURATIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => pickDuration(m)}
              disabled={running}
              className="press tnum rounded-full border px-4 py-1.5 text-xs font-semibold disabled:opacity-40"
              style={
                duration === m
                  ? {
                      background: "var(--accent)",
                      borderColor: "var(--accent)",
                      color: "var(--accent-ink)",
                    }
                  : { borderColor: "var(--card-border)", color: "var(--muted)" }
              }
            >
              {m} min
            </button>
          ))}
        </div>

        {alarmCapable && (
          <div className="space-y-2">
            <button
              type="button"
              role="switch"
              aria-checked={alarmOn}
              onClick={toggleAlarm}
              className="press flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5"
              style={{
                background: "var(--surface)",
                borderColor: alarmOn ? "var(--accent)" : "var(--card-border)",
              }}
            >
              <span className="flex items-center gap-2 text-xs font-semibold">
                <AlarmClock size={14} style={{ color: "var(--accent)" }} />
                Ring my phone alarm when done
              </span>
              <span
                className="relative h-6 w-10 shrink-0 rounded-full"
                style={{ background: alarmOn ? "var(--accent)" : "var(--card-border)" }}
              >
                <span
                  className="absolute top-0.5 h-5 w-5 rounded-full transition-all duration-200"
                  style={{
                    left: alarmOn ? 20 : 4,
                    background: alarmOn ? "var(--accent-ink)" : "var(--muted)",
                  }}
                />
              </span>
            </button>
            {armedAt !== null && (
              <div className="flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2" style={{ borderColor: "var(--card-border)" }}>
                <p className="tnum min-w-0 text-[11px]" style={{ color: "var(--muted)" }}>
                  Phone alarm {new Date(armedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · your Clock app&apos;s ringtone
                </p>
                {!running && !finished && (
                  <button
                    type="button"
                    onClick={cancelArmedAlarm}
                    className="press shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold"
                    style={{ borderColor: "var(--card-border)", color: "var(--warning)" }}
                  >
                    Cancel phone alarm
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={startPause}
            className="press flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold"
            style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            {running ? <Pause size={16} /> : <Play size={16} />}
            {startLabel}
          </button>
          <button
            type="button"
            onClick={reset}
            aria-label="Reset timer"
            className="press flex items-center justify-center rounded-xl border px-4 py-3"
            style={{ background: "var(--surface)", borderColor: "var(--card-border)", color: "var(--foreground)" }}
          >
            <RotateCcw size={16} />
          </button>
        </div>

        <label className="block space-y-1.5">
          <span className="label-cap flex items-center gap-1.5">
            <Link2 size={12} /> Linked to
          </span>
          <select
            value={linkedId}
            onChange={(e) => setLinkedId(e.target.value)}
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={FIELD}
          >
            <option value="">Not linked</option>
            {(deadlines || []).map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.title} · {formatDue(d.dueAt)}
              </option>
            ))}
          </select>
          <span className="block text-[11px]" style={{ color: "var(--muted)" }}>
            {linked
              ? `Due ${formatDue(linked.dueAt)}${linked.course ? ` · ${linked.course}` : ""}`
              : (deadlines || []).length === 0
                ? "No open deadlines yet — add one in Tasks to link sessions."
                : "Optional: attribute this session to a deadline."}
          </span>
        </label>
      </section>

      {finished && (
        <div
          className="card-flat flex items-center gap-3"
          style={{ borderColor: "var(--success)" }}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--success)", color: "var(--accent-ink)" }}
          >
            <CircleCheck size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Session complete</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {duration} minutes saved to your history
            </p>
          </div>
        </div>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="label-cap">Recent sessions</h2>
          {list.length > 0 && (
            <span className="tnum text-[11px]" style={{ color: "var(--muted)" }}>
              {todayMinutes > 0 ? `${todayMinutes} min today` : `${list.length} logged`}
            </span>
          )}
        </div>

        {list.length === 0 ? (
          <div className="card-flat flex flex-col items-center gap-2 py-8 text-center">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              <Timer size={20} />
            </span>
            <p className="text-sm font-semibold">No sessions yet</p>
            <p className="max-w-[15rem] text-xs" style={{ color: "var(--muted)" }}>
              Start the timer above — finished sessions land here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {list.map((s) => (
              <li key={s.id} className="card flex items-center gap-3 py-3">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  <Timer size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.label}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {relDay(s.createdAt)}
                  </p>
                </div>
                <span
                  className="tnum text-sm font-semibold"
                  style={{ color: "var(--accent)" }}
                >
                  {s.minutes} min
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
