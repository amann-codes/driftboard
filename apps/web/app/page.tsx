'use client';
// Home: sign in / sign up (Better Auth), then your organizations, projects and boards.
import { useEffect, useState } from 'react';
import { api, cachedMe, saveMe } from '@/lib/api';
import { authClient } from '@/lib/auth-client';

type Me = {
  user: { id: string; name: string; email: string };
  orgs: { id: string; name: string; role: string; projects: { id: string; name: string; boards: { id: string; name: string }[] }[] }[];
};

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const load = async () => {
    try {
      const data = await api<Me>('/api/me');
      saveMe(data);
      setMe(data);
      setOffline(false);
    } catch (e: any) {
      if (e?.status === 401) {
        setMe(null);
        localStorage.removeItem('driftboard.me');
      } else {
        // Network down: show what we knew last time.
        setMe(cachedMe());
        setOffline(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <div className="page">Loading…</div>;
  if (!me) return <AuthForm onDone={load} />;

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Driftboard</h1>
        <span className="spacer" />
        <span className="muted">
          {me.user.name} · {me.user.email}
        </span>
        <button
          onClick={async () => {
            await authClient.signOut();
            localStorage.removeItem('driftboard.me');
            setMe(null);
          }}
        >
          Sign out
        </button>
      </div>
      {offline && <p className="pill">Offline: showing your last known boards. Boards you opened before still work.</p>}
      {me.orgs.map(org => (
        <OrgBox key={org.id} org={org} onChange={load} disabled={offline} />
      ))}
      {!offline && <CreateInline placeholder="New organization name" label="Create organization" onCreate={name => api('/api/orgs', { method: 'POST', body: JSON.stringify({ name }) }).then(load)} />}
    </div>
  );
}

function OrgBox({ org, onChange, disabled }: { org: Me['orgs'][number]; onChange: () => void; disabled: boolean }) {
  const [invite, setInvite] = useState('');
  const canEdit = org.role !== 'VIEWER';
  const makeInvite = async (role: 'EDITOR' | 'VIEWER') => {
    const res = await api(`/api/orgs/${org.id}/invites`, { method: 'POST', body: JSON.stringify({ role }) });
    setInvite(res.url);
    navigator.clipboard?.writeText(res.url).catch(() => {});
  };
  return (
    <div className="card-box">
      <div className="row">
        <h2 style={{ margin: 0, fontSize: 18 }}>{org.name}</h2>
        <span className="pill">{org.role}</span>
        <span className="spacer" />
        {org.role === 'OWNER' && !disabled && (
          <>
            <button onClick={() => makeInvite('EDITOR')}>Invite link (Editor)</button>
            <button onClick={() => makeInvite('VIEWER')}>Invite link (Viewer)</button>
          </>
        )}
      </div>
      {invite && (
        <p className="muted">
          Copied to clipboard: <code>{invite}</code>
        </p>
      )}
      {org.projects.map(p => (
        <div key={p.id} style={{ marginTop: 12 }}>
          <strong>{p.name}</strong>
          <ul>
            {p.boards.map(b => (
              <li key={b.id}>
                <a href={`/board/?id=${b.id}`}>{b.name}</a>
              </li>
            ))}
          </ul>
          {canEdit && !disabled && (
            <CreateInline
              placeholder="New board name"
              label="Add board"
              onCreate={name => api(`/api/projects/${p.id}/boards`, { method: 'POST', body: JSON.stringify({ name }) }).then(onChange)}
            />
          )}
        </div>
      ))}
      {canEdit && !disabled && (
        <div style={{ marginTop: 12 }}>
          <CreateInline
            placeholder="New project name"
            label="Add project"
            onCreate={name => api(`/api/orgs/${org.id}/projects`, { method: 'POST', body: JSON.stringify({ name }) }).then(onChange)}
          />
        </div>
      )}
    </div>
  );
}

function CreateInline({ placeholder, label, onCreate }: { placeholder: string; label: string; onCreate: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState('');
  return (
    <form
      className="row"
      onSubmit={async e => {
        e.preventDefault();
        if (!name.trim()) return;
        await onCreate(name.trim());
        setName('');
      }}
    >
      <input style={{ maxWidth: 280 }} value={name} placeholder={placeholder} onChange={e => setName(e.target.value)} />
      <button type="submit">{label}</button>
    </form>
  );
}

function AuthForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('owner@driftboard.dev');
  const [password, setPassword] = useState('Driftboard123!');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const res = mode === 'in' ? await authClient.signIn.email({ email, password }) : await authClient.signUp.email({ email, password, name });
    if (res.error) setError(res.error.message ?? 'Failed');
    else onDone();
  };

  return (
    <div className="page" style={{ maxWidth: 420 }}>
      <h1>Driftboard</h1>
      <form className="card-box" onSubmit={submit}>
        <h2 style={{ marginTop: 0 }}>{mode === 'in' ? 'Sign in' : 'Create account'}</h2>
        {mode === 'up' && (
          <>
            <label className="field-label">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} required />
          </>
        )}
        <label className="field-label">Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <label className="field-label">Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" type="submit">
            {mode === 'in' ? 'Sign in' : 'Sign up'}
          </button>
          <button type="button" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
            {mode === 'in' ? 'Need an account?' : 'Have an account?'}
          </button>
        </div>
        <p className="muted">Seeded users: owner@ / editor@ / viewer@driftboard.dev, password Driftboard123!</p>
      </form>
    </div>
  );
}
