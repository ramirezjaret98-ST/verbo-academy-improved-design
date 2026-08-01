import { useState } from "react";
import { GhostButton, PrimaryButton, AccentModalHeader } from "@/components/verbo/ui";
import { LifeBuoy, Bug } from "lucide-react";
import {
  addContentIssueReport,
  UNIT_ISSUE_TYPES,
  CHALLENGE_ISSUE_TYPES,
  type ContentIssueType,
  type ContentIssueEntityType,
} from "@/lib/content-issue-reports-store";

/** Same navy the design system resolves for `bg-primary`. */
const NAVY = "#01304a";

interface Props {
  studentId: string;
  entityType: ContentIssueEntityType;
  entityId: string;
  entityTitle: string;
  open: boolean;
  onClose: () => void;
}

export function ReportContentIssueModal({ studentId, entityType, entityId, entityTitle, open, onClose }: Props) {
  const issueOptions: readonly ContentIssueType[] =
    entityType === "challenge" ? CHALLENGE_ISSUE_TYPES : UNIT_ISSUE_TYPES;
  const [issueType, setIssueType] = useState<ContentIssueType | "">("");
  const [detail, setDetail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setIssueType("");
    setDetail("");
    setSubmitted(false);
    setError(null);
    onClose();
  };

  const handleSubmit = () => {
    if (!issueType) {
      setError("Please select what went wrong.");
      return;
    }
    setError(null);
    addContentIssueReport({ studentId, entityType, entityId, entityTitle, issueType, detail });
    setSubmitted(true);
  };

  if (!open) return null;

  return (
    <div className="verbo-overlay-in fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4">
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card shadow-floating">
        <AccentModalHeader
          background={NAVY}
          iconTint={NAVY}
          icon={LifeBuoy}
          eyebrow="TECHNICAL ISSUE"
          title="Report a technical issue"
          watermark={{ type: "icon", icon: Bug }}
          onClose={handleClose}
        />

        <div className="px-6 py-5">
          {submitted ? (
            <div className="space-y-3">
              <p className="vc-rise text-sm text-foreground" style={{ animationDelay: "0.25s" }}>
                Thanks — we've logged this and our team will take a look.
              </p>
              <div className="flex justify-end pt-2">
                <PrimaryButton onClick={handleClose} style={{ backgroundColor: NAVY, color: "#fff" }}>
                  Close
                </PrimaryButton>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p
                className="vc-rise text-xs leading-relaxed text-muted-foreground"
                style={{ animationDelay: "0.25s" }}
              >
                Something not working in <strong className="text-foreground">{entityTitle}</strong>? Tell us
                what happened so we can fix it.
              </p>

              <div className="vc-rise" style={{ animationDelay: "0.3s" }}>
                <label className="mb-1 block text-xs font-medium text-foreground">What went wrong?</label>
                <select
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value as ContentIssueType)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground shadow-soft transition-shadow focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select an issue</option>
                  {issueOptions.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="vc-rise" style={{ animationDelay: "0.35s" }}>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Details <span className="text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  rows={4}
                  placeholder="Anything else that helps us reproduce the problem."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground shadow-soft transition-shadow focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <GhostButton onClick={handleClose}>Cancel</GhostButton>
                <PrimaryButton
                  onClick={handleSubmit}
                  disabled={!issueType}
                  style={{ backgroundColor: NAVY, color: "#fff" }}
                >
                  Send report
                </PrimaryButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
