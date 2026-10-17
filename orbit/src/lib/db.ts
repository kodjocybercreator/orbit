import Dexie, { type Table } from "dexie";

export interface Deadline {
  id?: number;
  title: string;
  course?: string;
  dueAt: number;
  estimatedHours?: number;
  done: boolean;
  createdAt: number;
}

export interface Expense {
  id?: number;
  amount: number;
  category: string;
  note?: string;
  spentAt: number;
}

export interface EnergyLog {
  id?: number;
  date: string;
  energy: number;
  mood?: string;
  note?: string;
}

export interface PlanItem {
  title: string;
  why: string;
  minutes: number;
}

export interface CheckIn {
  id?: number;
  date: string;
  userMessage: string;
  aiReply: string;
  plan?: PlanItem[];
  tradeoff?: string;
  createdAt: number;
}

export interface ChatMessage {
  id?: number;
  role: "user" | "orbit";
  text: string;
  plan?: PlanItem[];
  tradeoff?: string;
  createdAt: number;
}

export interface ClassEntry {
  id?: number;
  name: string;
  code?: string;
  location?: string;
  day: number; // 0=Sunday … 6=Saturday
  startMin: number; // minutes from midnight, e.g. 540 = 9:00
  endMin: number;
  color?: string;
}

export interface FocusSession {
  id?: number;
  deadlineId?: number;
  label: string;
  minutes: number;
  completed: boolean;
  createdAt: number;
}

export interface GradeCourse {
  id?: number;
  name: string;
  credits: number;
  letter: string; // A+, A, B+ …
  semester?: string;
}

export interface Settings {
  id: number;
  name?: string;
  weeklyBudget: number;
  groqApiKey?: string;
  currency?: string;
  weekStart?: 0 | 1; // 0=Sunday, 1=Monday
  notificationsOn?: boolean;
  onboarded?: boolean;
  updateFeedUrl?: string;
}

export class OrbitDB extends Dexie {
  deadlines!: Table<Deadline, number>;
  expenses!: Table<Expense, number>;
  energyLogs!: Table<EnergyLog, number>;
  checkIns!: Table<CheckIn, number>;
  chatMessages!: Table<ChatMessage, number>;
  classes!: Table<ClassEntry, number>;
  focusSessions!: Table<FocusSession, number>;
  gradeCourses!: Table<GradeCourse, number>;
  settings!: Table<Settings, number>;

  constructor() {
    super("orbit-db");
    this.version(2).stores({
      deadlines: "++id, title, course, dueAt, done, createdAt",
      expenses: "++id, amount, category, spentAt",
      energyLogs: "++id, date, energy",
      checkIns: "++id, date, createdAt",
      chatMessages: "++id, role, createdAt",
      classes: "++id, name, day, startMin",
      focusSessions: "++id, deadlineId, completed, createdAt",
      gradeCourses: "++id, name, semester",
      settings: "id",
    });
  }
}

export const db = new OrbitDB();

export async function getSettings(): Promise<Settings> {
  const existing = await db.settings.get(1);
  if (existing) return existing;
  return { id: 1, weeklyBudget: 50, currency: "$", weekStart: 0, notificationsOn: true };
}

export async function saveSettings(s: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...s, id: 1 });
}

export function weekStart(ts = Date.now(), weekStartDay: 0 | 1 = 0): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() - weekStartDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

export async function getBudgetState() {
  const settings = await getSettings();
  const start = weekStart(Date.now(), settings.weekStart ?? 0);
  const weekExpenses = await db.expenses.where("spentAt").aboveOrEqual(start).toArray();
  const spent = weekExpenses.reduce((sum, e) => sum + e.amount, 0);
  const left = settings.weeklyBudget - spent;
  return {
    weeklyBudget: settings.weeklyBudget,
    spent,
    left,
    currency: settings.currency || "$",
    expenses: weekExpenses,
  };
}

export async function getUpcomingDeadlines(days = 7): Promise<Deadline[]> {
  const now = Date.now();
  const until = now + days * 24 * 60 * 60 * 1000;
  return db.deadlines
    .where("dueAt")
    .between(now, until)
    .and((d) => !d.done)
    .sortBy("dueAt");
}

