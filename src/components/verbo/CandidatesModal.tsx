import { useState } from "react";
import { UserCheck } from "lucide-react";
import { AccentModal, AccentModalFooter, GhostButton, PrimaryButton } from "./ui";
import { findCandidates } from "@/lib/substitute-engine";
import { updateSession, getSessionsSnapshot, type ExtSession } from "@/lib/sessions-store";

const HEADER_BG = "linear-gradient(135deg, #01304a 0%, #02466b 100%)";

export function CandidatesModal({
  sessionId,
  onClose,
  onAssigned,
}: {
  sessionId: string;
  onClose: () => void;
  onAssigned?: () => void;
}) {
  const candidates = findCandidates(sessionId);
  const session = getSessionsSnapshot().find((s) => s.id === sessionId);
  const [teamsLink, setTeamsLink] = useState("");
  const assign = (teacherId: string) => {
    const patch: Partial<ExtSession> = {
      teacher_id: teacherId,
      needs_substitute: false,
      covered_by_substitute: true,
      status: "rescheduled",
    };
    if (teamsLink.trim()) patch.teams_link = teamsLink.trim();
    updateSession(sessionId, patch);
    onAssigned?.();
    onClose();
  };
  return (
    <AccentModal
      background={HEADER_BG}
      iconTint="#ffffff"
      icon={UserCheck}
      eyebrow="Session substitution"
      title="Substitute Candidates"
      watermark={{ type: "icon", icon: UserCheck }}
      maxWidth="max-w-lg"
      onClose={onClose}
    >
      <div className="p-6">
        <p className="text-xs text-muted-foreground">
          Qualified, available teachers ranked by Composite Score. Admin picks the substitute.
        </p>

        <div className="mt-4">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            New MS Teams Link (optional)
          </label>
          <input
            value={teamsLink}
            onChange={(e) => setTeamsLink(e.target.value)}
            placeholder={session?.teams_link || "https://teams.microsoft.com/..."}
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          {candidates.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No available substitutes found for this session's date and time.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Teacher</th>
                  <th className="px-4 py-2 font-medium">Composite Score</th>
                  <th className="px-4 py-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.teacher.id} className="border-t border-border">
                    <td className="px-4 py-3 text-foreground">{c.teacher.name}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{c.score}%</td>
                    <td className="px-4 py-3 text-right">
                      <PrimaryButton onClick={() => assign(c.teacher.id)} className="!px-3 !py-1 text-xs">
                        Assign
                      </PrimaryButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AccentModalFooter>
        <GhostButton onClick={onClose}>Close</GhostButton>
      </AccentModalFooter>
    </AccentModal>
  );
}
