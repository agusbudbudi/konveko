'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ComboOption = { value: string; label: string; hint?: string; disabled?: boolean };

type Props = {
  id?: string;
  /** Submitted with the form under this name. */
  name?: string;
  options: ComboOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Type to filter. Defaults to on when there are more than 6 options. */
  searchable?: boolean;
  /** md = 40px (desk), lg = 48px (scan flow, DESIGN 5.3). */
  size?: 'md' | 'lg';
  invalid?: boolean;
  autoFocus?: boolean;
  className?: string;
  'aria-label'?: string;
};

const MAX_LIST = 280;

/**
 * Accessible combobox (ARIA 1.2: input + listbox) replacing native <select>.
 * The list renders in the top layer (popover API) so a scrolling modal body
 * cannot clip it; it flips above the field when there is no room below.
 * A visually hidden input carries the value for forms and `required`.
 */
export function Combobox({
  id,
  name,
  options,
  value,
  defaultValue = '',
  onChange,
  placeholder = 'Pilih',
  required,
  disabled,
  searchable,
  size = 'md',
  invalid,
  autoFocus,
  className,
  'aria-label': ariaLabel,
}: Props) {
  const autoId = useId();
  const inputId = id ?? `cb-${autoId}`;
  const listId = `${inputId}-list`;
  const controlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue);
  const current = controlled ? value : internal;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [showInvalid, setShowInvalid] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLUListElement>(null);

  const canSearch = searchable ?? options.length > 6;
  const selected = options.find((o) => o.value === current);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return canSearch && q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query, canSearch]);

  const firstEnabled = (list: ComboOption[], from = 0, step = 1) => {
    for (let i = from; i >= 0 && i < list.length; i += step) if (!list[i].disabled) return i;
    return -1;
  };

  // ---- open / close -------------------------------------------------------
  const place = useCallback(() => {
    const wrap = wrapRef.current;
    const pop = popRef.current;
    if (!wrap || !pop) return;
    const r = wrap.getBoundingClientRect();
    const height = Math.min(pop.scrollHeight, MAX_LIST);
    const below = window.innerHeight - r.bottom;
    const up = below < height + 8 && r.top > below;
    pop.style.left = `${r.left}px`;
    pop.style.width = `${r.width}px`;
    pop.style.top = `${up ? r.top - height - 4 : r.bottom + 4}px`;
  }, []);

  const openList = () => {
    if (disabled || open) return;
    setOpen(true);
    setQuery('');
    const idx = options.findIndex((o) => o.value === current);
    setActive(idx >= 0 ? idx : firstEnabled(options));
  };
  const closeList = () => {
    setOpen(false);
    setQuery('');
  };

  useLayoutEffect(() => {
    const pop = popRef.current;
    if (!pop) return;
    if (open) {
      if (!pop.matches(':popover-open')) pop.showPopover();
      place();
    } else if (pop.matches(':popover-open')) pop.hidePopover();
  }, [open, place, filtered.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) closeList();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  // keep the active option in view
  useEffect(() => {
    if (!open || active < 0) return;
    popRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const commit = (opt: ComboOption) => {
    if (opt.disabled) return;
    if (!controlled) setInternal(opt.value);
    onChange?.(opt.value);
    setShowInvalid(false);
    closeList();
    inputRef.current?.focus();
  };

  const move = (step: 1 | -1) => {
    if (!open) return openList();
    const start = active < 0 ? (step === 1 ? 0 : filtered.length - 1) : active + step;
    const next = firstEnabled(filtered, start, step);
    if (next >= 0) setActive(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Home':
        if (open) {
          e.preventDefault();
          setActive(firstEnabled(filtered));
        }
        break;
      case 'End':
        if (open) {
          e.preventDefault();
          setActive(firstEnabled(filtered, filtered.length - 1, -1));
        }
        break;
      case 'Enter':
        if (open) {
          e.preventDefault(); // do not submit the form while picking
          if (active >= 0 && filtered[active]) commit(filtered[active]);
        } else if (!canSearch) {
          e.preventDefault();
          openList();
        }
        break;
      case ' ':
        if (!canSearch && !open) {
          e.preventDefault();
          openList();
        }
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          e.stopPropagation(); // close the list, not the surrounding modal
          closeList();
        }
        break;
      case 'Tab':
        closeList();
        break;
    }
  };

  const showError = invalid || showInvalid;
  const activeId = open && active >= 0 ? `${inputId}-opt-${active}` : undefined;

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <input
        ref={inputRef}
        id={inputId}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-autocomplete={canSearch ? 'list' : 'none'}
        aria-invalid={showError || undefined}
        aria-required={required || undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        readOnly={!canSearch}
        placeholder={selected ? selected.label : placeholder}
        value={open && canSearch ? query : (selected?.label ?? '')}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
          setActive(0);
        }}
        onClick={() => (open ? (!canSearch ? closeList() : undefined) : openList())}
        onKeyDown={onKeyDown}
        className={cn(
          'w-full truncate rounded-md border border-border bg-surface pr-9 pl-3 text-text placeholder:text-text-muted',
          'focus:border-primary focus:ring-2 focus:ring-primary-soft focus:outline-none',
          'disabled:opacity-50',
          !canSearch && 'cursor-pointer caret-transparent',
          open && canSearch && 'placeholder:text-text-subtle',
          showError && '!border-danger focus:!ring-danger-soft focus-visible:!outline-danger',
          size === 'lg' ? 'h-12' : 'h-10',
        )}
      />
      <ChevronDown
        size={16}
        strokeWidth={1.5}
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-muted transition-transform duration-150',
          open && 'rotate-180',
        )}
      />

      {/* carries the value for <form> and native `required` */}
      <input
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        name={name}
        value={current}
        required={required}
        onChange={() => {}}
        onInvalid={(e) => {
          e.preventDefault();
          setShowInvalid(true);
          inputRef.current?.focus();
        }}
      />

      <ul
        ref={popRef}
        id={listId}
        role="listbox"
        popover="manual"
        aria-label={ariaLabel}
        style={{ position: 'fixed', maxHeight: MAX_LIST }}
        className="inset-auto m-0 h-auto overflow-y-auto rounded-md border border-border-strong bg-surface p-1 text-text"
      >
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-small text-text-muted">Tidak ada hasil</li>
        ) : (
          filtered.map((o, i) => {
            const isSelected = o.value === current;
            return (
              <li
                key={o.value || '__empty'}
                id={`${inputId}-opt-${i}`}
                data-index={i}
                role="option"
                aria-selected={isSelected}
                aria-disabled={o.disabled || undefined}
                // keep focus in the input while clicking an option
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => commit(o)}
                onPointerMove={() => !o.disabled && setActive(i)}
                className={cn(
                  'flex items-center gap-2 rounded-sm px-3',
                  size === 'lg' ? 'min-h-11 py-2' : 'min-h-9 py-1.5',
                  o.disabled ? 'cursor-not-allowed text-text-subtle' : 'cursor-pointer',
                  i === active && !o.disabled && 'bg-surface-muted',
                  isSelected && 'font-medium text-primary',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="block truncate text-small font-normal text-text-muted">{o.hint}</span>}
                </span>
                {isSelected && <Check size={16} strokeWidth={1.5} aria-hidden className="shrink-0" />}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
