"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Timer, CalendarDays, GraduationCap, Settings } from "lucide-react";
import { getSettings, type Settings as SettingsT } from "@/lib/db";

const tools = [
  {
    href: "/focus",
    icon: Timer,
    title: "Focus timer",
    desc: "Pomodoro sessions tied to your deadlines",
  },
  {
    href: "/timetable",
    icon: CalendarDays,
    title: "Timetable",
    desc: "Weekly class schedule, shown on Today",
  },
  {
    href: "/grades",
    icon: GraduationCap,
    title: "Grades & GPA",
    desc: "Track credits and calculate GPA locally",
  },
  {
    href: "/settings",
    icon: Settings,
    title: "Settings",
    desc: "API key, currency, budget, backup",
  },
];

export default function MorePage() {
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<SettingsT | null>(null);

  useEffect(() => {
    setMounted(true);
    getSettings().then(setSettings);
  }, []);

  if (!mounted) return null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[26px] font-bold tracking-tight">More</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
          Tools that keep campus life on rails
        </p>
      </header>

      <section className="space-y-2.5">
        {tools.map((t) => {
          const Icon = t.icon;
          return (
            <Link prefetch={false} key={t.href} href={t.href} className="card flex items-center gap-3.5 press block">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                <Icon size={20} />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-[15px]">{t.title}</span>
                <span className="block text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  {t.desc}
                </span>
              </span>
            </Link>
          );
        })}
      </section>

      <section className="card-flat space-y-3">
        <h2 className="label-cap">This device</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-bold tnum" style={{ color: "var(--accent)" }}>
              {settings ? `${settings.currency ?? "$"}${settings.weeklyBudget}` : "—"}
            </p>
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>
              weekly budget
            </p>
          </div>
          <div>
            <p className="text-lg font-bold" style={{ color: "var(--success)" }}>
              On
            </p>
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>
              local-first
            </p>
          </div>
          <div>
            <p className="text-lg font-bold" style={{ color: "var(--foreground)" }}>
              {settings?.groqApiKey ? "AI" : "Off"}
            </p>
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>
              AI chat
            </p>
          </div>
        </div>
      </section>

      <p className="text-xs text-center pb-2" style={{ color: "var(--muted)" }}>
        Orbit · v1.0 · No account, no server. Your data lives on this device.
      </p>
    </div>
  );
}
