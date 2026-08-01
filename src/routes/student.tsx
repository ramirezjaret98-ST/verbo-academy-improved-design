import { useEffect } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RoleGuard } from "@/components/verbo/RoleGuard";
import { PageTransition } from "@/components/verbo/PageTransition";
import { TopNav, type NavEntry } from "@/components/verbo/TopNav";
import { AnnouncementBanner } from "@/components/verbo/AnnouncementBanner";
import { Footer } from "@/components/verbo/Footer";
import { BadgeUnlockWatcher } from "@/components/verbo/BadgeUnlockCelebration";
import { useAuth } from "@/lib/auth";
import { touchLoginStreak } from "@/lib/login-streak-store";

export const Route = createFileRoute("/student")({
  component: StudentLayout,
});

function StudentLayout() {
  const { user } = useAuth();
  const productType = user?.product_type ?? "performance";
  const isVIP = user?.product === "vip";

  // Register the daily visit once per mounted student session.
  useEffect(() => {
    if (user?.role === "student") touchLoginStreak(user.id);
  }, [user?.id, user?.role]);


  let items: NavEntry[] = [];
  if (productType === "insights") {
    items = [
      { to: "/student", label: "Dashboard" },
      { to: "/student/insights", label: "Insights" },
    ];
  } else if (productType === "workshops") {
    items = [
      { to: "/student", label: "Dashboard" },
      { to: "/student/my-workshop", label: "My Workshop" },
    ];
  } else {
    // performance
    items = [
      { to: "/student", label: "Dashboard" },
      { to: "/student/sessions", label: "Sessions & Events" },
      isVIP
        ? { to: "/student/my-course", label: "My Course" }
        : { to: "/student/courses", label: "Learning Path" },
      { to: "/student/resources", label: "Resources" },
      { to: "/student/challenges", label: "Challenges" },
    ];
  }

  return (
    <RoleGuard allow="student">
      <BadgeUnlockWatcher />
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
          nav={[{
            label: "Student",
            items: items.flatMap((i) => ("to" in i ? [{ label: i.label, to: i.to }] : [])),
          }]}
        />
      </div>

    </RoleGuard>
  );
}
