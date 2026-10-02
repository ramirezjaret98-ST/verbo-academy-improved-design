import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { loadClubs, subscribeClubs, type Club } from "@/lib/clubs-store";
import { ClubCatalog } from "@/components/verbo/ClubCatalog";

export const Route = createFileRoute("/student/clubs")({ component: Page });

function Page() {
  const { user } = useAuth();
  const [clubs, setClubs] = useState<Club[]>(() => loadClubs());
  useEffect(() => {
    setClubs(loadClubs());
    return subscribeClubs(() => setClubs(loadClubs()));
  }, []);
  if (!user) return null;
  return <ClubCatalog clubs={clubs} studentId={user.id} />;
}
