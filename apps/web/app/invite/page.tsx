'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

function Invite() {
  const token = useSearchParams().get('token') ?? '';
  const [info, setInfo] = useState<{ orgName: string; role: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/invites/${token}`)
      .then(setInfo)
      .catch(e => setError(e.status === 401 ? 'Sign in (or sign up) first, then open this link again.' : e.message));
  }, [token]);

  const accept = async () => {
    try {
      await api(`/api/invites/${token}/accept`, { method: 'POST' });
      window.location.href = '/';
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 480 }}>
      <div className="card-box">
        <h2 style={{ marginTop: 0 }}>Join organization</h2>
        {error && (
          <p>
            {error} <a href="/">Go to sign in</a>
          </p>
        )}
        {info && (
          <>
            <p>
              You were invited to <strong>{info.orgName}</strong> as <span className="pill">{info.role}</span>.
            </p>
            <button className="primary" onClick={accept}>
              Accept invite
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense>
      <Invite />
    </Suspense>
  );
}
