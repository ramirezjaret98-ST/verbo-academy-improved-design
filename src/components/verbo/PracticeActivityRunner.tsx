import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Lightbulb, RotateCcw, TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  type Activity,
  categoryLabel,
  incrementAttempts,
  markRecordPracticeCompleted,
  recordActivityScore,
  setUnitCompleted,
  unitPassed,
} from "@/lib/activities-store";
import {
  activityModel,
  activityResponseText,
  activitySignature,
  responseReady,
  unitDisplayTitle,
  type PracticeResponse,
  type PracticeStatus,
} from "@/lib/activity-experience";
import type { CourseUnit } from "@/lib/product-courses-store";
import "./activity-experience.css";

interface Props {
  unit: CourseUnit;
  activities: Activity[];
  studentId: string;
  readOnly: boolean;
  previewMode?: boolean;
  onClose: () => void;
  evaluate: (activity: Activity, value: string) => boolean;
  renderExercise: (
    activity: Activity,
    value: string,
    onChange: (value: string) => void,
    disabled: boolean,
    onRecorded: () => void,
    status: PracticeStatus,
  ) => ReactNode;
}

export function PracticeActivityRunner({
  unit,
  activities,
  studentId,
  readOnly,
  previewMode = false,
  onClose,
  evaluate,
  renderExercise,
}: Props) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, PracticeResponse>>({});
  const [tipOpen, setTipOpen] = useState(false);
  const [helpRequested, setHelpRequested] = useState(false);
  const storageKey = `verbo:practice-response:${studentId}:${unit.id}`;
  const hydrated = useRef(false);
  const selected = activities[index];
  const savedResponse = selected ? responses[selected.id] : undefined;
  const response =
    selected && savedResponse?.signature === activitySignature(selected)
      ? savedResponse
      : undefined;
  const status = response?.status ?? "editing";
  const correct = status === "correct";
  const review = readOnly && !previewMode;
  const completed = activities.filter(
    (activity) =>
      responses[activity.id]?.signature === activitySignature(activity) &&
      responses[activity.id]?.status === "correct",
  ).length;

  useEffect(() => {
    if (!previewMode) {
      try {
        const cached = JSON.parse(sessionStorage.getItem(storageKey) || "{}");
        const restored: Record<string, PracticeResponse> = {};
        for (const activity of activities) {
          const saved = cached[activity.id];
          if (
            saved &&
            saved.signature === activitySignature(activity) &&
            typeof saved.value === "string" &&
            Number.isInteger(saved.failures) &&
            saved.failures >= 0 &&
            ["editing", "retry", "revealed", "correct"].includes(saved.status)
          )
            restored[activity.id] = saved;
        }
        setResponses(restored);
      } catch {
        /* Practice still works when device storage is unavailable. */
      }
    }
    hydrated.current = true;
    // A runner instance is mounted for one unit; content changes invalidate individual drafts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, previewMode]);

  useEffect(() => {
    if (hydrated.current && !previewMode) {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(responses));
      } catch {
        /* Device storage is optional. */
      }
    }
  }, [responses, storageKey, previewMode]);

  const update = (value: string) => {
    if (!selected || correct || review) return;
    setResponses((current) => ({
      ...current,
      [selected.id]: {
        value,
        failures: response?.failures ?? 0,
        status: "editing",
        submitted: response?.submitted ?? "",
        signature: activitySignature(selected),
      },
    }));
  };
  const saveOutcome = (recording = false) => {
    if (!selected || previewMode || review) return;
    if (recording) markRecordPracticeCompleted(studentId, selected.id);
    else recordActivityScore(studentId, selected.id, 100);
    incrementAttempts(studentId, unit.id);
    if (unitPassed(studentId, unit.id)) setUnitCompleted(studentId, unit.id, true);
  };
  const onRecorded = () => {
    if (!selected) return;
    setResponses((current) => ({
      ...current,
      [selected.id]: {
        value: "",
        failures: 0,
        status: "correct",
        submitted: "",
        signature: activitySignature(selected),
      },
    }));
    saveOutcome(true);
  };
  const check = () => {
    if (!selected || review || correct || !responseReady(selected, response?.value ?? "")) return;
    const value = response?.value ?? "";
    const ok = evaluate(selected, value);
    const failures = (response?.failures ?? 0) + (ok ? 0 : 1);
    setResponses((current) => ({
      ...current,
      [selected.id]: {
        value,
        failures,
        status: ok ? "correct" : failures >= 3 ? "revealed" : "retry",
        submitted: value,
        signature: activitySignature(selected),
      },
    }));
    if (ok) saveOutcome();
    else {
      if (!previewMode) {
        recordActivityScore(studentId, selected.id, 0);
        incrementAttempts(studentId, unit.id);
      }
      setHelpRequested(false);
      setTipOpen(true);
    }
  };
  const hint =
    selected?.hint?.trim() ||
    selected?.feedback?.trim() ||
    "Read your answer next to the situation once more. You can change it before trying again.";
  const explanation = selected?.feedback?.trim() || hint;
  const comparison =
    !!response && response.failures >= 3 && !correct && selected?.type !== "record";
  const showHelp = () => {
    setHelpRequested(true);
    setTipOpen(true);
  };
  const navigate = (next: number) => {
    setIndex(next);
    setTipOpen(false);
    setHelpRequested(false);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="ae-dialog" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{unitDisplayTitle(unit)} activities</DialogTitle>
        <header className="ae-header">
          <span className="ae-brand">
            verbo <small>academy</small>
          </span>
          <span className="ae-unit-title">{unitDisplayTitle(unit)}</span>
        </header>
        <div className="ae-layout">
          <aside className="ae-sidebar" aria-label="Activity steps">
            <h2>Your practice</h2>
            <ol>
              {activities.map((activity, position) => {
                const candidate = responses[activity.id];
                const saved =
                  candidate?.signature === activitySignature(activity) ? candidate : undefined;
                return (
                  <li key={activity.id}>
                    <button
                      type="button"
                      onClick={() => navigate(position)}
                      className="ae-step"
                      data-status={saved?.status}
                      aria-current={index === position ? "step" : undefined}
                      aria-label={`${activity.name}${saved?.status === "correct" ? ", completed" : ""}`}
                    >
                      <span className="ae-step-number">
                        {saved?.status === "correct" ? <Check size={15} /> : position + 1}
                      </span>
                      <span>{activity.name}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>
          <main className="ae-main">
            <div
              className="ae-progress"
              role="progressbar"
              aria-label="Activities completed"
              aria-valuemin={0}
              aria-valuemax={activities.length || 1}
              aria-valuenow={completed}
            >
              <span style={{ width: `${(completed / Math.max(1, activities.length)) * 100}%` }} />
            </div>
            {selected ? (
              <>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.section
                    key={selected.id}
                    initial={reduce ? false : { x: 10, opacity: 0.7 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={reduce ? undefined : { x: -8, opacity: 0.7 }}
                    transition={{ duration: 0.16 }}
                  >
                    <p className="ae-category">
                      {selected.session_phase === "post"
                        ? "After your session"
                        : "Before your session"}{" "}
                      · {categoryLabel(selected.category)} · {index + 1} / {activities.length}
                    </p>
                    <h1>{selected.name}</h1>
                    {review && (
                      <p className="ae-help-text">
                        Review this activity with your teacher. Your saved results stay as they are.
                      </p>
                    )}
                    <div className="ae-exercise" data-status={status}>
                      {renderExercise(
                        selected,
                        response?.value ?? "",
                        update,
                        review || correct,
                        onRecorded,
                        status,
                      )}
                    </div>
                    {!review && !correct && (
                      <button type="button" className="ae-help" onClick={showHelp}>
                        <Lightbulb size={16} /> Let’s work through it together
                      </button>
                    )}
                  </motion.section>
                </AnimatePresence>
                <footer className="ae-footer">
                  {response && (response.status !== "editing" || response.failures > 0) && (
                    <motion.div
                      layout={!reduce}
                      className="ae-feedback"
                      data-status={
                        correct ? "correct" : response.failures >= 3 ? "revealed" : "retry"
                      }
                      role="status"
                    >
                      <strong>
                        {correct
                          ? selected.type === "record"
                            ? "Practice submitted."
                            : "That works."
                          : comparison
                            ? "Let’s compare the two versions."
                            : "A small change will help."}
                      </strong>
                      <p>
                        {correct
                          ? selected.type === "record"
                            ? "Your recording is saved. You can continue without waiting for a teacher review."
                            : selected.feedback?.trim() ||
                              "Your answer fits this situation. Keep it in mind for your next conversation."
                          : comparison
                            ? explanation
                            : hint}
                      </p>
                    </motion.div>
                  )}
                  {comparison && (
                    <div className="ae-compare">
                      <div>
                        <small>Your answer</small>
                        <p>{activityResponseText(selected, response.submitted)}</p>
                      </div>
                      <div>
                        <small>A correct answer</small>
                        <p>{activityModel(selected)}</p>
                      </div>
                    </div>
                  )}
                  <div className="ae-actions">
                    {!review && completed === activities.length && activities.length > 0 ? (
                      <button
                        type="button"
                        className="ae-rebuild"
                        onClick={() => {
                          setResponses({});
                          setIndex(0);
                        }}
                      >
                        <RotateCcw size={14} /> Practice again
                      </button>
                    ) : null}
                    {!review && !correct && response?.failures ? (
                      <button type="button" className="ae-rebuild" onClick={() => update("")}>
                        <RotateCcw size={14} /> Start this answer again
                      </button>
                    ) : (
                      <span />
                    )}
                    {review || correct ? (
                      <button
                        type="button"
                        className="ae-primary"
                        data-status={correct ? "correct" : undefined}
                        onClick={() =>
                          index + 1 < activities.length ? navigate(index + 1) : onClose()
                        }
                      >
                        {index + 1 < activities.length ? "Continue" : "Finish practice"}
                      </button>
                    ) : selected.type !== "record" ? (
                      <button
                        type="button"
                        className="ae-primary"
                        onClick={check}
                        disabled={!responseReady(selected, response?.value ?? "")}
                      >
                        Check my answer
                      </button>
                    ) : previewMode ? (
                      <button
                        type="button"
                        className="ae-primary"
                        onClick={() =>
                          index + 1 < activities.length ? navigate(index + 1) : onClose()
                        }
                      >
                        Continue preview
                      </button>
                    ) : null}
                  </div>
                </footer>
              </>
            ) : (
              <p>No activities have been added to this unit yet.</p>
            )}
          </main>
        </div>
        <Dialog open={tipOpen} onOpenChange={setTipOpen}>
          <DialogContent className="ae-tip">
            <div
              className="ae-tip-heading"
              data-status={!helpRequested && comparison ? "revealed" : "retry"}
            >
              {helpRequested ? <Lightbulb size={26} /> : <TriangleAlert size={26} />}
              <DialogTitle>
                {helpRequested
                  ? "Let’s find a starting point."
                  : comparison
                    ? "Let’s look at it together."
                    : "A small change will help."}
              </DialogTitle>
            </div>
            <DialogDescription>
              {!helpRequested && comparison ? explanation : hint}
            </DialogDescription>
            {!helpRequested && comparison && selected && response && (
              <div className="ae-compare">
                <div>
                  <small>Your answer</small>
                  <p>{activityResponseText(selected, response.submitted)}</p>
                </div>
                <div>
                  <small>A correct answer</small>
                  <p>{activityModel(selected)}</p>
                </div>
              </div>
            )}
            <button type="button" className="ae-primary" onClick={() => setTipOpen(false)}>
              {helpRequested ? "Let’s try it" : "Try again"}
            </button>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
