import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/verbo/ComingSoon";

export const Route = createFileRoute("/student/access-levels")({
  component: () => <ComingSoon title="Upgrade Your Access Level" />,
});
