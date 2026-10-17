import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import PlatformInit from "@/components/PlatformInit";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Orbit — Campus Copilot",
  description:
    "Local-first campus copilot: day planning, deadlines, budget, energy, focus timer, timetable, and GPA — offline first.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Orbit" },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0e1012",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className="antialiased">
        <div className="mx-auto max-w-md min-h-[100dvh] flex flex-col">
          <main className="flex-1 px-4 pt-4 pb-28">{children}</main>
        </div>
        <BottomNav />
        <ServiceWorkerRegister />
        <PlatformInit />
      </body>
    </html>
  );
}
