"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, DAY_NAMES, formatMinutes, nowMinutes } from "@/lib/db";
import { CalendarDays, MapPin, Plus, Trash2, X } from "lucide-react";

const FIELD: CSSProperties = {
  background: "var(--background)",
  borderColor: "var(--card-border)",
  color: "var(--foreground)",
};

function toMinutes(value: string): number {
  const [h, m] = value.split(":");
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

function spanLabel(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function TimetablePage() {
  const [mounted, setMounted] = useState(false);
  const [day, setDay] = useState(() => new Date().getDay());
  const [showForm, setShowForm] = useState(false);
  const [formDay, setFormDay] = useState(day);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [error, setError] = useState("");

  useEffect(() => setMounted(true), []);

  const selectedChipRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (mounted && selectedChipRef.current) {
      selectedChipRef.current.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }, [day, mounted]);

  const classes = useLiveQuery(
    () => db.classes.where("day").equals(day).toArray(),
    [day]
  );

  function toggleForm() {
    if (!showForm) {
      setFormDay(day);
      setError("");
    }
    setShowForm((s) => !s);
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const startMin = toMinutes(start);
    const endMin = toMinutes(end);
    if (endMin <= startMin) {
      setError("End time must be after start time.");
      return;
    }
    setError("");
    await db.classes.add({
      name: name.trim(),
      code: code.trim() || undefined,
      location: location.trim() || undefined,
      day: formDay,
      startMin,
      endMin,
    });
    setName("");
    setCode("");
    setLocation("");
    setStart("09:00");
    setEnd("10:00");
    setShowForm(false);
    setDay(formDay);
  }

  async function remove(id?: number) {
    if (id) await db.classes.delete(id);
  }

  if (!mounted) return null;

  const today = new Date().getDay();
  const now = nowMinutes();
  const list = [...(classes || [])].sort((a, b) => a.startMin - b.startMin);
  const totalMin = list.reduce((sum, c) => sum + (c.endMin - c.startMin), 0);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Timetable</h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
            Your week, one day at a time
          </p>
        </div>
        <button
          type="button"
          onClick={toggleForm}
          className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          aria-label={showForm ? "Cancel" : "Add class"}
        >
          {showForm ? <X size={18} /> : <Plus size={18} />}
        </button>
      </header>

      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {DAY_NAMES.map((n, i) => {
          const selected = i === day;
          return (
            <button
              key={n}
              type="button"
              ref={selected ? selectedChipRef : undefined}
              onClick={() => setDay(i)}
              className="press flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold"
              style={
                selected
                  ? {
                      background: "var(--accent)",
                      borderColor: "var(--accent)",
                      color: "var(--accent-ink)",
                    }
                  : {
                      background: "var(--surface)",
                      borderColor: "var(--card-border)",
                      color: "var(--muted)",
                    }
              }
              aria-pressed={selected}
            >
              {n}
              {i === today && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: selected ? "var(--accent-ink)" : "var(--accent)",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {showForm && (
        <form onSubmit={add} className="card space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Class name (required)"
            required
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={FIELD}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Code (e.g. CS201)"
              className="rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={FIELD}
            />
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location (optional)"
              className="rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={FIELD}
            />
          </div>
          <label className="block space-y-1.5">
            <span className="label-cap">Day</span>
            <select
              value={formDay}
              onChange={(e) => setFormDay(Number(e.target.value))}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={FIELD}
            >
              {DAY_NAMES.map((n, i) => (
                <option key={n} value={i}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1.5">
              <span className="label-cap">Start</span>
              <input
                type="time"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  setError("");
                }}
                required
                className="tnum w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={FIELD}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="label-cap">End</span>
              <input
                type="time"
                value={end}
                onChange={(e) => {
                  setEnd(e.target.value);
                  setError("");
                }}
                required
                className="tnum w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={FIELD}
              />
            </label>
          </div>
          {error && (
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            className="w-full rounded-xl py-2.5 text-sm font-semibold"
            style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            Add class
          </button>
        </form>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="label-cap">{DAY_NAMES[day]}</h2>
          {list.length > 0 && (
            <span className="tnum text-[11px]" style={{ color: "var(--muted)" }}>
              {list.length} {list.length === 1 ? "class" : "classes"} · {spanLabel(totalMin)}
            </span>
          )}
        </div>

        {list.length === 0 ? (
          <div className="card-flat flex flex-col items-center gap-2 py-8 text-center">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              <CalendarDays size={20} />
            </span>
            <p className="text-sm font-semibold">No classes on {DAY_NAMES[day]}</p>
            <p className="max-w-[15rem] text-xs" style={{ color: "var(--muted)" }}>
              {day === today
                ? "A clear day. Tap + to add a lecture, lab, or tutorial."
                : "Tap + to add a lecture, lab, or tutorial."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {list.map((c) => {
              const isNow = day === today && now >= c.startMin && now < c.endMin;
              return (
                <li
                  key={c.id}
                  className="card flex items-start gap-3 py-3"
                  style={
                    isNow
                      ? { borderLeft: "3px solid var(--accent)", paddingLeft: "13px" }
                      : undefined
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="tnum text-[13px] font-semibold">
                        {formatMinutes(c.startMin)} – {formatMinutes(c.endMin)}
                      </span>
                      {isNow && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
                          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                        >
                          Now
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-[15px] font-medium">{c.name}</p>
                    {(c.location || c.code) && (
                      <p
                        className="mt-0.5 flex items-center gap-1.5 truncate text-xs"
                        style={{ color: "var(--muted)" }}
                      >
                        {c.location && (
                          <>
                            <MapPin size={12} className="shrink-0" />
                            <span className="truncate">{c.location}</span>
                          </>
                        )}
                        {c.location && c.code && <span aria-hidden="true">·</span>}
                        {c.code && <span className="tnum shrink-0">{c.code}</span>}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    aria-label={`Delete ${c.name}`}
                    className="press mt-0.5"
                    style={{ color: "var(--muted)" }}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
