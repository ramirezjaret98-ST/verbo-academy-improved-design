import { USERS, type User } from "./mock-data";
import { loadSessions } from "./sessions-store";
import { teacherStatus, qualifiedProducts } from "./teacher-model";
import { computeTeacherKpis } from "./teacher-kpis";
import { isTeacherAvailableAt } from "./availability-store";

export interface Candidate {
  teacher: User;
  score: number;
}

/** Ranked substitutes for the given session. Admin always picks manually. */
export function findCandidates(sessionId: string): Candidate[] {
  const session = loadSessions().find((s) => s.id === sessionId);
  if (!session) return [];
  const productNeeded = (session.workshop_template_id ? "vip" : null); // best-effort
  const durationMin = session.duration_minutes ?? 60;

  const teachers = USERS.filter((u) => u.role === "teacher");
  const candidates: Candidate[] = [];
  for (const t of teachers) {
    if (t.id === session.teacher_id) continue;
    if (teacherStatus(t) !== "active") continue;
    if (productNeeded) {
      const q = qualifiedProducts(t);
      if (q.length > 0 && !q.includes(productNeeded as never)) continue;
    }
    if (!isTeacherAvailableAt(t.id, session.date_time, durationMin)) continue;
    const score = computeTeacherKpis(t).composite;
    candidates.push({ teacher: t, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}