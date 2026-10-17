# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Stack

Next.js 14 (static export) + Capacitor 8 Android wrapper + Tailwind + Dexie (IndexedDB) + Groq API (llama-3.3-70b). Inferred from existing codebase.

## Users

University students on Android phones. Situation: time-poor, low-budget, energy fluctuates; juggles assignments, exams, part-time money. Job: decide what to do right now given real constraints (energy, money, deadlines) instead of optimising in a vacuum.

## Product Purpose

Orbit is a local-first student life copilot that connects deadlines, weekly budget, and daily energy into one daily plan. Success = the student opens the app, sees their real constraints, and leaves with a doable next move. Data lives on-device (IndexedDB); only AI chat calls leave the phone.

## Positioning

Most student planners track tasks in isolation. Orbit's mechanism: one AI check-in that plans across three constraints at once — energy (1-5), budget left this week, and deadlines in the next 7 days — and always states one honest trade-off. Local-first; API key stored on device only.

## Operating Context

- Used in short bursts between classes, late nights, and on the move.
- Android phone, portrait, edge-to-edge display (status bar overlays require safe-area handling).
- Often offline or on poor campus wifi; core tracking must work without network. AI chat needs network + user's own free Groq API key.
- Free-tier student: weekly budget is real money; AI must respect low budget.

## Capabilities and Constraints

Confirmed capabilities (current + required full build):
- Today dashboard: greeting, energy, budget-left, top deadlines, latest plan.
- AI check-in chat: Groq-powered, JSON plan of max 3 actions, trade-off, energy logging (1-5), persistent chat history.
- Deadlines: add/edit/delete/complete, course, due datetime, estimated hours, overdue states.
- Budget: weekly budget, add/delete expenses, category breakdown, week history, daily average.
- Focus timer (pomodoro-style) for study sessions tied to deadlines.
- Deadline reminders via Android local notifications.
- Settings: name, weekly budget, currency, Groq API key, theme, week start, data export/import (backup), clear data.

Constraints:
- Fully offline-capable except AI chat.
- No accounts, no server, no analytics.
- API key never leaves device except as Bearer header to Groq.
- Ships as signed APK (com.student.orbit).

Undecided product facts: none blocking; all above confirmed from code + user brief.

## Brand Commitments

- Name: Orbit. Voice: warm but direct, like a sharp older student — never corporate.
- User binding constraints (from brief): colours must not read as AI-generated; layout must respect the Android status bar; app icon must be distinctive (not generic); build the FULL feature set, not a beginner subset.
- Existing asset: none binding (old icon rejected by user).

## Evidence on Hand

- Full working codebase in `src/` (5 routes, Dexie DB, Groq client).
- Android Capacitor project in `android/`, signed-build tooling in `../android-tools` (JDK 17/21, SDK 34/36).
- No real user data to show; any demo data must be labelled synthetic.

## Product Principles

1. Constraints first — every plan starts from energy, money, and time actually available.
2. Local-first — the app works on a plane; AI is an enhancement, not a dependency.
3. Honest trade-offs — never pretend everything fits; name what gets dropped.
4. One glance, one move — the home screen answers "what now?" in seconds.
5. Student-real — budgets in real currency, deadlines in real courses, no enterprise jargon.

## Accessibility & Inclusion

Standard mobile a11y: AA contrast, focus-visible states, labelled controls, respects system font scaling. No product-specific requirement established beyond platform norms.
