'use client';

import { useSyncExternalStore } from 'react';

/**
 * One global toast for the scan app: short feedback after a scan that should not push
 * the camera down (e.g. "Pcs P-0000009: 1 pcs masuk SJ-000004"). A new toast replaces
 * the current one; it hides by itself. Rendered once by <ScanToaster> in the scan layout.
 */
export type ScanToast = { id: number; tone: 'success' | 'warning' | 'danger' | 'info'; text: string };

const DURATION = { success: 2500, info: 2500, warning: 5000, danger: 6000 } as const;

let current: ScanToast | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function toast(tone: ScanToast['tone'], text: string) {
  if (timer) clearTimeout(timer);
  current = { id: Date.now(), tone, text };
  emit();
  timer = setTimeout(dismissToast, DURATION[tone]);
}

export function dismissToast() {
  if (timer) clearTimeout(timer);
  current = null;
  emit();
}

export function useScanToast() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => null,
  );
}
