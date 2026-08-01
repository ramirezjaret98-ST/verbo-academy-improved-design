import { useSyncExternalStore } from "react";

/**
 * Tiny global store so the single ContactVerbotModal instance mounted at the
 * root can be opened from anywhere (navbar in the 3 panels, error screens).
 */
let open = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function openContactModal() {
  if (open) return;
  open = true;
  emit();
}

export function closeContactModal() {
  if (!open) return;
  open = false;
  emit();
}

export function useContactModalOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
    () => false,
  );
}
