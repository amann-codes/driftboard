'use client';
// Home: your organizations, projects and boards, with sign in when there is no session.
import { useEffect, useState } from 'react';
import AuthLayout from '@/components/auth/AuthLayout';
import SignInForm from '@/components/auth/SignInForm';
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
  if (!me) {
    return (
      <AuthLayout>
        <SignInForm onSuccess={load} />
      </AuthLayout>
    );
  }

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

