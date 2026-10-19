'use client';
import { useEffect } from 'react';

// Registers public/sw.js so the app shell is cached for offline use.
export default function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
