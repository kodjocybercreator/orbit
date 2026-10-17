"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getGpa, LETTER_POINTS } from "@/lib/db";
import { GraduationCap, Plus, Target, Trash2, X } from "lucide-react";

const LETTERS = Object.keys(LETTER_POINTS);

const FIELD: CSSProperties = {
  background: "var(--background)",
  borderColor: "var(--card-border)",
  color: "var(--foreground)",
};

function gpaColor(gpa: number): string {
  if (gpa >= 3.5) return "var(--success)";
  if (gpa >= 2.5) return "var(--accent)";
  return "var(--danger)";
}

export default function GradesPage() {
  const [mounted, setMounted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [credits, setCredits] = useState("");
  const [letter, setLetter] = useState("A");
  const [semester, setSemester] = useState("");
  const [targetGpa, setTargetGpa] = useState("3.5");
  const [currentGpa, setCurrentGpa] = useState("");
  const [targetCredits, setTargetCredits] = useState("15");
  const touchedRef = useRef(false);

  useEffect(() => setMounted(true), []);

  const data = useLiveQuery(() => getGpa(), []);

  useEffect(() => {
    if (!data || touchedRef.current) return;
    setCurrentGpa(data.gpa.toFixed(2));
  }, [data]);

  async function add(e: FormEvent) {
    e.preventDefault();
    const cr = parseFloat(credits);
    if (!name.trim() || !Number.isFinite(cr) || cr <= 0) return;
    await db.gradeCourses.add({
      name: name.trim(),
      credits: cr,
      letter,
      semester: semester.trim() || undefined,
    });
    setName("");
    setCredits("");
    setLetter("A");
    setSemester("");
    setShowForm(false);
  }

  async function updateLetter(id: number | undefined, value: string) {
    if (id) await db.gradeCourses.update(id, { letter: value });
  }

  async function remove(id?: number) {
    if (id) await db.gradeCourses.delete(id);
  }

  if (!mounted || !data) return null;

  const courses = data.courses;
  const hasCourses = courses.length > 0 && data.credits > 0;
  const color = hasCourses ? gpaColor(data.gpa) : "var(--muted)";

  const tGpa = parseFloat(targetGpa);
  const cGpa = parseFloat(currentGpa);
  const tCred = parseFloat(targetCredits);
  const valid =
    Number.isFinite(tGpa) && Number.isFinite(cGpa) && Number.isFinite(tCred) && tCred > 0;
  const required = valid
    ? (tGpa * (data.credits + tCred) - cGpa * data.credits) / tCred
    : 0;

  let resultColor = "var(--accent)";
  let resultNote = `Average across your next ${tCred} credits`;
  if (valid && required <= 0) {
    resultColor = "var(--success)";
    resultNote = "You already clear this target";
  } else if (valid && required > 4) {
    resultColor = "var(--danger)";
    resultNote = "Out of reach on a 4.0 scale";
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Grades</h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
            Credit-weighted GPA, kept on this device
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          aria-label={showForm ? "Cancel" : "Add course"}
        >
          {showForm ? <X size={18} /> : <Plus size={18} />}
        </button>
      </header>

      <section className="card py-6 text-center">
        <p className="label-cap">Cumulative GPA</p>
        <p
          className="tnum mt-1.5 text-[64px] font-bold leading-none tracking-tight"
          style={{ color }}
        >
          {hasCourses ? data.gpa.toFixed(2) : <span className="text-[44px] opacity-50">–</span>}
        </p>
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          {hasCourses
            ? `${data.credits} credits across ${courses.length} ${
                courses.length === 1 ? "course" : "courses"
              }`
            : "Add a course below to calculate your GPA"}
        </p>
        <div className="mx-auto mt-4 w-full max-w-[240px]">
          <div
            className="h-1.5 w-full rounded-full"
            style={{ background: "var(--card-border)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(0, Math.min(100, (data.gpa / 4) * 100))}%`,
                background: color,
              }}
            />
          </div>
          <div
            className="tnum mt-1.5 flex justify-between text-[10px]"
            style={{ color: "var(--muted)" }}
          >
            <span>0.0</span>
            <span>4.0</span>
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <Target size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight">What do I need?</h2>
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>
              The average to hit your next target
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="block space-y-1">
            <span className="label-cap">Target</span>
            <input
              inputMode="decimal"
              value={targetGpa}
              onChange={(e) => setTargetGpa(e.target.value)}
              placeholder="3.50"
              className="tnum w-full rounded-xl border px-2.5 py-2 text-sm font-semibold outline-none"
              style={FIELD}
            />
          </label>
          <label className="block space-y-1">
            <span className="label-cap">Current</span>
            <input
              inputMode="decimal"
              value={currentGpa}
              onChange={(e) => {
                touchedRef.current = true;
                setCurrentGpa(e.target.value);
              }}
              placeholder="0.00"
              className="tnum w-full rounded-xl border px-2.5 py-2 text-sm font-semibold outline-none"
              style={FIELD}
            />
          </label>
          <label className="block space-y-1">
            <span className="label-cap">Credits</span>
            <input
              inputMode="numeric"
              value={targetCredits}
              onChange={(e) => setTargetCredits(e.target.value)}
              placeholder="15"
              className="tnum w-full rounded-xl border px-2.5 py-2 text-sm font-semibold outline-none"
              style={FIELD}
            />
          </label>
        </div>

        <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--surface)" }}>
          {valid ? (
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="label-cap">GPA needed</p>
                <p
                  className="tnum text-3xl font-bold leading-none"
                  style={{ color: resultColor }}
                >
                  {Math.max(0, required).toFixed(2)}
                </p>
              </div>
              <p
                className="max-w-[58%] text-right text-[11px] leading-snug"
                style={{ color: "var(--muted)" }}
              >
                {resultNote}
              </p>
            </div>
          ) : (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Enter a target GPA, your current GPA, and the credits you have left.
            </p>
          )}
        </div>
      </section>

      {showForm && (
        <form onSubmit={add} className="card space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Course name (required)"
            required
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={FIELD}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              inputMode="numeric"
              min="0.5"
              step="0.5"
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
              placeholder="Credits"
              required
              className="tnum rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={FIELD}
            />
            <select
              value={letter}
              onChange={(e) => setLetter(e.target.value)}
              className="rounded-xl border px-3 py-2.5 text-sm font-semibold outline-none"
              style={FIELD}
              aria-label="Letter grade"
            >
              {LETTERS.map((l) => (
                <option key={l} value={l}>
                  {l} · {LETTER_POINTS[l].toFixed(1)}
                </option>
              ))}
            </select>
          </div>
          <input
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            placeholder="Semester (optional, e.g. Fall 2026)"
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={FIELD}
          />
          <button
            type="submit"
            className="w-full rounded-xl py-2.5 text-sm font-semibold"
            style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            Add course
          </button>
        </form>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="label-cap">Courses</h2>
          {courses.length > 0 && (
            <span className="tnum text-[11px]" style={{ color: "var(--muted)" }}>
              {courses.length} · {data.credits} cr
            </span>
          )}
        </div>

        {courses.length === 0 ? (
          <div className="card-flat flex flex-col items-center gap-2 py-8 text-center">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              <GraduationCap size={20} />
            </span>
            <p className="text-sm font-semibold">No courses yet</p>
            <p className="max-w-[16rem] text-xs" style={{ color: "var(--muted)" }}>
              Add a course with its credits and letter grade to see your GPA.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {courses.map((c) => (
              <li key={c.id} className="card flex items-center gap-2.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="tnum text-xs" style={{ color: "var(--muted)" }}>
                    {c.credits} {c.credits === 1 ? "credit" : "credits"}
                    {c.semester ? ` · ${c.semester}` : ""}
                  </p>
                </div>
                <span
                  className="tnum text-xs font-semibold"
                  style={{ color: "var(--accent)" }}
                >
                  {(LETTER_POINTS[c.letter] ?? 0).toFixed(1)}
                </span>
                <select
                  value={c.letter}
                  onChange={(e) => updateLetter(c.id, e.target.value)}
                  className="tnum rounded-lg border px-2 py-1.5 text-xs font-bold outline-none"
                  style={FIELD}
                  aria-label={`Letter grade for ${c.name}`}
                >
                  {LETTERS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  aria-label={`Delete ${c.name}`}
                  className="press shrink-0"
                  style={{ color: "var(--muted)" }}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
