// Preserve old Insights links while the standalone product now covers Clubs.
import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/student/insights")({
  component: () => <Navigate to="/student/clubs" replace />,
});
