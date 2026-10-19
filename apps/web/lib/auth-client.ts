import { createAuthClient } from 'better-auth/react';
import { API_URL } from './api';

// Better Auth browser client: signIn.email, signUp.email, signOut, useSession.
export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: { credentials: 'include' },
});
