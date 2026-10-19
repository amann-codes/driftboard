'use client';
// Wires the shared SyncClient to the browser: IndexedDB persistence, HTTP sync,
// WebSocket live updates + presence, online/offline detection, and a one-tab lock.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ClientSnapshot, Notice, OpInput, Role, SyncClient, UndoManager } from '@driftboard/shared';
import { API_URL, ApiError, api, cachedMe, deviceId } from './api';
import { idbGet, idbSet } from './idb';

// Bump when the shape stored in IndexedDB changes. Old cached board state is then
// thrown away and re-fetched, but pending ops are KEPT (they're upcast on the server).
const STORAGE_SCHEMA = 1;

export type Member = { id: string; name: string; role: Role };
export type PresenceUser = { userId: string; name: string; editing: string[] };
type BoardMeta = { role: Role; orgId: string; members: Member[] };
type Stored = ClientSnapshot & { meta: BoardMeta; schema: number };

export function useBoard(boardId: string) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'locked' | 'error'>('loading');
  const [error, setError] = useState('');
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [notices, setNotices] = useState<(Notice & { id: number })[]>([]);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [netOnline, setNetOnline] = useState(true);
  const [simOffline, setSimOffline] = useState(false);
  const [authLost, setAuthLost] = useState(false);

  const clientRef = useRef<SyncClient | null>(null);
  const undoRef = useRef<UndoManager | null>(null);
  const metaRef = useRef<BoardMeta | null>(null);
  const editingRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onlineRef = useRef(true);

  const notify = useCallback((n: Notice) => {
    const id = Date.now() + Math.random();
    setNotices(list => [...list.slice(-4), { ...n, id }]);
    setTimeout(() => setNotices(list => list.filter(x => x.id !== id)), 8000);
  }, []);

  const effectiveOnline = netOnline && !simOffline && !authLost;
  onlineRef.current = effectiveOnline;

  // ---- load + create the client ----
  useEffect(() => {
    let cancelled = false;
    let releaseLock: (() => void) | undefined;

    (async () => {
      setNetOnline(navigator.onLine);
      // Only one tab may edit a board at a time; otherwise two tabs would overwrite each other's outbox.
      if (navigator.locks) {
        const got = await new Promise<boolean>(resolve => {
          navigator.locks.request(`driftboard:${boardId}`, { ifAvailable: true }, lock => {
            if (!lock) return resolve(false);
            resolve(true);
            return new Promise<void>(r => (releaseLock = r));
          });
        });
        if (!got) return setStatus('locked');
      }

      const me = cachedMe();
      const key = `board:${boardId}`;
      let stored = await idbGet<Stored>(key);
      if (stored && stored.schema !== STORAGE_SCHEMA) stored = { ...stored, confirmed: undefined as any };

      let confirmed = stored?.confirmed;
      let meta = stored?.meta;
      try {
        const snap = await api(`/api/boards/${boardId}`);
        confirmed = snap.state;
        meta = { role: snap.role, orgId: snap.orgId, members: snap.members };
      } catch (e) {
        if (e instanceof ApiError && e.status === 401 && stored) setAuthLost(true);
        else if (e instanceof ApiError && e.status !== 401) {
          setError(e.message);
          return setStatus('error');
        }
        if (!confirmed || !meta) {
          setError(e instanceof ApiError && e.status === 401 ? 'Please sign in first.' : 'This board has not been opened on this device yet. Open it once while online.');
          return setStatus('error');
        }
      }
      if (cancelled || !me) {
        if (!me) {
          setError('Please sign in first.');
          setStatus('error');
        }
        return;
      }
      metaRef.current = meta!;

      const client = new SyncClient({
        actorId: me.user.id,
        clientId: deviceId(),
        role: meta!.role,
        memberIds: meta!.members.map(m => m.id),
        snapshot: { confirmed: confirmed!, pending: stored?.pending ?? [], lostEdits: stored?.lostEdits ?? [] },
        persist: snap => void idbSet(key, { ...snap, meta: metaRef.current, schema: STORAGE_SCHEMA }),
        onChange: rerender,
        onNotice: notify,
        transport: async req => {
          if (!onlineRef.current) throw new Error('offline');
          try {
            return await api(`/api/boards/${boardId}/sync`, { method: 'POST', body: JSON.stringify(req) });
          } catch (e) {
            if (e instanceof ApiError && e.status === 401) setAuthLost(true);
            if (e instanceof ApiError && e.status === 403) notify({ kind: 'rejected', message: e.message });
            throw e;
          }
        },
      });
      clientRef.current = client;
      undoRef.current = new UndoManager(client, id => metaRef.current?.members.find(m => m.id === id)?.name ?? 'someone');
      client.setOnline(onlineRef.current);
      setStatus('ready');
    })();

    return () => {
      cancelled = true;
      releaseLock?.();
      wsRef.current?.close();
    };
  }, [boardId, notify]);

  // ---- online / offline ----
  useEffect(() => {
    const up = () => setNetOnline(true);
    const down = () => setNetOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => {
    clientRef.current?.setOnline(effectiveOnline);
  }, [effectiveOnline, status]);

  // Retry timer: re-sends anything still pending (e.g. after a dropped response).
  useEffect(() => {
    const t = setInterval(() => {
      const c = clientRef.current;
      if (c && onlineRef.current && c.pending.length) void c.flush();
    }, 4000);
    return () => clearInterval(t);
  }, []);

  // ---- WebSocket: live ops + presence ----
  useEffect(() => {
    if (status !== 'ready' || !effectiveOnline) {
      wsRef.current?.close();
      setPresence([]);
      return;
    }
    let stopped = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = async () => {
      try {
        const { token } = await api('/api/ws-token');
        if (stopped) return;
        const ws = new WebSocket(`${API_URL.replace(/^http/, 'ws')}/ws?boardId=${boardId}&token=${token}`);
        wsRef.current = ws;
        const beat = () => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: 'presence', editing: editingRef.current }));
        ws.onopen = () => {
          beat();
          heartbeat = setInterval(beat, 3000);
          void clientRef.current?.flush(); // catch up on anything missed while disconnected
        };
        ws.onmessage = ev => {
          const msg = JSON.parse(ev.data);
          if (msg.t === 'ops') clientRef.current?.receive(msg.ops);
          if (msg.t === 'presence') setPresence(msg.users);
        };
        ws.onclose = () => {
          clearInterval(heartbeat);
          if (!stopped) retry = setTimeout(connect, 2000);
        };
      } catch {
        if (!stopped) retry = setTimeout(connect, 3000);
      }
    };
    void connect();
    return () => {
      stopped = true;
      clearInterval(heartbeat);
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, [status, effectiveOnline, boardId]);

  const setEditing = useCallback((cardId: string | null) => {
    editingRef.current = cardId;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'presence', editing: cardId }));
  }, []);

  const run = useCallback((input: OpInput) => undoRef.current?.run(input), []);

  return {
    status,
    error,
    client: clientRef.current,
    undo: undoRef.current,
    view: clientRef.current?.view,
    meta: metaRef.current,
    run,
    notices,
    notify,
    dismissNotice: (id: number) => setNotices(list => list.filter(n => n.id !== id)),
    presence,
    online: effectiveOnline,
    netOnline,
    simOffline,
    setSimOffline,
    authLost,
    setEditing,
  };
}
