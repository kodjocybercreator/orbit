"use client";

import { useEffect, useState, FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getBudgetState, getSettings } from "@/lib/db";
import { ArrowDownRight, Plus, Trash2, X } from "lucide-react";

const CATEGORIES = ["Food", "Transport", "School", "Fun", "Bills", "Other"];

const inputStyle = {
  background: "var(--surface)",
  borderColor: "var(--card-border)",
  color: "var(--foreground)",
};

export default function BudgetPage() {
  const [mounted, setMounted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [note, setNote] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);

  useEffect(() => setMounted(true), []);

  const budget = useLiveQuery(() => getBudgetState(), []);
  const settings = useLiveQuery(() => getSettings(), []);

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

  if (!mounted || !budget || !settings) return null;

  const budgetSize = Math.max(1, settings.weeklyBudget);
  const pct = Math.max(0, Math.min(100, (budget.spent / budgetSize) * 100));
  const over = budget.left < 0;
  const low = !over && budget.left / budgetSize < 0.2;
  const barColor = over ? "var(--danger)" : low ? "var(--warning)" : "var(--success)";
  const heroColor = over ? "var(--danger)" : low ? "var(--warning)" : "var(--success)";

  const byCategory = CATEGORIES.map((c) => ({
    name: c,
    total: budget.expenses
      .filter((e) => e.category === c)
      .reduce((sum, e) => sum + e.amount, 0),
  }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  const maxCategory = byCategory[0]?.total ?? 1;

  const weekExpenses = [...budget.expenses].sort((a, b) => b.spentAt - a.spentAt);

  return (
    <div className="space-y-4 pt-2">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Money</h1>
          <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            This week&apos;s spending
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
        <p className="label-cap">Left this week</p>
        <p
          className="tnum mt-1 text-[40px] font-bold leading-none tracking-tight"
          style={{ color: heroColor }}
        >
          {budget.currency}
          {budget.left.toFixed(2)}
        </p>
        <p className="tnum mt-2 text-xs" style={{ color: "var(--muted)" }}>
          {budget.currency}
          {budget.spent.toFixed(2)} spent of {budget.currency}
          {settings.weeklyBudget.toFixed(2)}
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
        {over && (
          <p className="mt-2 text-xs font-semibold" style={{ color: "var(--danger)" }}>
            Over budget by {budget.currency}
            {Math.abs(budget.left).toFixed(2)} — ease up for the rest of the week.
          </p>
        )}
      </section>

      {byCategory.length > 0 && (
        <section className="card-flat">
          <p className="label-cap">Where it went</p>
          <ul className="mt-3 space-y-3">
            {byCategory.map((c, i) => (
              <li key={c.name}>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">{c.name}</span>
                  <span className="tnum text-xs font-semibold" style={{ color: "var(--muted)" }}>
                    {budget.currency}
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
            placeholder={`Amount (${budget.currency})`}
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
          <h2 className="label-cap">This week&apos;s expenses</h2>
          <span className="tnum text-xs font-semibold" style={{ color: "var(--muted)" }}>
            {budget.expenses.length} {budget.expenses.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        {weekExpenses.length === 0 ? (
          <div className="card-flat flex items-center gap-3 py-4">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: "var(--success-soft)" }}
            >
              <ArrowDownRight size={16} style={{ color: "var(--success)" }} />
            </span>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Nothing spent yet this week. Full budget intact.
            </p>
          </div>
        ) : (
          <ul className="card overflow-hidden p-0">
            {weekExpenses.map((e, i) => (
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
                  {budget.currency}
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
