"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, MessagesSquare, ListTodo, Wallet, LayoutGrid } from "lucide-react";

const items = [
  { href: "/", label: "Today", icon: House },
  { href: "/chat", label: "Chat", icon: MessagesSquare },
  { href: "/deadlines", label: "Tasks", icon: ListTodo },
  { href: "/budget", label: "Money", icon: Wallet },
  { href: "/more", label: "More", icon: LayoutGrid },
];

export default function BottomNav() {
  const path = usePathname();

  // When the chat keyboard is open, tapping a tab first blurs the input;
  // the keyboard resize can move the nav between touchstart and touchend and
  // silently cancel the tap. Blurring at pointer-down starts that resize as
  // early as possible so the nav is stable before the tap completes.
  const blurFocusedInput = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) active.blur();
  };

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 border-t"
      style={{
        background: "var(--nav-bg)",
        borderColor: "var(--card-border)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        paddingBottom: "max(env(safe-area-inset-bottom), 8px)",
      }}
    >
      <div className="mx-auto max-w-md flex px-1">
        {items.map((item) => {
          const active = path === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onPointerDown={blurFocusedInput}
              className="flex-1 flex flex-col items-center gap-0.5 pt-2.5 pb-1.5 text-[10px] font-semibold tracking-wide transition-colors press"
              style={{ color: active ? "var(--accent)" : "var(--muted)" }}
              aria-current={active ? "page" : undefined}
            >
              <span
                className="flex h-7 w-12 items-center justify-center rounded-full transition-colors"
                style={{ background: active ? "var(--accent-soft)" : "transparent" }}
              >
                <Icon size={19} strokeWidth={active ? 2.3 : 1.7} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
