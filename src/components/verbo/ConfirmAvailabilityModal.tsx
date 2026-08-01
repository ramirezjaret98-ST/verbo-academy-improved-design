import { CalendarCheck } from "lucide-react";
import { AccentModal, AccentModalFooter, GhostButton, PrimaryButton } from "./ui";

export function ConfirmAvailabilityModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AccentModal
      maxWidth="max-w-lg"
      background="linear-gradient(135deg, #01304a 0%, #024366 100%)"
      iconTint="rgba(255,255,255,0.16)"
      icon={CalendarCheck}
      eyebrow="Availability"
      title="Confirm Your Availability"
      onClose={onCancel}
    >
      <div className="p-6">
        <ul className="list-disc space-y-2 pl-5 text-sm text-foreground">
          <li>Within your declared hours, you may be assigned students, groups, or substitutions without being asked for permission beforehand.</li>
          <li>By confirming, you're committing to being genuinely available to work during these hours — not just marking them as free time.</li>
          <li>Your schedule is permanent once confirmed and can only be changed with prior Admin approval.</li>
        </ul>
      </div>
      <AccentModalFooter accent="#01304a">
        <GhostButton onClick={onCancel}>Cancel</GhostButton>
        <PrimaryButton onClick={onConfirm}>Confirm Availability</PrimaryButton>
      </AccentModalFooter>
    </AccentModal>
  );
}
