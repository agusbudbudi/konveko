'use client';

import { useSyncExternalStore } from 'react';

/**
 * Per-device scan input choice, kept in this browser only (a scanner belongs to a
 * device, not to an account).
 *
 *   auto     camera until a hardware scan arrives, then the hardware scanner
 *   camera   always the camera (phones)
 *   scanner  never open the camera (SUNMI and other handhelds, desk with a scanner gun)
 */
export type InputMode = 'auto' | 'camera' | 'scanner';
export type ScanPrefs = { input: InputMode; hardwareSeen: boolean };

const KEY = 'konveko:scan-prefs';
const DEFAULTS: ScanPrefs = { input: 'auto', hardwareSeen: false };
const listeners = new Set<() => void>();

let cachedRaw: string | null | undefined;
let cached: ScanPrefs = DEFAULTS;
/** set when localStorage cannot be written (private mode): the choice lasts for this page */
let memory: ScanPrefs | null = null;

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function snapshot(): ScanPrefs {
  if (memory) return memory;
  const raw = readRaw();
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const p = raw ? (JSON.parse(raw) as Partial<ScanPrefs>) : {};
    cached = {
      input: p.input === 'camera' || p.input === 'scanner' ? p.input : 'auto',
      hardwareSeen: p.hardwareSeen === true,
    };
  } catch {
    cached = DEFAULTS;
  }
  return cached;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => e.key === KEY && fn();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

export function getScanPrefs(): ScanPrefs {
  return snapshot();
}

export function setScanPrefs(patch: Partial<ScanPrefs>) {
  const next = { ...snapshot(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    memory = next;
  }
  listeners.forEach((fn) => fn());
}

/** null until mounted, so the server render never opens the camera by mistake. */
export function useScanPrefs(): ScanPrefs | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

export function usesCamera(p: ScanPrefs): boolean {
  return p.input === 'camera' || (p.input === 'auto' && !p.hardwareSeen);
}
