'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, OpInput, cardsInColumn, keyBetween, liveColumns, placementInput } from '@driftboard/shared';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragOverEvent,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cachedMe } from '@/lib/api';
import type { WorkspaceUser } from '@/lib/workspace';
import { copyText } from '@/lib/workspace';
import { useBoard } from '@/lib/use-board';
import { ToastProvider, useToast } from '@/components/workspace/Toast';
import { PlusIcon } from '@/components/workspace/icons';
import CardModal from './CardModal';
import { BoardColumn, CardTile, ColumnDragPreview, DragItem, SortableCardTile, cardKey, columnKey } from './board/BoardColumn';
import { ConfirmColumnDelete, CreateColumnDialog } from './board/BoardDialogs';
import BoardInspector from './board/BoardInspector';
import { BoardLoading, BoardLocked, BoardUnavailable } from './board/BoardStates';
import BoardToolbar from './board/BoardToolbar';
import { ListPlusIcon } from './board/icons';

export default function BoardView({ boardId }: { boardId: string }) {
  return (
    <ToastProvider>
      <BoardWorkspace boardId={boardId} />
    </ToastProvider>
  );
}

function BoardWorkspace({ boardId }: { boardId: string }) {
  const b = useBoard(boardId);
  const { push } = useToast();
  const [active, setActive] = useState<DragItem>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [createColumnOpen, setCreateColumnOpen] = useState(false);
  const [deleteColumnId, setDeleteColumnId] = useState<string | null>(null);
  const [user, setUser] = useState<WorkspaceUser>();
  const seenNotices = useRef(new Set<number>());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    for (const notice of b.notices) {
      if (seenNotices.current.has(notice.id)) continue;
      seenNotices.current.add(notice.id);
      push({
        kind: notice.kind === 'rejected' ? 'error' : 'info',
        message: notice.message,
      });
    }
  }, [b.notices, push]);

  useEffect(() => {
    const cached = cachedMe()?.user;
    if (cached?.id) {
      setUser({ id: cached.id, name: cached.name, email: cached.email ?? '' });
      return;
    }
    const actorId = b.client?.actorId;
    const member = b.meta?.members.find(item => item.id === actorId);
    if (actorId && member) setUser({ id: actorId, name: member.name, email: '' });
  }, [b.meta, b.client?.actorId]);

  useEffect(() => {
    b.setEditing(openCardId);
  }, [openCardId, b.setEditing]);

  useEffect(() => {
    if (!openCardId || !b.view || b.view.cards[openCardId]) return;
    setOpenCardId(null);
  }, [b.view, openCardId]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1279px)');
    const apply = () => {
      setDrawer(media.matches);
      setInspectorOpen(!media.matches);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !b.undo) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
      const redo = event.shiftKey || event.key.toLowerCase() === 'y';
      if (event.key.toLowerCase() !== 'z' && event.key.toLowerCase() !== 'y') return;
      event.preventDefault();
      const result = redo ? b.undo.redo() : b.undo.undo();
      if (!result.ok) push({ kind: 'info', message: result.message });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [b.undo, push]);

  const pendingByCard = useMemo(() => {
    const map = new Map<string, number>();
    for (const op of b.client?.pending ?? []) {
      const cardId = (op as any).cardId as string | undefined;
      if (cardId) map.set(cardId, (map.get(cardId) ?? 0) + 1);
    }
    return map;
  }, [b.client?.pending]);

  const editorsByCard = useMemo(() => {
    const map = new Map<string, { userId: string; name: string }[]>();
    for (const viewer of b.presence) {
      for (const cardId of viewer.editing) {
        map.set(cardId, [...(map.get(cardId) ?? []), viewer]);
      }
    }
    return map;
  }, [b.presence]);

  if (b.status === 'loading') return <BoardLoading />;
  if (b.status === 'locked') return <BoardLocked />;
  if (b.status === 'error' || !b.view || !b.client || !b.meta) {
    return (
      <BoardUnavailable
        title="We couldn't open this board"
        message={b.error || 'Board data is unavailable. Try again in a moment.'}
        retry
      />
    );
  }

  const view = b.view;
  const client = b.client;
  const meta = b.meta;
  const readOnly = meta.role === 'VIEWER';
  const columns = liveColumns(view);
  const pending = client.pending;
  const canUndo = Boolean(b.undo?.canUndo);
  const canRedo = Boolean(b.undo?.canRedo);
  const currentUserId = client.actorId;

  const run = (input: OpInput) => b.run(input);

  const memberFor = (id: string) => meta.members.find(member => member.id === id);

  const performUndo = () => {
    if (!b.undo) return;
    const result = b.undo.undo();
    if (!result.ok) push({ kind: 'info', message: result.message });
  };

  const performRedo = () => {
    if (!b.undo) return;
    const result = b.undo.redo();
    if (!result.ok) push({ kind: 'info', message: result.message });
  };

  const copyLink = async () => {
    try {
      await copyText(`${window.location.origin}/board/?id=${encodeURIComponent(boardId)}`);
      push({ kind: 'success', message: 'Board link copied.' });
    } catch {
      push({ kind: 'error', message: "We couldn't copy the board link." });
    }
  };

  const openCard = (cardId: string) => {
    if (drawer) setInspectorOpen(false);
    setOpenCardId(cardId);
  };

  const archiveCard = (card: Card) => {
    run({ type: 'card.set', cardId: card.id, field: 'archived', value: true });
    push({ kind: 'info', message: 'Card archived. You can restore it from board details or Undo.' });
  };

  const tileProps = (card: Card) => {
    const assignee = card.assigneeId ? memberFor(card.assigneeId) : null;
    return {
      card,
      pending: pendingByCard.get(card.id) ?? 0,
      editors: (editorsByCard.get(card.id) ?? []).filter(editor => editor.userId !== currentUserId),
      assignee: assignee ? { id: assignee.id, name: assignee.name } : null,
      hasConflict: client.lostEdits.some(edit => edit.cardId === card.id),
      readOnly,
      onOpen: () => openCard(card.id),
      onArchive: () => archiveCard(card),
    };
  };

  const onDragStart = (event: DragStartEvent) => {
    setActive((event.active.data.current as DragItem) ?? null);
    setOverColumnId(null);
  };

  const onDragOver = (event: DragOverEvent) => {
    const data = event.over?.data.current as DragItem | undefined;
    setOverColumnId(data ? data.columnId : null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const from = event.active.data.current as DragItem | undefined;
    const over = event.over?.data.current as DragItem | undefined;
    setActive(null);
    setOverColumnId(null);
    if (!from || !over || readOnly) return;

    const translated = event.active.rect.current.translated;
    const below = Boolean(translated && translated.top + translated.height / 2 > event.over!.rect.top + event.over!.rect.height / 2);

    if (from.kind === 'card' && from.cardId) {
      const cardId = from.cardId;
      const card = view.cards[cardId];
      if (!card) return;
      const targetColumnId = over.columnId;
      const siblings = cardsInColumn(view, targetColumnId).filter(item => item.id !== cardId);
      let index: number;
      if (over.kind === 'card' && over.cardId) {
        const overIndex = siblings.findIndex(item => item.id === over.cardId);
        if (overIndex < 0) return;
        index = overIndex + (below ? 1 : 0);
      } else {
        index = siblings.length;
      }
      const current = cardsInColumn(view, targetColumnId);
      const currentIndex = current.findIndex(item => item.id === cardId);
      const left = siblings[index - 1]?.id ?? null;
      const right = siblings[index]?.id ?? null;
      if (
        card.columnId === targetColumnId &&
        left === (current[currentIndex - 1]?.id ?? null) &&
        right === (current[currentIndex + 1]?.id ?? null)
      ) {
        return;
      }
      run(placementInput(cardId, targetColumnId, siblings, index));
      return;
    }

    if (from.kind === 'column' && over.kind === 'column') {
      const columnId = from.columnId;
      if (over.columnId === columnId) return;
      const others = columns.filter(column => column.id !== columnId);
      const index = others.findIndex(column => column.id === over.columnId) + (below ? 1 : 0);
      const left = others[index - 1] ?? null;
      const right = others[index] ?? null;
      const pos = left && right && left.pos === right.pos ? left.pos : keyBetween(left?.pos ?? null, right?.pos ?? null);
      run({ type: 'column.move', columnId, pos, afterId: left?.id ?? null, beforeId: right?.id ?? null });
    }
  };

  const addCard = (columnId: string, title: string) => {
    const siblings = cardsInColumn(view, columnId);
    const last = siblings[siblings.length - 1];
    run({
      type: 'card.create',
      cardId: crypto.randomUUID(),
      columnId,
      pos: keyBetween(last?.pos ?? null, null),
      afterId: last?.id ?? null,
      beforeId: null,
      title,
    });
  };

  const addColumn = (name: string) => {
    const all = Object.values(view.columns).sort((a, c) => (a.pos < c.pos ? -1 : 1));
    run({
      type: 'column.create',
      columnId: crypto.randomUUID(),
      name,
      pos: keyBetween(all[all.length - 1]?.pos ?? null, null),
    });
    push({ kind: 'success', message: `List “${name}” created.` });
  };

  const columnToDelete = deleteColumnId ? view.columns[deleteColumnId] : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#f7f8fb] text-drift-ink">
      <BoardToolbar
        name={view.name}
        role={meta.role}
        orgId={meta.orgId}
        projectId={meta.projectId}
        orgName={meta.orgName}
        projectName={meta.projectName}
        user={user}
        presence={b.presence}
        currentUserId={currentUserId}
        online={b.online}
        authLost={b.authLost}
        simOffline={b.simOffline}
        pending={pending.length}
        sending={client.sending.size}
        syncError={b.syncError}
        wsStatus={b.wsStatus}
        canUndo={canUndo}
        canRedo={canRedo}
        inspectorOpen={inspectorOpen}
        onUndo={performUndo}
        onRedo={performRedo}
        onToggleInspector={() => setInspectorOpen(open => !open)}
        onOpenInspector={() => setInspectorOpen(true)}
        onCopyLink={() => void copyLink()}
        onSimOfflineChange={b.setSimOffline}
      />

      <div className="flex min-h-0 flex-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActive(null);
            setOverColumnId(null);
          }}
        >
          <main id="board-canvas" className="min-w-0 flex-1 overflow-auto">
            {columns.length === 0 ? (
              <div className="grid h-full place-items-center p-6">
                <div className="max-w-md rounded-2xl border border-dashed border-slate-300 bg-white/70 px-7 py-9 text-center">
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-drift-accent-soft text-drift-accent">
                    <ListPlusIcon />
                  </span>
                  <h2 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-drift-ink">Start with a list</h2>
                  <p className="mt-2 text-sm leading-6 text-drift-body">
                    {readOnly
                      ? 'This board has no lists yet. An owner or editor can add the first one.'
                      : 'Lists group cards into stages of work. Add your first list, then start adding cards.'}
                  </p>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => setCreateColumnOpen(true)}
                      className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-drift-accent px-4 text-sm font-medium text-white shadow-sm transition hover:bg-drift-accent-hover"
                    >
                      <PlusIcon className="size-4" />
                      Create first list
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-h-full w-max items-start gap-3 p-3 sm:gap-4 sm:p-5">
                <SortableContext items={columns.map(column => columnKey(column.id))} strategy={horizontalListSortingStrategy}>
                  {columns.map(column => {
                    const cards = cardsInColumn(view, column.id);
                    return (
                      <BoardColumn
                        key={column.id}
                        id={column.id}
                        name={column.name}
                        count={cards.length}
                        readOnly={readOnly}
                        dropTarget={overColumnId === column.id && active?.kind === 'card'}
                        onRename={name => run({ type: 'column.rename', columnId: column.id, name })}
                        onDelete={() => setDeleteColumnId(column.id)}
                        onAddCard={title => addCard(column.id, title)}
                      >
                        <SortableContext items={cards.map(card => cardKey(card.id))} strategy={verticalListSortingStrategy}>
                          {cards.map(card => (
                            <SortableCardTile key={card.id} disabled={readOnly} {...tileProps(card)} />
                          ))}
                        </SortableContext>
                      </BoardColumn>
                    );
                  })}
                </SortableContext>

                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setCreateColumnOpen(true)}
                    className="flex w-[272px] shrink-0 items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/50 px-4 py-3 text-left text-sm font-medium text-drift-body transition hover:border-slate-400 hover:bg-white hover:text-drift-ink"
                  >
                    <PlusIcon className="size-4" />
                    Add list
                  </button>
                )}
              </div>
            )}
          </main>

          <DragOverlay>
            {active?.kind === 'card' && active.cardId && view.cards[active.cardId] ? (
              <div className="w-[248px]">
                <CardTile {...tileProps(view.cards[active.cardId])} preview />
              </div>
            ) : active?.kind === 'column' ? (
              <ColumnDragPreview name={view.columns[active.columnId]?.name ?? 'List'} />
            ) : null}
          </DragOverlay>
        </DndContext>

        <BoardInspector
          open={inspectorOpen}
          drawer={drawer}
          onClose={() => setInspectorOpen(false)}
          name={view.name}
          role={meta.role}
          orgId={meta.orgId}
          projectId={meta.projectId}
          orgName={meta.orgName}
          projectName={meta.projectName}
          members={meta.members}
          presence={b.presence}
          currentUserId={currentUserId}
          view={view}
          pending={pending}
          sending={client.sending}
          online={b.online}
          wsStatus={b.wsStatus}
          syncError={b.syncError}
          onCopyLink={() => void copyLink()}
          onRetry={() => void client.flush()}
          onOpenCard={openCard}
          readOnly={readOnly}
          run={run}
        />
      </div>

      {openCardId && view.cards[openCardId] && (
        <CardModal
          boardId={boardId}
          card={view.cards[openCardId]}
          client={client}
          members={meta.members}
          readOnly={readOnly}
          online={b.online}
          editors={(editorsByCard.get(openCardId) ?? []).filter(editor => editor.userId !== currentUserId)}
          run={run}
          onClose={() => setOpenCardId(null)}
        />
      )}

      <CreateColumnDialog open={createColumnOpen} onClose={() => setCreateColumnOpen(false)} onCreate={addColumn} />

      {columnToDelete && (
        <ConfirmColumnDelete
          columnName={columnToDelete.name}
          onClose={() => setDeleteColumnId(null)}
          onConfirm={() => {
            run({ type: 'column.delete', columnId: columnToDelete.id });
            push({ kind: 'info', message: `List “${columnToDelete.name}” deleted. Its cards are in the archive.` });
          }}
        />
      )}
    </div>
  );
}
