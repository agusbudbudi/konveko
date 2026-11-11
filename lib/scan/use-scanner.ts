'use client';

import { useEffect, useRef } from 'react';
import { subscribe, type ScanEvent } from './bus';

/**
 * Receive hardware scans (keyboard wedge, native bridge) while `enabled`.
 * The camera is separate: render <CameraScanner> where it should show.
 */
export function useScanner(onScan: (code: string, e: ScanEvent) => void, enabled = true) {
  const ref = useRef(onScan);
  useEffect(() => {
    ref.current = onScan;
  });
  useEffect(() => {
    if (!enabled) return;
    return subscribe((e) => ref.current(e.code, e));
  }, [enabled]);
}
