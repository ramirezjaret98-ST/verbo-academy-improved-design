import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { CustomUnitAdminPage, type CustomUnitAdminConfig } from "@/components/verbo/CustomUnitAdminBuilder";

export const Route = createFileRoute("/admin/tailored-content")({
  component: Page,
  validateSearch: (s: Record<string, unknown>) => ({
    student: typeof s.student === "string" ? s.student : undefined,
  }),
});

const TAILORED_CONFIG: CustomUnitAdminConfig = {
  kind: "tailored",
  pageTitle: "Tailored Content",
  pageSubtitle: "Personalized units for Elite students, added on top of their regular syllabus.",
  listEmptyTitle: "No Elite students yet.",
  listEmptySubtitle: "This section activates once a student is set to access plan “Elite”.",
  backToListLabel: "Back to Elite students",
  studentBadgeLabel: "Elite",
  studentBadgeIcon: Sparkles,
  unitLabel: "Tailored unit",
  uploadFolder: "tailored-units",
  coverUploadFolder: "tailored-course-cover",
  accent: {
    background: "linear-gradient(135deg, #f38934 0%, #7c2d12 100%)",
    solid: "#f38934",
    icon: Sparkles,
    eyebrow: "Tailored Content",
  },
  matchesStudent: (u) => u.access_plan === "Elite",
};

function Page() {
  const { student } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <CustomUnitAdminPage
      config={TAILORED_CONFIG}
      studentId={student}
      onSelectStudent={(id) => navigate({ to: "/admin/tailored-content", search: { student: id } })}
      onBack={() => navigate({ to: "/admin/tailored-content", search: () => ({ student: undefined }) })}
    />
  );
}
