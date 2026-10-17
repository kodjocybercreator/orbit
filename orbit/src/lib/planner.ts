import {
  getBudgetState,
  getOpenDeadlines,
  getTodayEnergy,
  getNextClass,
  getTodayClasses,
  nowMinutes,
  formatMinutes,
  type PlanItem,
} from "./db";

export interface DayPlan {
  items: PlanItem[];
  tradeoff: string;
  source: "offline" | "ai";
}

function urgencyScore(dueAt: number): number {
  const hours = (dueAt - Date.now()) / 3_600_000;
  if (hours < 0) return 100; // overdue
  if (hours < 6) return 60;
  if (hours < 24) return 40;
  if (hours < 48) return 25;
  if (hours < 96) return 12;
  return 5;
}

/**
 * Zero-token day planner. Runs entirely on-device from energy,
 * budget, open deadlines and the class timetable. Never calls the network.
 */
export async function planDayOffline(): Promise<DayPlan> {
  const [budget, deadlines, energy, { current, next }, todayClasses] = await Promise.all([
    getBudgetState(),
    getOpenDeadlines(),
    getTodayEnergy(),
    getNextClass(),
    getTodayClasses(),
  ]);

  const level = energy?.energy ?? 3;
  const items: PlanItem[] = [];
  const tradeoffs: string[] = [];
  const now = nowMinutes();

  if (current) {
    items.push({
      title: `In class: ${current.name}`,
      why: current.location ? `Now · ${current.location} · until ${formatMinutes(current.endMin)}` : `Now · until ${formatMinutes(current.endMin)}`,
      minutes: Math.max(5, current.endMin - now),
    });
  } else if (next && next.startMin - now <= 180 && next.startMin >= now) {
    items.push({
      title: `Prep for ${next.name}`,
      why: `Starts ${formatMinutes(next.startMin)}${next.location ? ` · ${next.location}` : ""}`,
      minutes: Math.min(45, Math.max(10, next.startMin - now)),
    });
  }

  // Budget-aware quick win
  if (budget.left < budget.weeklyBudget * 0.2 && budget.left < 20) {
    items.push({
      title: "Eat in today",
      why: `Only ${budget.currency}${budget.left.toFixed(0)} left this week — cook or campus canteen`,
      minutes: 30,
    });
    tradeoffs.push("Skipping takeout keeps the rest of the week flexible.");
  }

  // Pick top deadlines by urgency × remaining effort
  const ranked = [...deadlines]
    .map((d) => ({
      d,
      score: urgencyScore(d.dueAt) * (1 + (d.estimatedHours ?? 1.5)),
    }))
    .sort((a, b) => b.score - a.score);

  const deepBudgetMin = level >= 4 ? 90 : level === 3 ? 50 : 25;
  for (const { d } of ranked) {
    if (items.length >= 3) break;
    const estH = d.estimatedHours ?? 1.5;
    const mins = Math.min(estH * 60, deepBudgetMin);
    items.push({
      title: `Work on ${d.title}`,
      why: `${d.course ? d.course + " · " : ""}due ${new Date(d.dueAt).toLocaleDateString(undefined, { weekday: "short" })} · ~${estH}h left`,
      minutes: Math.max(15, Math.round(mins / 5) * 5),
    });
  }

  if (level <= 2) {
    tradeoffs.push("Low battery — protect sleep; unfinished items move to tomorrow.");
    for (const it of items) it.minutes = Math.min(it.minutes, 30);
  }

  // Free-time filler if we still have slots and no classes left today
  if (items.length < 2) {
    const classesLeft = todayClasses.filter((c) => c.endMin > now).length;
    if (classesLeft === 0) {
      items.push({
        title: level >= 3 ? "Deep-work block" : "Light review + rest",
        why: level >= 3 ? "No classes left — good window for hard stuff" : "Low energy — flashcards or recaps only",
        minutes: level >= 3 ? 60 : 20,
      });
    }
  }

  if (items.length === 0) {
    items.push({
      title: "Clear one small task",
      why: "Nothing pressing — a 15-minute win keeps the streak of control going",
      minutes: 15,
    });
  }

  if (items.length && !tradeoffs.length) {
    tradeoffs.push(
      level >= 4
        ? "Going deep on the top item means everything else waits — pick deliberately."
        : "Shorter sessions today mean more items slip; that's fine at this energy."
    );
  }

  return {
    items: items.slice(0, 3),
    tradeoff: tradeoffs[0] ?? "Something has to give — protect the most urgent deadline first.",
    source: "offline",
  };
}

export function isPlanRequest(text: string): boolean {
  const t = text.toLowerCase().trim();
  return (
    /\bplan\s+(my|today|tomorrow)\b/.test(t) ||
    /what\s+should\s+i\s+do/.test(t) ||
    /day\s+plan/.test(t) ||
    t === "plan" ||
    t === "/plan"
  );
}
