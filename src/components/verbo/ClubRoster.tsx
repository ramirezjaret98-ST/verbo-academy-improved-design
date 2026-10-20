import { useEffect, useState } from "react";
import { Users, UserMinus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { loadClubRoster, removeClubAttendee, type ClubAttendee } from "@/lib/club-roster";
import { subscribeBookings } from "@/lib/club-bookings-store";
import { notifySuccess } from "@/lib/notify";
import { GhostButton, PrimaryButton } from "./ui";

export function ClubRoster({
  clubId,
  editable = false,
  reported = false,
}: {
  clubId: string;
  editable?: boolean;
  reported?: boolean;
}) {
  const { user } = useAuth();
  const identity = `${user?.id ?? ""}:${clubId}`;
  const [snapshot, setSnapshot] = useState<{ identity: string; rows: ClubAttendee[] } | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [removing, setRemoving] = useState<ClubAttendee | null>(null);
  const [returnCredit, setReturnCredit] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const rows = await loadClubRoster(clubId);
        if (active) {
          setSnapshot({ identity, rows });
          setError("");
        }
      } catch {
        if (active) setError("Could not load attendees. Please retry.");
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const unsubscribe = subscribeBookings(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 30_000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [clubId, identity, revision]);
  const rows = snapshot?.identity === identity ? snapshot.rows : null;
  const canRemove =
    editable &&
    !reported &&
    user?.role === "admin" &&
    ["super_admin", "coordinator_ops"].includes(user.admin_type ?? "");
  const confirm = async () => {
    if (!removing || returnCredit === null || busy) return;
    setBusy(true);
    try {
      await removeClubAttendee(clubId, removing.attendee_id, returnCredit);
      setSnapshot(null);
      setRemoving(null);
      setReturnCredit(null);
      setRevision((value) => value + 1);
      notifySuccess(
        returnCredit
          ? "Attendee removed. Access returned."
          : "Attendee removed. Access remains consumed.",
      );
    } catch {
      setError("Could not remove the attendee. Refresh the roster and try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-2xl border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4" /> Registered attendees{" "}
          {rows && <span className="text-muted-foreground">({rows.length})</span>}
        </h3>
        <button
          type="button"
          disabled={busy}
          onClick={() => setRevision((value) => value + 1)}
          className="text-xs font-medium text-primary underline"
        >
          Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {!rows && !error && <p className="mt-3 text-sm text-muted-foreground">Loading attendees…</p>}
      {rows?.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">No registrations yet.</p>
      )}
      <ul className="mt-2 divide-y divide-border">
        {rows?.map((attendee) => (
          <li key={attendee.attendee_id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium">{attendee.name}</p>
              <span
                className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${attendee.kind === "courtesy" ? "bg-orange-100 text-orange-800" : "bg-sky-100 text-sky-900"}`}
              >
                {attendee.kind === "courtesy" ? "Courtesy" : "Student"}
              </span>
            </div>
            {canRemove && (
              <button
                type="button"
                disabled={busy}
                aria-label={`Remove ${attendee.name}`}
                onClick={() => {
                  setRemoving(attendee);
                  setReturnCredit(null);
                  setError("");
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                <UserMinus className="h-4 w-4" /> Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {reported && editable && (
        <p className="mt-2 text-xs text-muted-foreground">
          Attendance has been reported. This roster is preserved in history.
        </p>
      )}
      {removing && (
        <div className="mt-3 space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4">
          <p className="text-sm font-semibold">Remove {removing.name}?</p>
          <p className="text-xs text-muted-foreground">
            The seat will be released. Choose what happens to the consumed access.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name={`return-credit-${clubId}`}
              disabled={busy}
              checked={returnCredit === true}
              onChange={() => setReturnCredit(true)}
            />{" "}
            <span>
              Return access for another club
              {removing.kind === "courtesy" && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  The original invitation code can be used again for seven days. The old booking
                  link will stop working.
                </span>
              )}
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name={`return-credit-${clubId}`}
              disabled={busy}
              checked={returnCredit === false}
              onChange={() => setReturnCredit(false)}
            />{" "}
            Keep access consumed
          </label>
          {removing.kind === "student" && (
            <p className="text-xs text-muted-foreground">
              Returned access follows the original plan or package and its validity dates.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <GhostButton type="button" disabled={busy} onClick={() => setRemoving(null)}>
              Cancel removal
            </GhostButton>
            <PrimaryButton
              type="button"
              disabled={busy || returnCredit === null}
              onClick={() => void confirm()}
            >
              {busy ? "Removing…" : "Confirm removal"}
            </PrimaryButton>
          </div>
        </div>
      )}
    </section>
  );
}
