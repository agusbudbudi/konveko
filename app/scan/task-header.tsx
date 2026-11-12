'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { OnlineStatus, useOnline } from './online-status';

/**
 * Header of a task screen: a way back and what this screen does. It takes the place of the app
 * header (globals.css hides [data-app-header] while a [data-task-header] is on the page), so it
 * sticks to the top and pads for the notch itself. Render it as the first thing in <main>.
 * Offline shows here too: a task screen is where data gets sent.
 */
export function TaskHeader({
  title,
  backLabel = 'Batal',
  onBack,
  href,
}: {
  title: React.ReactNode;
  backLabel?: string;
  onBack?: () => void;
  /** Go back by link instead of a handler. */
  href?: string;
}) {
  const online = useOnline();
  const cls = 'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md px-2 font-medium hover:bg-surface-muted';
  const back = (
    <>
      <ArrowLeft size={20} strokeWidth={1.75} aria-hidden />
      {backLabel}
    </>
  );
  return (
    <div
      data-task-header
      className="sticky top-0 z-20 -mx-4 flex h-[calc(3.25rem+env(safe-area-inset-top))] items-center gap-1 border-b border-border bg-surface px-2 pt-[env(safe-area-inset-top)]"
    >
      {href ? (
        <Link href={href} className={cls}>
          {back}
        </Link>
      ) : (
        <button type="button" onClick={onBack} className={cls}>
          {back}
        </button>
      )}
      <span className="ml-auto flex min-w-0 items-center gap-2 pr-2">
        {!online && <OnlineStatus />}
        <span className="truncate text-h3">{title}</span>
      </span>
    </div>
  );
}
