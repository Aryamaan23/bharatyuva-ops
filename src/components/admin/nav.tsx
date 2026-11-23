"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; adminOnly?: boolean };

export function AdminNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map((item) => {
        // Longest matching prefix wins, so /admin/outreach/queue doesn't also light up "Partners".
        const best = items.filter((i) => (i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href))).sort((a, b) => b.href.length - a.href.length)[0];
        const active = best?.href === item.href;
        return (
          <Link
            key={item.href}
            href={item.href as never}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium",
              active ? "bg-brand-navy text-white" : "text-foreground hover:bg-secondary",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
