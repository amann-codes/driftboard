import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { AppEnv, WEB_ORIGIN, auth, issueWsToken, requireUser, verifyWsToken } from './auth';
import { prisma } from './db';
import { heartbeat, join, leave } from './realtime';
import { boardRoutes } from './routes/boards';
import { orgRoutes, roleIn } from './routes/orgs';
import { workspaceRoutes } from './routes/workspace';

const app = new Hono<AppEnv>();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.use('*', logger());
app.use('/api/*', cors({ origin: WEB_ORIGIN, credentials: true, allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'], allowHeaders: ['Content-Type'] }));

app.get('/health', c => c.json({ ok: true }));

// Better Auth: /api/auth/sign-up/email, /api/auth/sign-in/email, /api/auth/get-session, ...
app.on(['GET', 'POST'], '/api/auth/*', c => auth.handler(c.req.raw));

// Everything else under /api needs a signed-in user (auth routes above already returned).
app.use('/api/*', requireUser);

app.get('/api/ws-token', async c => c.json({ token: await issueWsToken(c.get('user')) }));
app.route('/api', orgRoutes);
app.route('/api', workspaceRoutes);
app.route('/api', boardRoutes);

// WebSocket: /ws?boardId=...&token=...
app.get(
  '/ws',
  async (c, next) => {
    const user = await verifyWsToken(c.req.query('token') ?? '');
    if (!user) return c.text('unauthorized', 401);
    const board = await prisma.board.findUnique({ where: { id: c.req.query('boardId') ?? '' }, select: { orgId: true } });
    if (!board || !(await roleIn(board.orgId, user.id))) return c.text('forbidden', 403);
    c.set('user', { id: user.id, name: user.name, email: '' });
    await next();
  },
  upgradeWebSocket(c => {
    const boardId = c.req.query('boardId')!;
    const user = c.get('user');
    let connId = '';
    return {
      onOpen(_evt, ws) {
        connId = join(boardId, user.id, user.name, { send: d => ws.send(d), close: () => ws.close() });
      },
      onMessage(evt) {
        try {
          const msg = JSON.parse(String(evt.data));
          if (msg.t === 'presence') heartbeat(boardId, connId, typeof msg.editing === 'string' ? msg.editing : null);
        } catch {
          /* ignore garbage */
        }
      },
      onClose() {
        leave(boardId, connId);
      },
    };
  }),
);

const port = Number(process.env.PORT ?? 8787);
const server = serve({ fetch: app.fetch, port }, info => console.log(`Driftboard API on http://localhost:${info.port}`));
injectWebSocket(server);
