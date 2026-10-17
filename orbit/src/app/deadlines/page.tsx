"use client";

import { useEffect, useState, FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, formatDue, type Deadline } from "@/lib/db";
import { scheduleDeadlineReminder, cancelDeadlineReminders } from "@/lib/notify";
import { Check, ChevronDown, ClipboardList, Pencil, Plus, Trash2, X } from "lucide-react";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "week", label: "This week" },
  { key: "overdue", label: "Overdue" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function toLocalInput(ts: number): string {
  const d = new Date(ts);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const inputStyle = {
  background: "var(--surface)",
  borderColor: "var(--card-border)",
  color: "var(--foreground)",
};

export default function DeadlinesPage() {
  const [mounted, setMounted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Deadline | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [hours, setHours] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => setMounted(true), []);

  const all = useLiveQuery(() => db.deadlines.orderBy("dueAt").toArray(), []);

  function resetForm() {
    setEditing(null);
    setTitle("");
    setCourse("");
    setDueDate("");
    setHours("");
    setShowForm(false);
  }

  function startEdit(d: Deadline) {
    setEditing(d);
    setTitle(d.title);
    setCourse(d.course || "");
    setDueDate(toLocalInput(d.dueAt));
    setHours(d.estimatedHours ? String(d.estimatedHours) : "");
    setShowForm(true);
    setConfirmId(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    const dueAt = new Date(dueDate).getTime();
    if (!Number.isFinite(dueAt)) return;
    const payload = {
      title: title.trim(),
      course: course.trim() || undefined,
      dueAt,
      estimatedHours: hours ? Number(hours) : undefined,
    };
    if (editing?.id) {
      await cancelDeadlineReminders(editing.id);
      await db.deadlines.update(editing.id, payload);
      const updated = await db.deadlines.get(editing.id);
      if (updated) await scheduleDeadlineReminder(updated);
    } else {
      const id = await db.deadlines.add({
        ...payload,
        done: false,
        createdAt: Date.now(),
      });
      const saved = await db.deadlines.get(id);
      if (saved) await scheduleDeadlineReminder(saved);
    }
    resetForm();
  }

  async function toggle(d: Deadline) {
    if (d.id === undefined) return;
    const done = !d.done;
    await db.deadlines.update(d.id, { done });
    if (done) {
      await cancelDeadlineReminders(d.id);
    } else {
      const updated = await db.deadlines.get(d.id);
      if (updated) await scheduleDeadlineReminder(updated);
    }
  }

  async function remove(id?: number) {
    if (id === undefined) return;
    await cancelDeadlineReminders(id);
    await db.deadlines.delete(id);
    setConfirmId(null);
  }

  if (!mounted) return null;

  const now = Date.now();
  const open = (all || []).filter((d) => !d.done);
  const doneList = (all || []).filter((d) => d.done);
  const visible =
    filter === "week"
      ? open.filter((d) => d.dueAt <= now + 7 * 86_400_000)
      : filter === "overdue"
      ? open.filter((d) => d.dueAt < now)
      : open;

  return (
    <div className="space-y-4 pt-2">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Tasks</h1>
          <p className="mt-0.5 text-xs tnum" style={{ color: "var(--muted)" }}>
            {open.length} open · {doneList.length} done
          </p>
        </div>
        <button
          onClick={() => (showForm ? resetForm() : setShowForm(true))}
          className="press flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          aria-label={showForm ? "Close form" : "Add task"}
        >
          {showForm ? <X size={18} /> : <Plus size={18} />}
        </button>
      </header>

      <div className="card-flat flex gap-1 p-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => {
              setFilter(f.key);
              setConfirmId(null);
            }}
            className="press flex-1 rounded-xl py-2 text-xs font-semibold"
            style={
              filter === f.key
                ? { background: "var(--accent)", color: "var(--accent-ink)" }
                : { color: "var(--muted)" }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {showForm && (
        <form onSubmit={submit} className="card space-y-3">
          <p className="label-cap">{editing ? "Edit task" : "New task"}</p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (e.g. Essay draft)"
            required
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={inputStyle}
          />
          <input
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            placeholder="Course (optional)"
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={inputStyle}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
              className="rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={inputStyle}
            />
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="Est hours"
              className="rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="press flex-1 rounded-xl py-2.5 text-sm font-semibold"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              {editing ? "Save changes" : "Add task"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={resetForm}
                className="press rounded-xl border px-4 py-2.5 text-sm font-semibold"
                style={{ borderColor: "var(--card-border)", color: "var(--muted)" }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {visible.length === 0 && doneList.length === 0 && !showForm ? (
        <div className="card flex flex-col items-center gap-3 py-10 text-center">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: "var(--accent-soft)" }}
          >
            <ClipboardList size={20} style={{ color: "var(--accent)" }} />
          </span>
          <div>
            <p className="text-sm font-semibold">No tasks yet</p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              Add your first assignment or exam — Orbit will plan around it and set
              reminders.
            </p>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="card-flat py-4 text-center text-sm" style={{ color: "var(--muted)" }}>
          {filter === "overdue" ? "Nothing overdue. Nice." : "Nothing due this week."}
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((d) => {
            const urgent = d.dueAt - now < 86_400_000;
            return (
              <li key={d.id} className="card flex items-center gap-3 py-3">
                <button
                  onClick={() => toggle(d)}
                  className="press flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
                  style={{ borderColor: "var(--muted)" }}
                  aria-label="Mark done"
                >
                  <Check size={13} className="opacity-0" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{d.title}</p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                    {d.course || "—"}
                    {d.estimatedHours ? (
                      <>
                        {" · "}
                        <span className="tnum">~{d.estimatedHours}h</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <span
                  className="tnum shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold"
                  style={
                    urgent
                      ? { color: "var(--danger)", background: "var(--danger-soft)" }
                      : { color: "var(--accent)", background: "var(--accent-soft)" }
                  }
                >
                  {formatDue(d.dueAt)}
                </span>
                <button
                  onClick={() => startEdit(d)}
                  className="press shrink-0"
                  style={{ color: "var(--muted)" }}
                  aria-label="Edit"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() =>
                    confirmId === d.id && d.id !== undefined
                      ? remove(d.id)
                      : setConfirmId(d.id ?? null)
                  }
                  className="press shrink-0"
                  style={{ color: confirmId === d.id ? "var(--danger)" : "var(--muted)" }}
                  aria-label="Delete"
                >
                  {confirmId === d.id ? (
                    <span className="text-xs font-semibold">Confirm?</span>
                  ) : (
                    <Trash2 size={15} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {doneList.length > 0 && (
        <div>
          <button
            onClick={() => setShowDone((s) => !s)}
            className="press flex w-full items-center justify-between py-2"
          >
            <span className="label-cap">Completed ({doneList.length})</span>
            <ChevronDown
              size={15}
              style={{
                color: "var(--muted)",
                transform: showDone ? "rotate(180deg)" : "none",
                transition: "transform 0.2s",
              }}
            />
          </button>
          {showDone && (
            <ul className="space-y-2 pt-1">
              {doneList.map((d) => (
                <li
                  key={d.id}
                  className="card-flat flex items-center gap-3 py-3"
                  style={{ opacity: 0.75 }}
                >
                  <button
                    onClick={() => toggle(d)}
                    className="press flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                    style={{ background: "var(--success)", color: "var(--accent-ink)" }}
                    aria-label="Undo"
                  >
                    <Check size={13} />
                  </button>
                  <p className="min-w-0 flex-1 truncate text-sm line-through">{d.title}</p>
                  <button
                    onClick={() =>
                      confirmId === d.id && d.id !== undefined
                        ? remove(d.id)
                        : setConfirmId(d.id ?? null)
                    }
                    className="press shrink-0"
                    style={{ color: confirmId === d.id ? "var(--danger)" : "var(--muted)" }}
                    aria-label="Delete"
                  >
                    {confirmId === d.id ? (
                      <span className="text-xs font-semibold">Confirm?</span>
                    ) : (
                      <Trash2 size={15} />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
