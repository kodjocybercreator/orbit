import {
  getSettings,
  getBudgetState,
  getOpenDeadlines,
  getTodayEnergy,
  getNextClass,
  getTodayClasses,
  getAllClasses,
  getGpa,
  formatMinutes,
  DAY_NAMES,
  type PlanItem,
} from "./db";
import { planDayOffline, isPlanRequest, type DayPlan } from "./planner";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Groq retired llama-3.3-70b-versatile (Aug 2026). GPT-OSS 120B is their
// recommended replacement: production, 131K context, free-tier eligible.
// GPT-OSS 20B is the safety-net fallback if the primary is ever retired too.
const MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"] as const;
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
  monthlyBudget: number;
  safeToSpend: number;
  overPace: boolean;
  daysLeft: number;
  dayOfMonth: number;
  daysInMonth: number;
  topCategories: string;
  incomeLine: string;
  deadlines: { title: string; course?: string; dueAt: number; estimatedHours?: number }[];
  day: string;
  nowClass?: string;
  nextClass?: string;
  classesToday: string;
  timetable: string;
  gpa: number;
  planMode: boolean;
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

  const data = `You are Orbit, a warm but direct campus copilot for university students. Speak like a sharp older student — never corporate, never hype.

User: ${ctx.name || "student"}. It is ${ctx.day}.
Energy today: ${ctx.energy ?? "not logged"}/5.
Budget: ${ctx.budgetLeft.toFixed(2)}${ctx.currency} left of ${ctx.monthlyBudget.toFixed(2)}${ctx.currency} this month (day ${ctx.dayOfMonth} of ${ctx.daysInMonth}, ${ctx.daysLeft} days counting today).
Safe to spend: about ${ctx.safeToSpend.toFixed(2)}${ctx.currency}/day for the rest of the month.
Pace: ${ctx.overPace ? "AHEAD of the ideal pace (spending faster than the flat line)" : "on or under the ideal pace"}.${ctx.incomeLine}
Top spending categories: ${ctx.topCategories || "(none yet)"}.
Current GPA: ${ctx.gpa ? ctx.gpa.toFixed(2) : "n/a"}.
Now: ${ctx.nowClass ?? "no class"}.
Next class: ${ctx.nextClass ?? "none scheduled"}.
Classes today: ${ctx.classesToday || "none"}.
TIMETABLE (their full week, exactly as they entered it):
${ctx.timetable}
Open deadlines:
${deadlineLines}`;

  const shared = `
Rules:
- Ground every answer in the data above. Never invent classes, deadlines or times. If something isn't listed, say so plainly and point to where it lives (Timetable, Tasks, Budget).
- Tailor to this specific student — reference their actual courses, times and deadlines when relevant.
- Vary your wording between replies; never reuse the same opener or formula.`;

  const planRules = `
- Max 3 action items, ordered by urgency vs energy available.
- If a class is running, first item respects it.
- If energy <= 2: protect sleep, lighter plan, no stacked deep work.
- If budget is low: prefer free/low-cost food and ideas.
- Always state exactly one honest trade-off.
- Keep reply under 60 words. No emoji. No markdown.`;

  const chatRules = `
- Answer the actual question asked — plans, explanations, opinions, calculations. Length matches the ask: usually 40–150 words, up to ~300 when they ask for a schedule or step-by-step guide.
- Use line breaks for lists or day-by-day tables; one line per item, aligned and compact (e.g. "Mon  09:00–11:00  PHYS101 (Lab 2)").
- When asked to build, reshape or review a timetable or study schedule: work strictly from TIMETABLE above, show every weekday (flagging free days too), slot study/work blocks around classes and around due deadlines, and call out clashes, back-to-back days or zero-break stretches. If TIMETABLE is empty, tell them to add classes on the Timetable tab first and that you'll build the plan from it right after.
- When they report a change (new class moved, deadline done), acknowledge it and update your view — but only their data changes it, not conversation.
- Money questions: answer with the actual budget numbers above (left this month, safe-to-spend/day, pace, top categories). For "can I afford X", compare X against today's safe-to-spend and say it plainly. If they're ahead of pace, propose one specific cut drawn from their biggest category — concrete amounts, no lectures. Never invent spending figures.
- No emoji unless the user uses them first.`;

  const json = `
Respond with JSON only:
{
  "reply": "your reply; use \\n for line breaks when listing",
  "plan": ${ctx.planMode ? `[{ "title": "short action", "why": "one line reason", "minutes": 30 }] (2-3 items)` : `[] (only include a plan if they asked you to schedule or plan something, max 3)`},
  "tradeoff": ${ctx.planMode ? `"one honest trade-off"` : `"optional — only for real trade-offs"`}
}`;

  return `${data}${shared}${ctx.planMode ? planRules : chatRules}${json}`;
}

