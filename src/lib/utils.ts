import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Two-letter initials from a full name: first letter of the first word +
 * first letter of the last word (e.g. "Erika Escamilla" -> "EE"). Falls back
 * to a single letter for one-word names, and "?" when there's nothing to
 * work with. Used as the avatar placeholder while a student/staff member
 * hasn't uploaded a profile photo yet.
 */
export function initialsOf(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
