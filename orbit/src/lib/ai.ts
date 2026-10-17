import {
  getSettings,
  getBudgetState,
  getOpenDeadlines,
  getTodayEnergy,
  getNextClass,
  getTodayClasses,
  getGpa,
  formatMinutes,
  type PlanItem,
} from "./db";
import { planDayOffline, isPlanRequest, type DayPlan } from "./planner";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";
const TIMEOUT_MS = 20_000;

export interface AIResult {
  reply: string;
  plan: PlanItem[];
  tradeoff?: string;
  source: "ai" | "offline";
}

function systemPrompt(ctx: {
  name?: string;
  energy: number | null;
  budgetLeft: number;
  currency: string;
  weeklyBudget: number;
  deadlines: { title: string; course?: string; dueAt: number; estimatedHours?: number }[];
  day: string;
  nowClass?: string;
  nextClass?: string;
  classesToday: string;
  gpa: number;
}) {
  const deadlineLines =
    ctx.deadlines.length === 0
      ? "- (none open)"
      : ctx.deadlines
          .slice(0, 10)
          .map((d) => {
            const hours = Math.round((d.dueAt - Date.now()) / 3_600_000);
            const when = hours < 0 ? `${Math.abs(hours)}h overdue` : hours < 48 ? `in ${hours}h` : `in ${Math.ceil(hours / 24)}d`;
            return `- ${d.title}${d.course ? ` (${d.course})` : ""}: due ${when}${d.estimatedHours ? `, est ${d.estimatedHours}h` : ""}`;
          })
          .join("\n");

  return `You are Orbit, a warm but direct campus copilot for university students. Speak like a sharp older student — never corporate, never hype.

User: ${ctx.name || "student"}. It is ${ctx.day}.
Energy today: ${ctx.energy ?? "not logged"}/5.
Budget: ${ctx.budgetLeft.toFixed(2)}${ctx.currency} left of ${ctx.weeklyBudget}${ctx.currency} this week.
Current GPA: ${ctx.gpa ? ctx.gpa.toFixed(2) : "n/a"}.
Now: ${ctx.nowClass ?? "no class"}.
Next class: ${ctx.nextClass ?? "none scheduled"}.
Classes today: ${ctx.classesToday || "none"}.
Open deadlines:
${deadlineLines}

Rules:
- Max 3 action items, ordered by urgency vs energy available.
- If a class is running, first item respects it.
- If energy <= 2: protect sleep, lighter plan, no stacked deep work.
- If budget is low: prefer free/low-cost food and ideas.
- Always state exactly one honest trade-off.
- Keep reply under 60 words. No emoji. No markdown.

Respond with JSON only:
{
  "reply": "short chat reply",
  "plan": [{ "title": "short action", "why": "one line reason", "minutes": 30 }],
  "tradeoff": "one honest trade-off"
}`;
}

async function askGroq(userMessage: string, history: { role: "user" | "orbit"; text: string }[]): Promise<AIResult> {
  const settings = await getSettings();
  const [budget, deadlines, energy, { current, next }, todayClasses, gpaInfo] = await Promise.all([
    getBudgetState(),
    getOpenDeadlines(),
    getTodayEnergy(),
    getNextClass(),
    getTodayClasses(),
    getGpa(),
  ]);

  const day = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const classesToday = todayClasses
    .map((c) => `${c.name} ${formatMinutes(c.startMin)}–${formatMinutes(c.endMin)}`)
    .join(", ");

  const sys = systemPrompt({
    name: settings.name,
    energy: energy?.energy ?? null,
    budgetLeft: budget.left,
    currency: budget.currency,
    weeklyBudget: budget.weeklyBudget,
    deadlines,
    day,
    nowClass: current ? current.name : undefined,
    nextClass: next ? `${next.name} at ${formatMinutes(next.startMin)}` : undefined,
    classesToday,
    gpa: gpaInfo.gpa,
  });

  const messages = [
    { role: "system", content: sys },
    ...history.slice(-8).map((m) => ({ role: m.role === "orbit" ? "assistant" : "user", content: m.text })),
    { role: "user", content: userMessage },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.groqApiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.6,
        max_tokens: 600,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return {
        reply: `AI request failed (${res.status}). ${res.status === 401 ? "Check your API key in Settings." : "Try again shortly."} ${err.slice(0, 100)}`.trim(),
        plan: [],
        source: "ai",
      };
    }

    const data = await res.json();
    const raw: string = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: Partial<AIResult> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { reply: raw };
    }

    return {
      reply: parsed.reply || "Got it.",
      plan: Array.isArray(parsed.plan) ? parsed.plan.slice(0, 3) : [],
      tradeoff: parsed.tradeoff,
      source: "ai",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Main entry. With no API key, runs the on-device planner (zero tokens).
 * With a key: "plan my day" and freeform chat go to Groq for a smarter answer,
 * with the offline planner used as fallback on failure. Freeform chat never
 * falls back to a plan — it explains the error instead.
 */
export async function askOrbit(
  userMessage: string,
  history: { role: "user" | "orbit"; text: string }[] = []
): Promise<AIResult> {
  const settings = await getSettings();
  const planWanted = isPlanRequest(userMessage);

  if (!settings.groqApiKey) {
    const offline: DayPlan = await planDayOffline();
    if (planWanted) {
      return {
        reply:
          offline.items.length > 0
            ? "Quick local plan (no AI needed — runs on your data only):"
            : "Here's what I've got from your data:",
        plan: offline.items,
        tradeoff: offline.tradeoff,
        source: "offline",
      };
    }
    return {
      reply:
        "I can plan from your deadlines, budget and energy without any AI. Tap \"Plan my day\" or add a free Groq API key in Settings for full chat.",
      plan: [],
      source: "offline",
    };
  }

  try {
    const result = await askGroq(userMessage, history);
    if (planWanted && result.plan.length === 0) {
      const offline = await planDayOffline();
      return { ...result, plan: offline.items, tradeoff: result.tradeoff ?? offline.tradeoff };
    }
    return result;
  } catch (e) {
    const offline = await planDayOffline();
    const reason = e instanceof DOMException && e.name === "AbortError" ? "timed out" : "no connection";
    if (planWanted) {
      return {
        reply: `AI ${reason} — here's an offline plan from your data instead:`,
        plan: offline.items,
        tradeoff: offline.tradeoff,
        source: "offline",
      };
    }
    return {
      reply: `AI ${reason}. Check your connection or API key in Settings. You can still plan offline — just ask for a day plan.`,
      plan: [],
      source: "offline",
    };
  }
}
