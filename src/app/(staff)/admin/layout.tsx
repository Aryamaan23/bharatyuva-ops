import Link from "next/link";
import { AdminNav, type NavItem } from "@/components/admin/nav";
import { Button } from "@/components/ui/button";
import { ADMIN_ROLES, STAFF_ROLES, hasRole, requireStaff } from "@/server/auth/session";

const NAV: (NavItem & { reviewer?: boolean })[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/reviews", label: "My reviews", reviewer: true },
  { href: "/admin/outreach/queue", label: "Today's queue" },
  { href: "/admin/outreach", label: "Partners" },
  { href: "/admin/tasks", label: "Tasks" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/selection", label: "Selection" },
  { href: "/admin/ambassadors", label: "Ambassadors" },
  { href: "/admin/event", label: "Event & after" },
  { href: "/admin/editions", label: "Editions & form", adminOnly: true },
  { href: "/admin/team", label: "Team", adminOnly: true },
  { href: "/admin/data-requests", label: "Data requests", adminOnly: true },
  { href: "/admin/audit", label: "Audit log", adminOnly: true },
  { href: "/admin/settings/gmail", label: "Gmail" },
  { href: "/admin/health", label: "Health" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Reviewers may enter /admin but only see their reviews; every page checks its own roles.
  const session = await requireStaff([...STAFF_ROLES, "reviewer"]);
  const isAdmin = hasRole(session, ...ADMIN_ROLES);
  const isStaff = hasRole(session, ...STAFF_ROLES);
  const isReviewer = hasRole(session, "reviewer");
  const nav = NAV.filter((i) => (isStaff ? (isAdmin || !i.adminOnly) && (!i.reviewer || isReviewer) : i.reviewer));
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-brand-navy text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/admin" className="font-bold">
            Bharat Yuva <span className="text-brand-gold">Ops</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline">
              {session.staff.fullName} · {session.staff.roles.join(", ")}
            </span>
            <form action="/auth/signout" method="post">
              <input type="hidden" name="next" value="/login" />
              <Button type="submit" size="sm" variant="secondary">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row">
        <aside className="md:w-52 md:shrink-0">
          <AdminNav items={nav} />
        </aside>
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
