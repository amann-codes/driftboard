import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { Context, Next } from 'hono';
import { sign, verify } from 'hono/jwt';
import { prisma } from './db';

export const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-jwt-secret-change-me';

// Better Auth owns sign-up, sign-in and sessions (cookie based).
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:8787',
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  trustedOrigins: [WEB_ORIGIN],
});

export type AuthUser = { id: string; name: string; email: string };
export type AppEnv = { Variables: { user: AuthUser } };

// Hono middleware: 401 unless there is a valid Better Auth session.
export async function requireUser(c: Context<AppEnv>, next: Next) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'Please sign in' }, 401);
  c.set('user', { id: session.user.id, name: session.user.name, email: session.user.email });
  await next();
}

// Short-lived JWT for the WebSocket. Browsers can't set headers on a WebSocket,
// so the client fetches this (with its session cookie) and passes it as ?token=.
export async function issueWsToken(user: AuthUser) {
  return sign({ sub: user.id, name: user.name, exp: Math.floor(Date.now() / 1000) + 60 * 60 }, JWT_SECRET, 'HS256');
}

export async function verifyWsToken(token: string): Promise<{ id: string; name: string } | null> {
  try {
    const p = (await verify(token, JWT_SECRET, 'HS256')) as { sub: string; name: string };
    return { id: p.sub, name: p.name };
  } catch {
    return null;
  }
}
