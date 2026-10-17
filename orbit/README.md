# Orbit — Campus Copilot

A local-first planning companion for university students. Orbit keeps your day, your money and your energy in one place, works with zero signal, and only reaches the network when you explicitly ask it to.

## Features

- **Today** — an offline-first three-move day plan built from your deadlines, timetable and current energy level.
- **AI chat** — optional Groq-powered assistant for planning and questions. Bring your own API key; without one, the app still runs fully offline.
- **Deadlines** — CRUD for assignments and exams, with local notifications for reminders.
- **Budget** — spending log, weekly and monthly totals, and a running balance against a budget you set.
- **Focus timer** — timed focus sessions recorded to your local history.
- **Timetable** — weekly class schedule with a "current / next class" view.
- **GPA calculator** — credit-weighted GPA from your entered grades.
- **Settings** — profile, currency and API key, plus export / import / clear for full-data backup.

## Tech stack

- **Next.js 14** (App Router) with `output: "export"` — a fully static site in `out/`.
- **Tailwind CSS** for styling; warm ink + amber "library lamp" palette.
- **Dexie / IndexedDB** for all persistent state — nothing is sent anywhere by default.
- **Capacitor 8** for the Android build (`com.student.orbit`).
- **PWA** — web app manifest and a cache-first service worker for offline use.

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000. The service worker is only registered in production builds.

## Building the web app

```bash
npm run build
```

The static export is written to `out/`. Deploy that folder to any static host.

## Building the Android APK

JDK and Android SDK are checked into the sibling `../android-tools` folder (`jdk-21.0.12.1+1`, `android-sdk`), and `android/local.properties` already points at that SDK.

```bash
npm run cap:sync      # npm run build && npx cap sync
cd android
./gradlew assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/`.

## Privacy

All of your data — tasks, spending, timetable, grades, chat history and settings — is stored on your device in IndexedDB. There is no Orbit backend and no analytics. The only request that leaves the phone is the optional AI chat call to `api.groq.com`, which happens only when you use the chat and only if you have entered your own Groq API key. That key is stored locally in your device storage and is never transmitted anywhere else. Export your data from Settings if you want a portable backup.

## Why offline-first planning

Campus buildings, lecture halls and buses are exactly where the signal drops. A planner that needs a round trip to a server is useless in the ten minutes before a deadline. Orbit keeps the entire working set on the device, so the Today plan, your budget and the focus timer respond instantly and keep working in airplane mode. The network is an optional upgrade for one feature — the AI chat — not a dependency of the core app.

## Regenerating app icons

The launcher icon, adaptive icon and PWA icons are generated from a single source of truth:

```bash
node scripts/gen-icons.mjs
```

It writes `public/icon.svg`, the PWA PNGs, the Android vector drawables and the density-specific `mipmap-*` fallbacks using only Node built-ins.
