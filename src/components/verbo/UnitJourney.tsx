import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronDown,
  MessageCircle,
  Repeat2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { Activity, SessionPhase, unitCategoryProgress } from "@/lib/activities-store";
import { categoryLabel } from "@/lib/activities-store";
import type { CourseLevel, CourseUnit } from "@/lib/product-courses-store";
import { ReportContentIssueModal } from "@/components/verbo/ReportContentIssueModal";
import { UnitMaterialReader } from "@/components/verbo/UnitMaterialReader";
import "./unit-journey.css";

interface Props {
  level: CourseLevel;
  unit: CourseUnit;
  unitNumber: number;
  studentId: string;
  activities: Activity[];
  categoryProgress: ReturnType<typeof unitCategoryProgress>;
  passed: boolean;
  readOnly: boolean;
  previewMode: boolean;
  nextUnit?: CourseUnit;
  onBack: () => void;
  onChange: () => void;
  onOpenUnit?: (unit: CourseUnit) => void;
  renderActivities: (phase: SessionPhase, onClose: () => void) => ReactNode;
  video?: ReactNode;
}

export function UnitJourney({
  level,
  unit,
  unitNumber,
  studentId,
  activities,
  categoryProgress,
  passed,
  readOnly,
  previewMode,
  nextUnit,
  onBack,
  onChange,
  onOpenUnit,
  renderActivities,
  video,
}: Props) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<SessionPhase | null>(null);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [materialOpened, setMaterialOpened] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(true);
  const [issueOpen, setIssueOpen] = useState(false);
  const [reply, setReply] = useState(false);
  const [replay, setReplay] = useState(0);
  const [allWords, setAllWords] = useState(false);
  const [lastPhase, setLastPhase] = useState<SessionPhase | null>(null);
  const pre = activities.filter((a) => (a.session_phase ?? "pre") === "pre");
  const post = activities.filter((a) => a.session_phase === "post");
  const mandatory = categoryProgress.filter((r) => r.mandatory);
  const graded = mandatory.filter((r) => r.hasGraded);
  const overall = graded.some((r) => r.best > 0)
    ? Math.round(graded.reduce((sum, r) => sum + r.best, 0) / graded.length)
    : null;
  const optional = categoryProgress.filter((r) => !r.mandatory);
  const titleParts = unit.title.split(" & ");
  const hasChat = unit.id === "GO-L2-U1";
  const words = [...new Set(unit.vocabulary?.filter(Boolean) ?? [])];
  const currentStep =
    lastPhase === "post" ? 2 : lastPhase === "pre" || materialOpened || !unit.pdf_url ? 1 : 0;
  const openMaterial = () => {
    setMaterialOpened(true);
    setMaterialOpen(true);
  };
  const openPractice = (next: SessionPhase) => {
    setLastPhase(next);
    setPhase(next);
  };
  const intro =
    unit.teaser?.trim() ||
    "Explore useful language, try it out, and bring it into your next conversation.";
  const steps = [
    {
      title: "Session Prep",
      when: "Before your session",
      description: "Useful phrases and examples to bring into your conversation.",
      icon: BookOpen,
      action: unit.pdf_url ? "Explore the material" : "Material not added yet",
      disabled: !unit.pdf_url,
      onClick: openMaterial,
      meta: unit.pdf_url
        ? materialOpened
          ? "Opened · Read again anytime"
          : "Read here · Save for later"
        : "You can still explore the available activities.",
    },
    {
      title: "Try it out",
      when: "Before your session",
      description: "Build a reply, check a message, and try the language before class.",
      icon: MessageCircle,
      action: pre.length
        ? readOnly
          ? "Review warm-up"
          : "Start your warm-up"
        : "No warm-up activities yet",
      disabled: !pre.length,
      onClick: () => openPractice("pre"),
      meta: pre.length + (pre.length === 1 ? " activity" : " activities") + " · At your own pace",
    },
    {
      title: "Make it stick",
      when: "After your session",
      description: "Use what you practiced in a fresh conversation or everyday situation.",
      icon: Repeat2,
      action: post.length
        ? readOnly
          ? "Review follow-up"
          : "Keep practicing"
        : "No follow-up activities yet",
      disabled: !post.length,
      onClick: () => openPractice("post"),
      meta:
        post.length + (post.length === 1 ? " activity" : " activities") + " · Ready when you are",
    },
  ];

  return (
    <div className="unit-journey">
      <div className="uj-toolbar">
        <button type="button" className="uj-back" onClick={onBack}>
          <ArrowLeft size={15} /> Back to {level.name}
        </button>
        {!previewMode && (
          <button
            type="button"
            className="verbo-report-btn"
            onClick={() => setIssueOpen(true)}
            aria-label="Report"
            title="Report a technical issue"
          >
            <span className="sign">
              <ShieldAlert size={16} />
            </span>
            <span className="text">Report</span>
          </button>
        )}
      </div>
      <div className={"uj-hero " + (hasChat || words.length ? "" : "uj-hero-text")}>
        <div>
          <div className="uj-eyebrow">
            {level.name} · Unit {unitNumber}
          </div>
          <h1>
            {titleParts.length === 2 ? (
              <>
                {titleParts[0]} &<br />
                <span>{titleParts[1]}</span>
              </>
            ) : (
              unit.title
            )}
          </h1>
          <p className="uj-intro">{intro}</p>
          {(passed || readOnly) && (
            <p className="uj-mode">
              {passed ? "Unit passed" : "Review mode"}
              {passed && readOnly ? " · Review mode" : ""}
            </p>
          )}
        </div>
        {hasChat ? (
          <div className="uj-chat" aria-label="A short group chat">
            <div className="uj-bubble">Are we still meeting at four?</div>
            <div className="uj-bubble">Can we make it two instead?</div>
            <AnimatePresence initial={false}>
              {reply && (
                <motion.div
                  key={replay}
                  className="uj-bubble uj-reply"
                  initial={reduce ? false : { opacity: 0, y: 12, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  role="status"
                >
                  Two works for me. See you then!
                </motion.div>
              )}
            </AnimatePresence>
            <button
              type="button"
              className="uj-chat-action"
              aria-expanded={reply}
              onClick={() => {
                setReply(true);
                setReplay((n) => n + 1);
              }}
            >
              {reply ? "Replay the reply" : "See the reply"}
              {reply ? <RotateCcw size={14} /> : <ArrowRight size={14} />}
            </button>
          </div>
        ) : words.length > 0 ? (
          <div className="uj-word-preview">
            <div className="uj-eyebrow">Words you'll use</div>
            <div className="uj-words">
              {(allWords ? words : words.slice(0, 3)).map((word) => (
                <span key={word}>{word}</span>
              ))}
            </div>
            {words.length > 3 && (
              <button
                type="button"
                className="uj-chat-action"
                aria-expanded={allWords}
                onClick={() => setAllWords((v) => !v)}
              >
                {allWords ? "Show fewer words" : "Explore the words"} <ChevronDown size={14} />
              </button>
            )}
          </div>
        ) : null}
      </div>
      {video && (
        <section className="uj-video">
          <h2>Before you try it</h2>
          <div className="uj-video-frame">{video}</div>
        </section>
      )}
      <div className="uj-section-heading">
        <h2>Your unit, step by step.</h2>
        <span>Start with the material, or jump into practice.</span>
      </div>
      <div className="uj-road">
        {steps.map((step, i) => (
          <article key={step.title} className="uj-card" data-current={currentStep === i}>
            <div className="uj-card-top">
              <span className="uj-icon">
                <step.icon size={21} />
              </span>
              <span className="uj-step-number" aria-hidden="true">
                0{i + 1}
              </span>
            </div>
            <div className="uj-when">{step.when}</div>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
            <button
              type="button"
              className={"uj-button " + (currentStep === i ? "" : "uj-secondary")}
              disabled={step.disabled}
              onClick={step.onClick}
            >
              {step.action}
              <ArrowRight size={16} />
            </button>
            <div className="uj-meta">{step.meta}</div>
          </article>
        ))}
      </div>
      <section className="uj-score">
        <button
          type="button"
          className="uj-score-toggle"
          aria-expanded={scoreOpen}
          aria-controls={"unit-score-" + unit.id}
          onClick={() => setScoreOpen((v) => !v)}
        >
          <span className="uj-score-number">
            {overall === null ? (
              "—"
            ) : (
              <>
                {overall}
                <small>%</small>
              </>
            )}
          </span>
          <span className="uj-score-copy">
            <strong>Current unit score</strong>
            <small>Your best results stay with you.</small>
            <span className="uj-score-preview">
              {mandatory.map((row) => categoryLabel(row.category)).join(" · ")}
            </span>
          </span>
          <span className="uj-score-action">
            {scoreOpen ? "Hide breakdown" : "Show breakdown"}
            <ChevronDown size={18} />
          </span>
        </button>
        <AnimatePresence initial={false}>
          {scoreOpen && (
            <motion.div
              id={"unit-score-" + unit.id}
              className="uj-score-details"
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.25 }}
            >
              <div className="uj-score-grid">
                {mandatory.map((row) => {
                  const best = row.hasGraded ? row.best : row.recordingComplete ? 100 : 0;
                  return (
                    <div key={row.category} className="uj-category">
                      <div>
                        <span>{categoryLabel(row.category)}</span>
                        <span>
                          {row.hasGraded
                            ? best + "%"
                            : row.recordingComplete
                              ? "Submitted"
                              : "Pending"}
                        </span>
                      </div>
                      <div
                        className="uj-track"
                        role="progressbar"
                        aria-label={categoryLabel(row.category)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={best}
                        aria-valuetext={
                          row.hasGraded
                            ? best + "%"
                            : row.recordingComplete
                              ? "Submitted"
                              : "Pending"
                        }
                      >
                        <span style={{ width: best + "%" }} data-passed={row.passed} />
                      </div>
                      {row.hasRecording && (
                        <small>
                          {row.recordingComplete
                            ? "Recording submitted"
                            : "Recording practice pending"}
                        </small>
                      )}
                    </div>
                  );
                })}
              </div>
              <p>
                Aim for at least 60% in each required category. Recording practice counts when
                submitted; it is not a pronunciation grade.
              </p>
              {optional.length > 0 && (
                <p>
                  Extra practice: {optional.map((r) => categoryLabel(r.category)).join(", ")}. It
                  doesn't affect progression.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
      <p className="uj-footer">
        <Sparkles size={15} />
        {readOnly
          ? "Review your unit and revisit the material whenever you need it."
          : "Take your time. You can try again and keep your best result."}
      </p>
      {passed && nextUnit && onOpenUnit && (
        <button type="button" className="uj-next" onClick={() => onOpenUnit(nextUnit)}>
          Continue to {nextUnit.title}
          <ArrowRight size={16} />
        </button>
      )}
      {materialOpen && <UnitMaterialReader unit={unit} onClose={() => setMaterialOpen(false)} />}
      {phase &&
        renderActivities(phase, () => {
          setPhase(null);
          onChange();
        })}
      {!previewMode && (
        <ReportContentIssueModal
          studentId={studentId}
          entityType="unit"
          entityId={unit.id}
          entityTitle={unit.title}
          open={issueOpen}
          onClose={() => setIssueOpen(false)}
        />
      )}
    </div>
  );
}
