'use client';

import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';

function subscribe(fn: () => void) {
  window.addEventListener('online', fn);
  window.addEventListener('offline', fn);
  return () => {
    window.removeEventListener('online', fn);
    window.removeEventListener('offline', fn);
  };
}

/** navigator.onLine as a hook. Server render assumes online. */
export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

/** Header dot: green "Online", amber "Offline" so people know a scan will not go through. */
export function OnlineStatus() {
  const online = useOnline();
  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-caption font-medium',
        online ? 'text-success' : 'bg-warning-soft text-warning',
      )}
    >
      <span aria-hidden className={cn('size-2 rounded-full', online ? 'bg-success' : 'bg-warning')} />
      {online ? 'Online' : 'Offline'}
    </span>
  );
}
