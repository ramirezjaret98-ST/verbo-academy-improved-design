import { createFileRoute } from "@tanstack/react-router";
import { useMaterials } from "@/lib/materials-store";
import { MaterialLibrary } from "@/components/verbo/MaterialLibrary";

export const Route = createFileRoute("/teacher/materials")({ component: Page });

function Page() {
  const items = useMaterials();
  return <MaterialLibrary items={items} title="Materials" />;
}
