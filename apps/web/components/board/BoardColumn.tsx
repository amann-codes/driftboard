'use client';

import { useEffect, useRef, useState } from 'react';
import type { Card } from '@driftboard/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Avatar from '@/components/Avatar';
import { AlertIcon, PlusIcon } from '@/components/workspace/icons';
import { FOCUS_RING, GHOST_BUTTON, PRIMARY_BUTTON } from '@/components/workspace/styles';
import { tintFor } from '@/lib/workspace';
import {
  ArchiveIcon,
  CalendarIcon,
  DescriptionIcon,
  GripVerticalIcon,
  MoreHorizontalIcon,
} from './icons';

export type DragKind = 'card' | 'column';
export type DragItem = { kind: DragKind; cardId?: string; columnId: string } | null;

export const cardKey = (id: string) => `card:${id}`;
export const columnKey = (id: string) => `column:${id}`;

type Editor = { userId: string; name: string };

type BoardColumnProps = {
  id: string;
  name: string;
  count: number;
  readOnly: boolean;
  dropTarget: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddCard: (title: string) => void;
  children: React.ReactNode;
};

export function BoardColumn({
  id,
  name,
  count,
  readOnly,
  dropTarget,
  onRename,
  onDelete,
  onAddCard,
  children,
}: BoardColumnProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: columnKey(id),
    data: { kind: 'column', columnId: id } satisfies Exclude<DragItem, null>,
    disabled: readOnly,
  });

  return (
    <section
      ref={setNodeRef}
      aria-label={`${name} list`}
      className={`flex w-[272px] shrink-0 flex-col rounded-xl border bg-slate-100/80 p-2 transition ${
        dropTarget ? 'border-drift-accent/50 bg-indigo-50/70 ring-2 ring-drift-accent/20' : 'border-slate-200/80'
      } ${isDragging ? 'opacity-45' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <ColumnHeader
        name={name}
        count={count}
        readOnly={readOnly}
        dragHandleRef={setActivatorNodeRef}
        dragHandleProps={readOnly ? undefined : { ...attributes, ...listeners }}
        onRename={onRename}
        onDelete={onDelete}
      />
      <div className="flex min-h-3 flex-col gap-2 px-1 pb-1 pt-1">
        {children}
        {readOnly && count === 0 && <p className="px-2 py-3 text-xs text-drift-muted">No cards in this list.</p>}
      </div>
      {!readOnly && <AddCardComposer columnName={name} onAdd={onAddCard} />}
    </section>
  );
}

function ColumnHeader({
  name,
  count,
  readOnly,
  dragHandleRef,
  dragHandleProps,
  onRename,
  onDelete,
}: {
  name: string;
  count: number;
  readOnly: boolean;
  dragHandleRef?: (element: HTMLElement | null) => void;
  dragHandleProps?: Record<string, unknown>;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  useEffect(() => setValue(name), [name]);

  const commit = () => {
    setEditing(false);
    const next = value.trim();
    if (next && next !== name) onRename(next);
    else setValue(name);
  };

  return (
    <div className="flex items-center gap-1 px-1 pb-1">
      {!readOnly && (
        <button
          ref={dragHandleRef}
          type="button"
          aria-label={`Drag ${name} list`}
          className={`grid size-7 shrink-0 cursor-grab place-items-center rounded-md border-0 bg-transparent p-0 text-slate-400 transition hover:bg-white/70 hover:text-drift-body active:cursor-grabbing ${FOCUS_RING}`}
          {...dragHandleProps}
        >
          <GripVerticalIcon className="size-4" />
        </button>
      )}
      {editing ? (
        <input
          autoFocus
          value={value}
          maxLength={80}
          aria-label="List name"
          onChange={event => setValue(event.target.value)}
          onBlur={commit}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
              setValue(name);
              setEditing(false);
            }
          }}
          className="h-8 min-w-0 flex-1 rounded-md border border-drift-line bg-white px-2 text-sm font-semibold text-drift-ink outline-none focus:border-drift-accent focus:ring-2 focus:ring-drift-accent/20"
        />
      ) : (
        <button
          type="button"
          onDoubleClick={() => !readOnly && setEditing(true)}
          onKeyDown={event => {
            if (event.key === 'F2' && !readOnly) setEditing(true);
          }}
          title={readOnly ? name : 'Double-click to rename'}
          className={`min-w-0 flex-1 truncate rounded-md border-0 bg-transparent px-2 py-1 text-left text-sm font-semibold text-drift-ink ${FOCUS_RING}`}
        >
          {name}
        </button>
      )}
      <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-drift-muted">
        {count}
      </span>
      {!readOnly && !editing && (
        <ColumnMenu name={name} onRename={() => setEditing(true)} onDelete={onDelete} />
      )}
    </div>
  );
}

function ColumnMenu({ name, onRename, onDelete }: { name: string; onRename: () => void; onDelete: () => void }) {
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
    <details ref={ref} className="relative shrink-0">
      <summary
        aria-label={`List actions for ${name}`}
        className={`grid size-7 cursor-pointer list-none place-items-center rounded-md text-slate-400 transition hover:bg-white/80 hover:text-drift-body [&::-webkit-details-marker]:hidden ${FOCUS_RING}`}
      >
        <MoreHorizontalIcon className="size-4" />
      </summary>
      <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-lg border border-drift-line bg-white p-1.5 shadow-[0_14px_36px_rgba(15,23,42,0.16)]">
        <button
          type="button"
          onClick={() => {
            onRename();
            close();
          }}
          className={`flex w-full items-center rounded-md border-0 bg-transparent px-2.5 py-2 text-left text-sm text-drift-body transition hover:bg-slate-100 hover:text-drift-ink ${FOCUS_RING}`}
        >
          Rename list
        </button>
        <button
          type="button"
          onClick={() => {
            onDelete();
            close();
          }}
          className={`flex w-full items-center rounded-md border-0 bg-transparent px-2.5 py-2 text-left text-sm text-red-600 transition hover:bg-red-50 ${FOCUS_RING}`}
        >
          Delete list
        </button>
      </div>
    </details>
  );
}

function AddCardComposer({ columnName, onAdd }: { columnName: string; onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = () => {
    const next = title.trim();
    if (!next) return;
    onAdd(next);
    setTitle('');
    inputRef.current?.focus();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-xs font-medium text-drift-muted transition hover:bg-white/80 hover:text-drift-ink ${FOCUS_RING}`}
      >
        <PlusIcon className="size-3.5" />
        Add a card
      </button>
    );
  }

  return (
    <form
      className="px-1 pb-1 pt-1"
      onSubmit={event => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={inputRef}
        rows={2}
        value={title}
        maxLength={200}
        aria-label={`New card title in ${columnName}`}
        placeholder="Write a card title…"
        onChange={event => setTitle(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
          if (event.key === 'Escape') {
            setOpen(false);
            setTitle('');
          }
        }}
        className="w-full resize-none rounded-lg border border-drift-line bg-white px-2.5 py-2 text-sm text-drift-ink shadow-sm outline-none placeholder:text-slate-400 focus:border-drift-accent focus:ring-2 focus:ring-drift-accent/20"
      />
      <div className="mt-2 flex items-center gap-2">
        <button type="submit" disabled={!title.trim()} className={`${PRIMARY_BUTTON} h-8 px-3 text-xs`}>
          Add card
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTitle('');
          }}
          className={`${GHOST_BUTTON} h-8 px-2 text-xs`}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

