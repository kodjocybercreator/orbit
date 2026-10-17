"use client";

import { useEffect, useState, FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { db, getBudgetState } from "@/lib/db";
import { ArrowDownRight, MessageCircle, Plus, Trash2, X } from "lucide-react";

const CATEGORIES = ["Food", "Transport", "School", "Fun", "Bills", "Other"];

const inputStyle = {
  background: "var(--surface)",
  borderColor: "var(--card-border)",
  color: "var(--foreground)",
};

const CHART_W = 320;
const PACE_H = 96;
const BARS_H = 40;

export default function BudgetPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [note, setNote] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);

  useEffect(() => setMounted(true), []);

  const budget = useLiveQuery(() => getBudgetState(), []);

  async function add(e: FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    await db.expenses.add({
      amount: amt,
      category,
      note: note.trim() || undefined,
      spentAt: Date.now(),
    });
    setAmount("");
    setNote("");
    setShowForm(false);
  }

  async function remove(id?: number) {
    if (id === undefined) return;
    await db.expenses.delete(id);
    setConfirmId(null);
  }

  function askOrbitMoney() {
    try {
      localStorage.setItem(
        "orbit-prefill",
        "Review my spending this month: how am I doing against my budget, what's the one thing I should cut, and can I afford a small treat right now?"
      );
    } catch {
      /* private mode */
    }
    void router.push("/chat");
  }

  if (!mounted || !budget) return null;

  const { monthlyBudget, currency, spent, left, daysLeft, safeToSpend, idealSpent, overPace } = budget;
  const pct = Math.max(0, Math.min(100, (spent / Math.max(1, monthlyBudget)) * 100));
  const over = left < 0;
  const low = !over && left / monthlyBudget < 0.15;
  const barColor = over ? "var(--danger)" : low ? "var(--warning)" : "var(--success)";
  const heroColor = over ? "var(--danger)" : low ? "var(--warning)" : "var(--success)";
  const paceDiff = idealSpent - spent;

  const maxCategory = budget.byCategory[0]?.total ?? 1;
  const monthExpenses = [...budget.expenses].sort((a, b) => b.spentAt - a.spentAt);
  const maxMonth = Math.max(...budget.monthTotals.map((m) => m.total), monthlyBudget, 1);

  // --- Pace chart: cumulative spend vs a flat ideal line ---
  const xFor = (day: number) =>
    2 + ((day - 1) / Math.max(1, budget.daysInMonth - 1)) * (CHART_W - 4);
  const yFor = (v: number) =>
    PACE_H - 6 - (Math.min(Math.max(v, 0), monthlyBudget) / Math.max(1, monthlyBudget)) * (PACE_H - 14);
  let cum = 0;
  const actualPts = budget.daily
    .map((d) => {
      cum += d.total;
      return `${xFor(d.day).toFixed(1)},${yFor(cum).toFixed(1)}`;
    })
    .join(" ");
  const idealPts = `${xFor(1).toFixed(1)},${yFor(monthlyBudget / budget.daysInMonth).toFixed(1)} ${xFor(budget.daysInMonth).toFixed(1)},${yFor(monthlyBudget).toFixed(1)}`;
  const todayX = xFor(budget.dayOfMonth);
  const todayY = yFor(cum);

  // --- Daily bars ---
  const maxDaily = Math.max(...budget.daily.map((d) => d.total), 1);
  const barSlot = CHART_W / budget.daysInMonth;
  const barW = Math.max(1.5, barSlot - 1.5);

  const list = budget.monthTotals;

  return (
    <div className="space-y-4 pt-2">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Money</h1>
          <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            Monthly budget · day {budget.dayOfMonth} of {budget.daysInMonth}
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="press flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          aria-label={showForm ? "Close form" : "Add expense"}
        >
          {showForm ? <X size={18} /> : <Plus size={18} />}
        </button>
      </header>

      <section className="card">
        <p className="label-cap">Left this month</p>
        <p
          className="tnum mt-1 text-[40px] font-bold leading-none tracking-tight"
          style={{ color: heroColor }}
        >
          {currency}
          {left.toFixed(2)}
        </p>
        <p className="tnum mt-2 text-xs" style={{ color: "var(--muted)" }}>
          {currency}
          {spent.toFixed(2)} spent of {currency}
          {monthlyBudget.toFixed(2)} · {currency}
          {safeToSpend.toFixed(2)}/day safe for {daysLeft} {daysLeft === 1 ? "day" : "days"} left
        </p>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full"
          style={{ background: "var(--card-border)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
        {over ? (
          <p className="mt-2 text-xs font-semibold" style={{ color: "var(--danger)" }}>
            Over budget by {currency}
            {Math.abs(left).toFixed(2)} — pause non-essentials until the month rolls over.
          </p>
        ) : overPace ? (
          <p className="mt-2 text-xs font-semibold" style={{ color: "var(--warning)" }}>
            Ahead of pace by {currency}
            {paceDiff.toFixed(2)} — ideally you&apos;d be at {currency}
            {idealSpent.toFixed(2)} by now.
          </p>
        ) : (
          <p className="mt-2 text-xs font-semibold" style={{ color: "var(--success)" }}>
            Under pace by {currency}
            {Math.abs(paceDiff).toFixed(2)} — on track for {currency}
            {monthlyBudget.toFixed(2)}.
          </p>
        )}
      </section>

      <section className="card space-y-1">
        <div className="flex items-baseline justify-between">
          <p className="label-cap">Spending pace</p>
          <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--muted)" }}>
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-0.5 w-4 rounded-full"
                style={{ background: overPace ? "var(--danger)" : "var(--accent)" }}
              />
              Actual
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-0 w-4 border-t border-dashed"
                style={{ borderColor: "var(--muted)" }}
              />
              Ideal
            </span>
          </div>
        </div>
        <svg
          viewBox={`0 0 ${CHART_W} ${PACE_H}`}
          className="w-full"
          role="img"
          aria-label="Cumulative spending versus ideal pace this month"
        >
          <line
            x1={xFor(1)}
            y1={yFor(monthlyBudget / 2)}
            x2={xFor(budget.daysInMonth)}
            y2={yFor(monthlyBudget / 2)}
            stroke="var(--card-border)"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
          <line
            x1={xFor(1)}
            y1={yFor(monthlyBudget)}
            x2={xFor(budget.daysInMonth)}
            y2={yFor(monthlyBudget)}
            stroke="var(--card-border)"
            strokeWidth="1"
          />
          <polyline points={idealPts} fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="5 4" />
          {actualPts && (
            <polyline
              points={actualPts}
              fill="none"
              stroke={overPace ? "var(--danger)" : "var(--accent)"}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          <circle cx={todayX} cy={todayY} r="3.5" fill={overPace ? "var(--danger)" : "var(--accent)"} />
        </svg>
        <p className="text-[10px]" style={{ color: "var(--muted)" }}>
          Cumulative spend this month vs a flat {currency}
          {(monthlyBudget / budget.daysInMonth).toFixed(2)}/day plan.
        </p>
      </section>

      <section className="card space-y-1">
        <div className="flex items-baseline justify-between">
          <p className="label-cap">Daily spending</p>
          <span className="tnum text-[10px]" style={{ color: "var(--muted)" }}>
            peak {currency}
            {maxDaily.toFixed(0)}
          </span>
        </div>
        <svg
          viewBox={`0 0 ${CHART_W} ${BARS_H}`}
          className="w-full"
          role="img"
          aria-label="Spend per day this month"
        >
          {budget.daily.map((d) => {
            const h = d.total > 0 ? Math.max(2, (d.total / maxDaily) * (BARS_H - 4)) : 1.5;
            const x = (d.day - 1) * barSlot + 0.75;
            const isToday = d.day === budget.dayOfMonth;
            return (
              <rect
                key={d.day}
                x={x}
                y={BARS_H - h}
                width={barW}
                height={h}
                rx={Math.min(1.5, barW / 2)}
                fill={isToday ? "var(--accent)" : "var(--accent)"}
                opacity={isToday ? 1 : 0.45}
              />
            );
          })}
        </svg>
        <p className="text-[10px]" style={{ color: "var(--muted)" }}>
          Day {budget.dayOfMonth} is the bright bar — each bar is that day&apos;s total.
        </p>
      </section>

      <section className="card space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="label-cap">Month by month</p>
          <span className="text-[10px]" style={{ color: "var(--muted)" }}>
            builds as history grows
          </span>
        </div>
        <div className="flex h-24 items-end gap-1.5">
          {list.map((m) => (
            <div key={m.start} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="tnum text-[9px]" style={{ color: m.current ? "var(--accent)" : "var(--muted)" }}>
                {m.total > 0 ? `${Math.round((m.total / maxMonth) * 100)}%` : "–"}
              </span>
              <div
                className="w-full rounded-t"
                style={{
                  height: `${Math.max(2, (m.total / maxMonth) * 70)}%`,
                  background: m.current ? "var(--accent)" : "var(--card-border)",
                }}
              />
              <span
                className="text-[9px] font-semibold"
                style={{ color: m.current ? "var(--accent)" : "var(--muted)" }}
              >
                {m.label}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[10px]" style={{ color: "var(--muted)" }}>
          Six-month view of {currency}0 to {currency}
          {maxMonth.toFixed(0)} — this is the graph that learns your habits over time.
        </p>
      </section>

      <button
        type="button"
        onClick={askOrbitMoney}
        className="press flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold"
        style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--surface)" }}
      >
        <MessageCircle size={15} /> Ask Orbit about my spending
      </button>

      {budget.byCategory.length > 0 && (
        <section className="card-flat">
          <p className="label-cap">Where it went</p>
          <ul className="mt-3 space-y-3">
            {budget.byCategory.map((c, i) => (
              <li key={c.name}>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">{c.name}</span>
                  <span className="tnum text-xs font-semibold" style={{ color: "var(--muted)" }}>
                    {currency}
                    {c.total.toFixed(2)}
                  </span>
                </div>
                <div
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full"
                  style={{ background: "var(--card-border)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(6, (c.total / maxCategory) * 100)}%`,
                      background: "var(--accent)",
                      opacity: i === 0 ? 1 : 0.55,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {showForm && (
        <form onSubmit={add} className="card space-y-3">
          <p className="label-cap">New expense</p>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Amount (${currency})`}
            required
            className="tnum w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={inputStyle}
          />
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className="press rounded-full px-3 py-1.5 text-xs font-semibold"
                style={
                  category === c
                    ? { background: "var(--accent)", color: "var(--accent-ink)" }
                    : {
                        border: "1px solid var(--card-border)",
                        color: "var(--muted)",
                        background: "var(--surface)",
                      }
                }
              >
                {c}
              </button>
            ))}
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={inputStyle}
          />
          <button
            type="submit"
            className="press w-full rounded-xl py-2.5 text-sm font-semibold"
            style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            Add expense
          </button>
        </form>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="label-cap">This month&apos;s expenses</h2>
          <span className="tnum text-xs font-semibold" style={{ color: "var(--muted)" }}>
            {budget.expenses.length} {budget.expenses.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        {monthExpenses.length === 0 ? (
          <div className="card-flat flex items-center gap-3 py-4">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: "var(--success-soft)" }}
            >
              <ArrowDownRight size={16} style={{ color: "var(--success)" }} />
            </span>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Nothing spent yet this month. Full budget intact — the graph starts with your
              first entry.
            </p>
          </div>
        ) : (
          <ul className="card overflow-hidden p-0">
            {monthExpenses.map((e, i) => (
              <li
                key={e.id}
                className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t" : ""}`}
                style={{ borderColor: "var(--card-border)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {e.category}
                    {e.note ? ` — ${e.note}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                    {new Date(e.spentAt).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <span className="tnum shrink-0 text-sm font-semibold">
                  {currency}
                  {e.amount.toFixed(2)}
                </span>
                <button
                  onClick={() =>
                    confirmId === e.id && e.id !== undefined
                      ? remove(e.id)
                      : setConfirmId(e.id ?? null)
                  }
                  className="press shrink-0"
                  style={{ color: confirmId === e.id ? "var(--danger)" : "var(--muted)" }}
                  aria-label="Delete"
                >
                  {confirmId === e.id ? (
                    <span className="text-xs font-semibold">Confirm?</span>
                  ) : (
                    <Trash2 size={15} />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
