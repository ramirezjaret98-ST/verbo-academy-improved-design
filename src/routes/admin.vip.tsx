import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Crown } from "lucide-react";
import { CustomUnitAdminPage, type CustomUnitAdminConfig } from "@/components/verbo/CustomUnitAdminBuilder";

export const Route = createFileRoute("/admin/vip")({
  component: Page,
  validateSearch: (s: Record<string, unknown>) => ({
    student: typeof s.student === "string" ? s.student : undefined,
  }),
});

const VIP_CONFIG: CustomUnitAdminConfig = {
  kind: "vip",
  pageTitle: "Course Builder VIP",
  pageSubtitle: "Personalized courses for VIP students. Add units, video and activities week by week.",
  listEmptyTitle: "No VIP students yet.",
  listEmptySubtitle: "This section activates once a student is set to product “VIP”.",
  backToListLabel: "Back to VIP students",
  studentBadgeLabel: "VIP",
  studentBadgeIcon: Crown,
  unitLabel: "VIP unit",
  uploadFolder: "vip-units",
  coverUploadFolder: "vip-course-cover",
  accent: {
    background: "linear-gradient(135deg, #f38934 0%, #c2410c 100%)",
    solid: "#f38934",
    icon: Crown,
    eyebrow: "VIP Course Builder",
  },
  matchesStudent: (u) => u.product === "vip",
};

function Page() {
  const { student } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <CustomUnitAdminPage
      config={VIP_CONFIG}
      studentId={student}
      onSelectStudent={(id) => navigate({ to: "/admin/vip", search: { student: id } })}
      onBack={() => navigate({ to: "/admin/vip", search: () => ({ student: undefined }) })}
    />
  );
}
