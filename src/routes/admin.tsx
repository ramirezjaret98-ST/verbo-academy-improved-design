import { createFileRoute, Outlet, useRouterState, Navigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Footer } from "@/components/verbo/Footer";
import { RoleGuard } from "@/components/verbo/RoleGuard";
import { PageTransition } from "@/components/verbo/PageTransition";
import { TopNav, type NavEntry } from "@/components/verbo/TopNav";
import { useAuth } from "@/lib/auth";
import {
  hydrateAdminRoles, getAdminType, canAccessAdminPath, defaultAdminLanding,
} from "@/lib/admin-roles";

export const Route = createFileRoute("/admin")({ component: Layout });

type NavItem = { to: string; label: string; exact?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  { label: "Dashboard", items: [{ to: "/admin", label: "Dashboard", exact: true }] },
  { label: "Students", items: [
    { to: "/admin/students", label: "Students" },
    { to: "/admin/groups",   label: "Groups" },
    { to: "/admin/sessions", label: "Sessions" },
    { to: "/admin/profile-badges", label: "Profile Badges" },
  ]},
  { label: "Teachers", items: [
    { to: "/admin/teachers", label: "Teachers" },
    { to: "/admin/kpis",     label: "KPIs" },
  ]},
  { label: "Content", items: [
    { to: "/admin/courses",    label: "Courses" },
    { to: "/admin/workshops",  label: "Focus Workshops" },
    { to: "/admin/challenges", label: "Challenges" },
    { to: "/admin/flash",      label: "Verbo Flash" },
    { to: "/admin/materials",  label: "Material Complementario" },
  ]},
  { label: "Clubs", items: [{ to: "/admin/clubs", label: "Clubs" }] },
  { label: "Calendar", items: [
    { to: "/admin/calendar", label: "Overview" },
    { to: "/admin/holidays", label: "Holidays" },
  ]},
  { label: "Financial", items: [
    { to: "/admin/financial/money-lab", label: "The Money Lab" },
  ]},
  { label: "Users", items: [{ to: "/admin/users", label: "User Management" }] },
  { label: "Activity", items: [
    { to: "/admin/activity-logs", label: "Activity Logs" },
    { to: "/admin/conduct-reports", label: "Conduct Reports" },
    { to: "/admin/content-issue-reports", label: "Technical Issues" },
  ]},
];

function Layout() {
  hydrateAdminRoles();
  const { user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const adminType = getAdminType(user);

  const visibleGroups = useMemo(() => {
    if (!adminType) return [] as NavGroup[];
    return NAV_GROUPS.filter((g) => {
      if (g.label === "Users" || g.label === "Activity") return adminType === "super_admin";
      // A group is visible if any of its items is allowed for this admin type.
      return g.items.some((it) => canAccessAdminPath(adminType, it.to));
    }).map((g) => ({
      ...g,
      items: g.items.filter((it) => canAccessAdminPath(adminType!, it.to)),
    }));
  }, [adminType]);

  // Same nav shape as the student/teacher panels: single-item groups become
  // plain tabs, multi-item groups become dropdowns.
  const navEntries: NavEntry[] = visibleGroups.map((g) =>
    g.items.length === 1
      ? { to: g.items[0].to, label: g.label }
      : { label: g.label, items: g.items.map((it) => ({ to: it.to, label: it.label })) },
  );

  // Guard against direct URL access to forbidden sections.
  if (adminType && !canAccessAdminPath(adminType, pathname)) {
    return <Navigate to={defaultAdminLanding(adminType)} />;
  }

  return (
    <RoleGuard allow="admin">
      <TopNav variant="dark" items={navEntries} />
      <div className="flex min-h-screen flex-col" style={{ backgroundColor: "#f4f6f8" }}>
        <main className="mx-auto w-full max-w-7xl flex-1 pt-24 pb-10">
          <div className="px-6">
            <PageTransition>
              <Outlet />
            </PageTransition>
          </div>
        </main>
        <Footer
          nav={visibleGroups.map((g) => ({
            label: g.label,
            items: g.items.map((it) => ({ label: it.label, to: it.to })),
          }))}
        />
      </div>

    </RoleGuard>
  );
}
