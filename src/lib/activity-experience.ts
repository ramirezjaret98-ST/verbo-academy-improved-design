import type { Activity } from "./activities-store";

export type PracticeStatus = "editing" | "retry" | "revealed" | "correct";
export interface PracticeResponse {
  value: string;
  failures: number;
  status: PracticeStatus;
  submitted: string;
  signature: string;
}

export function activitySignature(activity: Activity): string {
  return JSON.stringify([
    activity.type,
    activity.paragraph,
    activity.answer,
    activity.prompt,
    activity.question,
    activity.items,
    activity.options,
    activity.correctIndex,
  ]);
}

export function isOrderingActivity(activity: Pick<Activity, "type" | "items">): boolean {
  const items = activity.items ?? [];
  return (
    activity.type === "drag_drop" &&
    items.length > 1 &&
    new Set(items.map((item) => item.text)).size === items.length &&
    items.every((item) => /^\d+$/.test(item.key)) &&
    items
      .map((item) => Number(item.key))
      .sort((a, b) => a - b)
      .every((key, index) => key === index + 1)
  );
}

export function activityModel(activity: Activity): string {
  if (activity.type === "read_select" || activity.type === "listen_select")
    return activity.options?.[activity.correctIndex ?? -1] ?? "";
  if (isOrderingActivity(activity))
    return [...(activity.items ?? [])]
      .sort((a, b) => Number(a.key) - Number(b.key))
      .map((item) => item.text)
      .join(" ");
  if (activity.type === "match" || activity.type === "drag_drop")
    return (activity.items ?? []).map((item) => `${item.text} → ${item.key}`).join("\n");
  return activity.answer ?? "";
}

export function activityResponseText(activity: Activity, value: string): string {
  if (activity.type === "read_select" || activity.type === "listen_select")
    return activity.options?.[Number(value)] ?? value;
  if (activity.type === "match" || activity.type === "drag_drop") {
    try {
      const response = JSON.parse(value) as Record<string, string>;
      if (isOrderingActivity(activity))
        return Object.entries(response)
          .sort((a, b) => Number(a[1]) - Number(b[1]))
          .map(([text]) => text)
          .join(" ");
      return (activity.items ?? [])
        .map((item) => `${item.text} → ${response[item.text] || "—"}`)
        .join("\n");
    } catch {
      return value;
    }
  }
  return value;
}

export function responseReady(activity: Activity, value: string): boolean {
  if (activity.type === "record") return false;
  if (activity.type === "read_select" || activity.type === "listen_select")
    return value !== "" && Number.isInteger(Number(value)) && !!activity.options?.[Number(value)];
  if (activity.type === "match" || activity.type === "drag_drop") {
    try {
      const response = JSON.parse(value) as Record<string, string>;
      return (
        (activity.items?.length ?? 0) > 0 && activity.items!.every((item) => !!response[item.text])
      );
    } catch {
      return false;
    }
  }
  return value.trim().length > 0;
}

export function unitDisplayTitle(unit: { id: string; title: string }): string {
  if (/\bunit\s*\d+/i.test(unit.title)) return unit.title;
  const number = unit.id.match(/-U(\d+)$/)?.[1];
  return number ? `Unit ${Number(number)} · ${unit.title}` : unit.title;
}