async function askGroq(
  userMessage: string,
  history: { role: "user" | "orbit"; text: string }[],
  planMode: boolean
): Promise<AIResult> {
  const settings = await getSettings();
  const [budget, deadlines, energy, { current, next }, todayClasses, allClasses, gpaInfo] = await Promise.all([
    getBudgetState(),
    getOpenDeadlines(),
    getTodayEnergy(),
    getNextClass(),
    getTodayClasses(),
    getAllClasses(),
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

  const timetable = allClasses.length
    ? allClasses
        .map((c) => `${DAY_NAMES[c.day]} ${formatMinutes(c.startMin)}–${formatMinutes(c.endMin)} ${c.name}${c.code ? ` (${c.code})` : ""}${c.location ? ` @ ${c.location}` : ""}`)
        .join("\n")
    : "(no classes entered yet)";

  const sys = systemPrompt({
    name: settings.name,
    energy: energy?.energy ?? null,
    budgetLeft: budget.left,
    currency: budget.currency,
    monthlyBudget: budget.monthlyBudget,
    safeToSpend: budget.safeToSpend,
    overPace: budget.overPace,
    daysLeft: budget.daysLeft,
    dayOfMonth: budget.dayOfMonth,
    daysInMonth: budget.daysInMonth,
    topCategories: budget.byCategory
      .slice(0, 4)
      .map((c) => `${c.name} ${c.total.toFixed(0)}`)
      .join(", "),
    incomeLine:
      settings.incomeAmount && settings.incomeCadence
        ? `\nIncome: ${settings.incomeAmount}${budget.currency} ${settings.incomeCadence}.`
        : "",
    deadlines,
    day,
    nowClass: current ? current.name : undefined,
    nextClass: next ? `${next.name} at ${formatMinutes(next.startMin)}` : undefined,
    classesToday,
    timetable,
    gpa: gpaInfo.gpa,
    planMode,
  });

  const messages = [
    { role: "system", content: sys },
    ...history.slice(-8).map((m) => ({ role: m.role === "orbit" ? "assistant" : "user", content: m.text })),
    { role: "user", content: userMessage },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response | null = null;
    let usedModel = "";
    const doFetch = (model: string) =>
      fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.groqApiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          reasoning_effort: "low",
          max_completion_tokens: 2000,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
    for (const model of MODELS) {
      let attempt = await doFetch(model);
      // 429 = free-tier rate limit — one short pause usually clears it.
      if (attempt.status === 429) {
        await new Promise((r) => setTimeout(r, 1500)).catch(() => {});
        attempt = await doFetch(model);
      }
      usedModel = model;
      if (attempt.ok) {
        res = attempt;
        break;
      }
      // 404 / "model_decommissioned" -> retired model, fall through to next
      const retriable = attempt.status === 404 || attempt.status === 400;
      if (!retriable) {
        res = attempt;
        break;
      }
      const bodyText = await attempt.text().catch(() => "");
      if (/does not exist|decommissioned|model_not_found/i.test(bodyText)) {
        res = null;
        continue;
      }
      res = new Response(bodyText, { status: attempt.status, statusText: attempt.statusText });
      break;
    }

    if (!res) {
      return {
        reply: "AI model unavailable (all configured models rejected). Try again later or remove your key to use offline plans.",
        plan: [],
        source: "ai",
      };
    }

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return {
        reply: `AI request failed (${res.status}${usedModel ? ` · ${usedModel}` : ""}). ${res.status === 401 ? "Check your API key in Settings." : "Try again shortly."} ${err.slice(0, 100)}`.trim(),
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
    const result = await askGroq(userMessage, history, planWanted);
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
