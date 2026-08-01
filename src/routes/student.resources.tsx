import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useMaterials, visibleForStudent } from "@/lib/materials-store";
import { MaterialLibrary } from "@/components/verbo/MaterialLibrary";
import { PREMIUM_ACCESS } from "@/components/verbo/PremiumGate";

export const Route = createFileRoute("/student/resources")({ component: Page });

function Page() {
  const { user } = useAuth();
  const all = useMaterials();
  const items = useMemo(
    () => visibleForStudent(all, user?.product, user?.current_roadmap_level),
    [all, user?.product, user?.current_roadmap_level],
  );
  const hasPremiumAccess = PREMIUM_ACCESS.includes(user?.access_plan ?? "");
  return <MaterialLibrary items={items} title="Resources" hasPremiumAccess={hasPremiumAccess} />;
}
