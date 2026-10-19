// Live updates + presence over WebSocket, one "room" per board.
//
// server -> client  { t: 'ops', ops: CommittedOp[] }            new committed changes
//                   { t: 'presence', users: PresenceUser[] }    who is here / editing what
// client -> server  { t: 'presence', editing: cardId | null }   sent every 3s as a heartbeat
//
// A connection that sends nothing for 8s is dropped. Heartbeat 3s + sweep 1s means
// a closed laptop disappears from everyone's screen in under ~10s.
import type { CommittedOp } from '@driftboard/shared';

type Socket = { send: (data: string) => void; close: () => void };

type Conn = { id: string; boardId: string; userId: string; name: string; editing: string | null; lastSeen: number; ws: Socket };

export type PresenceUser = { userId: string; name: string; editing: string[] };

const STALE_MS = 8_000;
const rooms = new Map<string, Map<string, Conn>>();

export function join(boardId: string, userId: string, name: string, ws: Socket): string {
  const id = crypto.randomUUID();
  const room = rooms.get(boardId) ?? new Map<string, Conn>();
  room.set(id, { id, boardId, userId, name, editing: null, lastSeen: Date.now(), ws });
  rooms.set(boardId, room);
  broadcastPresence(boardId);
  return id;
}

export function leave(boardId: string, connId: string) {
  const room = rooms.get(boardId);
  if (!room?.delete(connId)) return;
  if (room.size === 0) rooms.delete(boardId);
  broadcastPresence(boardId);
}

export function heartbeat(boardId: string, connId: string, editing: string | null) {
  const conn = rooms.get(boardId)?.get(connId);
  if (!conn) return;
  const changed = conn.editing !== editing;
  conn.editing = editing;
  conn.lastSeen = Date.now();
  if (changed) broadcastPresence(boardId);
}

export function broadcastOps(boardId: string, ops: CommittedOp[]) {
  if (!ops.length) return;
  send(boardId, { t: 'ops', ops });
}

function broadcastPresence(boardId: string) {
  const room = rooms.get(boardId);
  if (!room) return;
  // One entry per person even if they have two tabs open.
  const byUser = new Map<string, PresenceUser>();
  for (const c of room.values()) {
    const u = byUser.get(c.userId) ?? { userId: c.userId, name: c.name, editing: [] };
    if (c.editing && !u.editing.includes(c.editing)) u.editing.push(c.editing);
    byUser.set(c.userId, u);
  }
  send(boardId, { t: 'presence', users: [...byUser.values()] });
}

function send(boardId: string, msg: unknown) {
  const room = rooms.get(boardId);
  if (!room) return;
  const data = JSON.stringify(msg);
  for (const c of room.values()) {
    try {
      c.ws.send(data);
    } catch {
      /* dead socket; the sweeper removes it */
    }
  }
}

// Sweep connections whose heartbeat stopped (network dropped without a close frame).
setInterval(() => {
  const now = Date.now();
  for (const [boardId, room] of rooms) {
    for (const c of room.values()) {
      if (now - c.lastSeen > STALE_MS) {
        try {
          c.ws.close();
        } catch {}
        leave(boardId, c.id);
      }
    }
  }
}, 1_000).unref();