type CardTileProps = {
  card: Card;
  pending: number;
  editors: Editor[];
  assignee: { id: string; name: string } | null;
  hasConflict: boolean;
  readOnly: boolean;
  preview?: boolean;
  dragHandleRef?: (element: HTMLElement | null) => void;
  dragHandleProps?: Record<string, unknown>;
  onOpen?: () => void;
  onArchive?: () => void;
};

export function CardTile({
  card,
  pending,
  editors,
  assignee,
  hasConflict,
  readOnly,
  preview = false,
  dragHandleRef,
  dragHandleProps,
  onOpen,
  onArchive,
}: CardTileProps) {
  const due = card.dueDate ? formatDue(card.dueDate) : null;

  const content = (
    <>
      {card.labels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {card.labels.map(label => (
            <span key={label} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${tintFor(label)}`}>
              {label}
            </span>
          ))}
        </div>
      )}

      <p className="text-sm font-medium leading-5 text-drift-ink [overflow-wrap:anywhere]">{card.title}</p>

      {(due || card.description || hasConflict || pending > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-drift-muted">
          {due && (
            <span className={`inline-flex items-center gap-1 ${due.overdue ? 'font-medium text-red-600' : ''}`}>
              <CalendarIcon className="size-3" />
              {due.label}
            </span>
          )}
          {card.description && (
            <span className="inline-flex items-center gap-1" title="Has a description">
              <DescriptionIcon className="size-3" />
              Notes
            </span>
          )}
          {hasConflict && (
            <span className="inline-flex items-center gap-1 font-medium text-red-600" title="One of your edits was replaced">
              <AlertIcon className="size-3" />
              Edit replaced
            </span>
          )}
          {pending > 0 && (
            <span className="inline-flex items-center gap-1 font-medium text-amber-700" title="Saved on this device; not synced yet">
              <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
              Unsynced
            </span>
          )}
        </div>
      )}

      {(editors.length > 0 || assignee) && (
        <div className="mt-2 flex items-center justify-end -space-x-1.5">
          {editors.map(user => (
            <span key={user.userId} className="rounded-full ring-2 ring-white" title={`${user.name} is editing`}>
              <Avatar id={user.userId} name={user.name} className="size-5 text-[8px]" />
            </span>
          ))}
          {assignee && (
            <span className="pl-1.5" title={`Assigned to ${assignee.name}`}>
              <Avatar id={assignee.id} name={assignee.name} className="size-6 text-[9px] ring-2 ring-white" />
            </span>
          )}
        </div>
      )}
    </>
  );

  return (
    <article
      className={`group/card relative rounded-lg border bg-white p-3 pr-10 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition ${
        preview
          ? 'rotate-1 border-drift-line shadow-[0_18px_36px_rgba(15,23,42,0.18)]'
          : 'border-drift-line hover:border-slate-300 hover:shadow-[0_6px_18px_rgba(15,23,42,0.08)]'
      } ${hasConflict ? 'border-red-200' : pending ? 'border-amber-200' : ''}`}
    >
      {preview ? (
        <div>{content}</div>
      ) : (
        <button type="button" onClick={onOpen} aria-label={`Open card ${card.title}`} className={`block w-full rounded border-0 bg-transparent p-0 text-left ${FOCUS_RING}`}>
          {content}
        </button>
      )}

      {!preview && (
        <div
          className="absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-100 transition md:opacity-0 md:group-hover/card:opacity-100 md:group-focus-within/card:opacity-100"
          onPointerDown={event => event.stopPropagation()}
          onClick={event => event.stopPropagation()}
        >
          {!readOnly && dragHandleProps && (
            <button
              ref={dragHandleRef}
              type="button"
              aria-label={`Drag ${card.title}`}
              className={`grid size-6 cursor-grab touch-none place-items-center rounded-md border-0 bg-white/90 p-0 text-slate-400 shadow-sm transition hover:bg-slate-100 hover:text-drift-body active:cursor-grabbing ${FOCUS_RING}`}
              {...dragHandleProps}
            >
              <GripVerticalIcon className="size-3.5" />
            </button>
          )}
          {!readOnly && onArchive && <CardMenu title={card.title} onOpen={onOpen} onArchive={onArchive} />}
        </div>
      )}
    </article>
  );
}

function CardMenu({ title, onOpen, onArchive }: { title: string; onOpen?: () => void; onArchive: () => void }) {
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
    <details
      ref={ref}
      className="relative"
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
      <summary
        aria-label={`Actions for ${title}`}
        className={`grid size-6 cursor-pointer list-none place-items-center rounded-md bg-white/90 text-slate-400 shadow-sm transition hover:bg-slate-100 hover:text-drift-body [&::-webkit-details-marker]:hidden ${FOCUS_RING}`}
      >
        <MoreHorizontalIcon className="size-4" />
      </summary>
      <div className="absolute right-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-lg border border-drift-line bg-white p-1.5 shadow-[0_14px_36px_rgba(15,23,42,0.16)]">
        {onOpen && (
          <button
            type="button"
            onClick={() => {
              onOpen();
              close();
            }}
            className={`flex w-full items-center rounded-md border-0 bg-transparent px-2.5 py-2 text-left text-sm text-drift-body transition hover:bg-slate-100 hover:text-drift-ink ${FOCUS_RING}`}
          >
            Open card
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            onArchive();
            close();
          }}
          className={`flex w-full items-center gap-2 rounded-md border-0 bg-transparent px-2.5 py-2 text-left text-sm text-drift-body transition hover:bg-slate-100 hover:text-drift-ink ${FOCUS_RING}`}
        >
          <ArchiveIcon className="size-3.5" />
          Archive
        </button>
      </div>
    </details>
  );
}

export function SortableCardTile(props: CardTileProps & { onOpen: () => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: cardKey(props.card.id),
    data: { kind: 'card', cardId: props.card.id, columnId: props.card.columnId } satisfies Exclude<DragItem, null>,
    disabled: props.disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
    >
      <CardTile
        {...props}
        dragHandleRef={setActivatorNodeRef}
        dragHandleProps={props.disabled ? undefined : { ...attributes, ...listeners }}
      />
    </div>
  );
}

export function ColumnDragPreview({ name }: { name: string }) {
  return (
    <div className="w-[272px] rotate-1 rounded-xl border border-slate-200 bg-slate-100 p-2 shadow-[0_18px_36px_rgba(15,23,42,0.18)]">
      <div className="flex items-center gap-2 px-2 py-1">
        <GripVerticalIcon className="size-4 text-slate-400" />
        <span className="text-sm font-semibold text-drift-ink">{name}</span>
      </div>
    </div>
  );
}

function formatDue(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return {
    label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    overdue: value < todayKey,
  };
}
