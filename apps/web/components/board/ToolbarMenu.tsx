'use client';

import { useEffect, useRef } from 'react';
import { CheckIcon, CopyIcon } from '@/components/workspace/icons';
import { FOCUS_RING, ICON_BUTTON } from '@/components/workspace/styles';
import { MoreHorizontalIcon, RedoIcon, UndoIcon, WifiOffIcon } from './icons';

type Props = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCopyLink: () => void;
  simOffline: boolean;
  onSimOfflineChange: (value: boolean) => void;
};

export default function ToolbarMenu({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCopyLink,
  simOffline,
  onSimOfflineChange,
}: Props) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && ref.current?.open) ref.current.open = false;
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const close = () => {
    if (ref.current) ref.current.open = false;
  };

  return (
    <details ref={ref} className="relative">
      <summary aria-label="More board actions" className={`${ICON_BUTTON} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        <MoreHorizontalIcon />
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-drift-line bg-white shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
        <div className="p-1.5">
          <button
            type="button"
            disabled={!canUndo}
            onClick={() => {
              onUndo();
              close();
            }}
            className={`flex w-full items-center gap-2.5 rounded-lg border-0 bg-transparent px-3 py-2 text-left text-sm font-medium text-drift-body transition hover:bg-slate-100 hover:text-drift-ink disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
          >
            <UndoIcon className="size-4" />
            Undo
            <kbd className="ml-auto text-[10px] font-normal text-drift-muted">⌘Z</kbd>
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={() => {
              onRedo();
              close();
            }}
            className={`flex w-full items-center gap-2.5 rounded-lg border-0 bg-transparent px-3 py-2 text-left text-sm font-medium text-drift-body transition hover:bg-slate-100 hover:text-drift-ink disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
          >
            <RedoIcon className="size-4" />
            Redo
            <kbd className="ml-auto text-[10px] font-normal text-drift-muted">⇧⌘Z</kbd>
          </button>
          <button
            type="button"
            onClick={() => {
              onCopyLink();
              close();
            }}
            className={`flex w-full items-center gap-2.5 rounded-lg border-0 bg-transparent px-3 py-2 text-left text-sm font-medium text-drift-body transition hover:bg-slate-100 hover:text-drift-ink ${FOCUS_RING}`}
          >
            <CopyIcon className="size-4" />
            Copy board link
            <CheckIcon className="ml-auto size-3.5 text-transparent" />
          </button>
        </div>
        <div className="border-t border-drift-line p-1.5">
          <label className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-drift-body transition hover:bg-slate-100 hover:text-drift-ink ${FOCUS_RING}`}>
            <WifiOffIcon className="size-4" />
            Simulate offline
            <input
              type="checkbox"
              checked={simOffline}
              onChange={event => onSimOfflineChange(event.target.checked)}
              className="ml-auto size-4 accent-drift-accent"
            />
          </label>
        </div>
      </div>
    </details>
  );
}
