import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/verbo/ComingSoon";

export const Route = createFileRoute("/student/my-workshop")({
  component: () => <ComingSoon title="My Workshop" />,
});