export async function getOpenDeadlines(): Promise<Deadline[]> {
  const all = await db.deadlines.toArray();
  return all.filter((d) => !d.done).sort((a, b) => a.dueAt - b.dueAt);
}

export async function getTodayEnergy(): Promise<EnergyLog | undefined> {
  const today = todayKey();
  return db.energyLogs.where("date").equals(today).first();
}

export async function logEnergy(level: number): Promise<void> {
  const date = todayKey();
  const updated = await db.energyLogs.where("date").equals(date).modify({ energy: level });
  if (!updated) await db.energyLogs.add({ date, energy: level });
}

export function todayKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatMinutes(min: number): string {
  const normalized = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const period = h >= 12 ? "pm" : "am";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** Today's classes sorted by start time. */
export async function getTodayClasses(): Promise<ClassEntry[]> {
  const day = new Date().getDay();
  const all = await db.classes.where("day").equals(day).toArray();
  return all.sort((a, b) => a.startMin - b.startMin);
}

/** Next class right now or later today; falls back to tomorrow's first class. */
export async function getNextClass(): Promise<{ current?: ClassEntry; next?: ClassEntry }> {
  const now = nowMinutes();
  const today = await getTodayClasses();
  const current = today.find((c) => now >= c.startMin && now < c.endMin);
  const next = today.find((c) => c.startMin > now);
  if (current || next) return { current, next };
  for (let i = 1; i <= 7; i++) {
    const day = (new Date().getDay() + i) % 7;
    const list = (await db.classes.where("day").equals(day).toArray()).sort(
      (a, b) => a.startMin - b.startMin
    );
    if (list.length) return { next: list[0] };
  }
  return {};
}

/** Full weekly timetable, sorted by day then start time. */
export async function getAllClasses(): Promise<ClassEntry[]> {
  const all = await db.classes.toArray();
  return all.sort((a, b) => a.day - b.day || a.startMin - b.startMin);
}

export const LETTER_POINTS: Record<string, number> = {
  "A+": 4.0, A: 4.0, "A-": 3.7,
  "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7,
  "D+": 1.3, D: 1.0, "D-": 0.7,
  F: 0.0,
};

export async function getGpa(): Promise<{ gpa: number; credits: number; courses: GradeCourse[] }> {
  const courses = await db.gradeCourses.toArray();
  let points = 0;
  let credits = 0;
  for (const c of courses) {
    const lp = LETTER_POINTS[c.letter];
    if (lp === undefined || !c.credits) continue;
    points += lp * c.credits;
    credits += c.credits;
  }
  return { gpa: credits ? points / credits : 0, credits, courses };
}

export function formatDue(dueAt: number): string {
  if (!Number.isFinite(dueAt)) return "No date";
  const a = new Date(dueAt);
  a.setHours(0, 0, 0, 0);
  const b = new Date();
  b.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((a.getTime() - b.getTime()) / 86_400_000);
  if (dayDiff < 0) return "Overdue";
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Tomorrow";
  if (dayDiff < 7) return `In ${dayDiff} days`;
  return new Date(dueAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Winding down";
}

export async function exportAllData(): Promise<string> {
  const [deadlines, expenses, energyLogs, checkIns, chatMessages, classes, focusSessions, gradeCourses, settings] =
    await Promise.all([
      db.deadlines.toArray(),
      db.expenses.toArray(),
      db.energyLogs.toArray(),
      db.checkIns.toArray(),
      db.chatMessages.toArray(),
      db.classes.toArray(),
      db.focusSessions.toArray(),
      db.gradeCourses.toArray(),
      getSettings(),
    ]);
  const backupSettings: Partial<Settings> = { ...settings };
  delete backupSettings.groqApiKey;
  return JSON.stringify(
    { v: 2, exportedAt: Date.now(), deadlines, expenses, energyLogs, checkIns, chatMessages, classes, focusSessions, gradeCourses, settings: backupSettings },
    null,
    2
  );
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cleanRows<T extends { id?: number }>(rows: unknown, requireFn?: (r: Record<string, unknown>) => boolean): T[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is Record<string, unknown> => isPlainObject(r))
    .filter((r) => (requireFn ? requireFn(r) : true))
    .map((r) => {
      const { id, ...rest } = r;
      return (typeof id === "number" ? { id, ...rest } : rest) as T;
    });
}

export async function importAllData(json: string): Promise<void> {
  const data = JSON.parse(json);
  if (!isPlainObject(data) || !data.v) {
    throw new Error("Not a valid Orbit backup file.");
  }

  const finite = (k: string) => (r: Record<string, unknown>) => Number.isFinite(r[k] as number);
  const deadlines = cleanRows<Deadline>(data.deadlines, finite("dueAt"));
  const expenses = cleanRows<Expense>(data.expenses, (r) => finite("spentAt")(r) && typeof r.amount === "number" && r.amount > 0);
  const energyLogs = cleanRows<EnergyLog>(data.energyLogs, (r) => typeof r.date === "string" && Number.isFinite(r.energy as number));
  const chatMessages = cleanRows<ChatMessage>(data.chatMessages, (r) => (r.role === "user" || r.role === "orbit") && Number.isFinite(r.createdAt as number));
  const checkIns = cleanRows<CheckIn>(data.checkIns, finite("createdAt"));
  const classes = cleanRows<ClassEntry>(data.classes, (r) => Number.isFinite(r.day as number) && Number.isFinite(r.startMin as number) && Number.isFinite(r.endMin as number));
  const focusSessions = cleanRows<FocusSession>(data.focusSessions, finite("createdAt"));
  const gradeCourses = cleanRows<GradeCourse>(data.gradeCourses, (r) => typeof r.letter === "string" && Object.hasOwn(LETTER_POINTS, r.letter) && Number.isFinite(r.credits as number) && (r.credits as number) > 0);

  let settingsPatch: Partial<Settings> | undefined;
  if (isPlainObject(data.settings)) {
    const s = data.settings;
    settingsPatch = {};
    if (typeof s.name === "string") settingsPatch.name = s.name.slice(0, 60);
    if (Number.isFinite(s.weeklyBudget as number) && (s.weeklyBudget as number) > 0) settingsPatch.weeklyBudget = s.weeklyBudget as number;
    if (typeof s.currency === "string" && s.currency.length > 0) settingsPatch.currency = s.currency.slice(0, 4);
    if (s.weekStart === 0 || s.weekStart === 1) settingsPatch.weekStart = s.weekStart;
    if (typeof s.groqApiKey === "string" && s.groqApiKey) settingsPatch.groqApiKey = s.groqApiKey;
    if (typeof s.updateFeedUrl === "string" && /^https?:\/\//.test(s.updateFeedUrl)) settingsPatch.updateFeedUrl = s.updateFeedUrl.slice(0, 300);
  }

  await db.transaction(
    "rw",
    db.deadlines,
    db.expenses,
    db.energyLogs,
    db.checkIns,
    db.chatMessages,
    async () => {
      await db.deadlines.bulkPut(deadlines);
      await db.expenses.bulkPut(expenses);
      await db.energyLogs.bulkPut(energyLogs);
      await db.chatMessages.bulkPut(chatMessages);
      await db.checkIns.bulkPut(checkIns);
    }
  );
  await db.transaction(
    "rw",
    db.classes,
    db.focusSessions,
    db.gradeCourses,
    db.settings,
    async () => {
      await db.classes.bulkPut(classes);
      await db.focusSessions.bulkPut(focusSessions);
      await db.gradeCourses.bulkPut(gradeCourses);
      if (settingsPatch) {
        const current = await getSettings();
        await db.settings.put({ ...current, ...settingsPatch, id: 1 });
      }
    }
  );
}

export async function clearAllData(): Promise<void> {
  await db.transaction(
    "rw",
    db.deadlines,
    db.expenses,
    db.energyLogs,
    db.checkIns,
    db.chatMessages,
    async () => {
      await db.deadlines.clear();
      await db.expenses.clear();
      await db.energyLogs.clear();
      await db.checkIns.clear();
      await db.chatMessages.clear();
    }
  );
  await db.transaction(
    "rw",
    db.classes,
    db.focusSessions,
    db.gradeCourses,
    db.settings,
    async () => {
      await db.classes.clear();
      await db.focusSessions.clear();
      await db.gradeCourses.clear();
      await db.settings.clear();
    }
  );
}
