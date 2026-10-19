'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import BoardView from '@/components/BoardView';

// /board/?id=<boardId>. A query param (not /board/[id]) so the static export has
// ONE html file for every board, which the service worker can cache.
function BoardPage() {
  const id = useSearchParams().get('id');
  if (!id) return <div className="page">No board selected.</div>;
  return <BoardView boardId={id} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="page">Loading…</div>}>
      <BoardPage />
    </Suspense>
  );
}
