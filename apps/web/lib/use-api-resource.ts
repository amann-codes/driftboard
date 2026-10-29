'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from './api';
import { withReturnPath } from './return-to';

type Status = 'loading' | 'ready' | 'error';

export function useApiResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const requestSequence = useRef(0);

  const load = useCallback(
    async (quiet = false) => {
      const requestId = ++requestSequence.current;
      if (!quiet) {
        setStatus('loading');
        setError('');
        setNotFound(false);
      } else {
        setRefreshing(true);
      }

      try {
        const result = await api<T>(path);
        if (requestId !== requestSequence.current) return;
        setData(result);
        setNotFound(false);
        setStatus('ready');
      } catch (requestError) {
        if (requestId !== requestSequence.current) return;

        if (requestError instanceof ApiError && requestError.status === 401) {
          const next = `${window.location.pathname}${window.location.search}`;
          window.location.assign(withReturnPath('/signin/', next));
          return;
        }

        if (requestError instanceof ApiError && requestError.status === 404) {
          setNotFound(true);
          setStatus('error');
          return;
        }

        if (quiet) throw requestError;
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : "We couldn't load this page. Check your connection and try again.",
        );
        setStatus('error');
      } finally {
        if (requestId === requestSequence.current) setRefreshing(false);
      }
    },
    [path],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => () => {
      requestSequence.current += 1;
    },
    [],
  );

  return { data, status, error, notFound, refreshing, reload: load };
}
