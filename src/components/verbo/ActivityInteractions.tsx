import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { MatchItem } from "@/lib/activities-store";
import { isOrderingActivity, type PracticeStatus } from "@/lib/activity-experience";

interface Props {
  items: MatchItem[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ordering?: boolean;
  status?: PracticeStatus;
}

export function ActivityInteractions({
  items,
  value,
  onChange,
  disabled,
  ordering,
  status,
}: Props) {
  const reduce = useReducedMotion();
  const instance = useId();
  const [selected, setSelected] = useState<string | null>(null);
  let response: Record<string, string> = {};
  try {
    response = JSON.parse(value || "{}");
  } catch {
    /* Empty draft. */
  }
  const isOrder = ordering ?? isOrderingActivity({ type: "drag_drop", items });
  const ordered = Object.entries(response)
    .filter(([text]) => items.some((item) => item.text === text))
    .sort((a, b) => Number(a[1]) - Number(b[1]));
  const destinations = [...new Set(items.map((item) => item.key))].sort((a, b) =>
    b.localeCompare(a),
  );
  const update = (next: Record<string, string>) => onChange(JSON.stringify(next));
  const transition = reduce
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 380, damping: 30 };
  const wordStatus = (text: string) =>
    status === "correct"
      ? "correct"
      : (status === "retry" || status === "revealed") &&
          response[text] &&
          response[text] !== items.find((item) => item.text === text)?.key
        ? status
        : "";

  if (isOrder)
    return (
      <div className="ae-order">
        <p className="ae-help-text">Tap a phrase to place it. Tap it again to move it back.</p>
        <div className="ae-sentence" data-status={status} aria-label="Your sentence">
          {ordered.length === 0 && <span className="ae-muted">Your sentence starts here…</span>}
          {ordered.map(([text]) => (
            <motion.button
              layout={!reduce}
              transition={transition}
              type="button"
              key={text}
              layoutId={reduce ? undefined : `${instance}:${text}`}
              disabled={disabled}
              data-status={wordStatus(text)}
              className="ae-token"
              aria-label={`Remove ${text}`}
              onClick={() =>
                update(
                  Object.fromEntries(
                    ordered
                      .filter(([item]) => item !== text)
                      .map(([item], i) => [item, String(i + 1)]),
                  ),
                )
              }
            >
              {text}
            </motion.button>
          ))}
        </div>
        {!disabled && (
          <div className="ae-word-bank" aria-label="Phrase bank">
            {items
              .filter((item) => !response[item.text])
              .map((item) => (
                <motion.button
                  layout={!reduce}
                  transition={transition}
                  type="button"
                  key={item.text}
                  layoutId={reduce ? undefined : `${instance}:${item.text}`}
                  className="ae-token"
                  aria-label={`Add ${item.text}`}
                  onClick={() => update({ ...response, [item.text]: String(ordered.length + 1) })}
                >
                  {item.text}
                </motion.button>
              ))}
          </div>
        )}
      </div>
    );

  return (
    <div className="ae-match">
      <p className="ae-help-text">
        Choose a card on the left, then its partner on the right. Select a matched card to change
        it.
      </p>
      <div className="ae-match-columns">
        <div>
          {items.map((item) => (
            <motion.button
              layout={!reduce}
              transition={transition}
              type="button"
              key={item.text}
              className="ae-match-card"
              disabled={disabled}
              aria-pressed={selected === item.text}
              data-status={wordStatus(item.text)}
              onClick={() => setSelected(item.text)}
            >
              <span>{item.text}</span>
              {response[item.text] && <small>{response[item.text]}</small>}
            </motion.button>
          ))}
        </div>
        <div>
          {destinations.map((destination) => (
            <button
              type="button"
              key={destination}
              className="ae-match-card"
              disabled={disabled || selected === null}
              onClick={() => {
                if (selected !== null) {
                  update({ ...response, [selected]: destination });
                  setSelected(null);
                }
              }}
            >
              {destination}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
