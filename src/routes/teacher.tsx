import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/verbo/RoleGuard";
import { PageTransition } from "@/components/verbo/PageTransition";
import { Footer } from "@/components/verbo/Footer";
import { TopNav, NavItem, NavGroup } from "@/components/verbo/TopNav";
import { AnnouncementBanner } from "@/components/verbo/AnnouncementBanner";
import { useAuth } from "@/lib/auth";
import { USERS } from "@/lib/mock-data";
import { assignedStudentIdsFor, hydrateAssignments, subscribeAssignments } from "@/lib/assignments-store";

export const Route = createFileRoute("/teacher")({ component: Layout });

function Layout() {
  const { user } = useAuth();
  const [, tick] = useState(0);

  // Nav items depend on which products this teacher's assigned students
  // have — re-render when the assignments store (re)hydrates or changes.
  useEffect(() => {
    hydrateAssignments();
    return subscribeAssignments(() => tick((n) => n + 1));
  }, []);

  const assignedStudents = user
    ? USERS.filter((u) => u.role === "student" && assignedStudentIdsFor(user.id).includes(u.id))
    : [];
  const hasVipStudent = assignedStudents.some((u) => u.product === "vip");
  const hasEliteStudent = assignedStudents.some((u) => u.access_plan === "Elite");

  const academicItems: NavItem[] = [
    { to: "/teacher/students", label: "My Students" },
    { to: "/teacher/performance-sessions", label: "Performance Sessions" },
    { to: "/teacher/challenges", label: "Challenges" },
    { to: "/teacher/flash", label: "Verbo Flash" },
    { to: "/teacher/materials", label: "Materials" },
    { to: "/teacher/workshops", label: "Focus Workshops" },
    ...(hasVipStudent ? [{ to: "/teacher/vip", label: "Course Builder VIP" }] : []),
    ...(hasEliteStudent ? [{ to: "/teacher/tailored-content", label: "Tailored Content" }] : []),
    { to: "/teacher/clubs", label: "Clubs" },
  ];

  const items: (NavItem | NavGroup)[] = [
    { to: "/teacher", label: "Dashboard" },
    { to: "/teacher/calendar", label: "Calendar" },
    { label: "Academic", items: academicItems },
    { to: "/teacher/financial", label: "Financial" },
  ];

  return (
    <RoleGuard allow="teacher">
      <TopNav variant="dark" items={items} />
      <div className="flex min-h-screen flex-col" style={{ backgroundColor: "#f4f6f8" }}>
        <main className="mx-auto w-full max-w-7xl flex-1 pt-24 pb-10">
          <div className="px-6">
            <AnnouncementBanner />
            <PageTransition>
              <Outlet />
            </PageTransition>
          </div>
        </main>

        <Footer
          nav={[
            {
              label: "Teacher",
              items: items
                .filter((i): i is NavItem => "to" in i)
                .map((i) => ({ label: i.label, to: i.to })),
            },
            { label: "Academic", items: academicItems.map((i) => ({ label: i.label, to: i.to })) },
          ]}
        />
      </div>

    </RoleGuard>
  );
}
