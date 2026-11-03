'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import BoardView from '@/components/BoardView';
import { BoardLoading, BoardMissing } from '@/components/board/BoardStates';

function BoardPage() {
  const id = useSearchParams().get('id');
  if (!id) return <BoardMissing />;
  return <BoardView boardId={id} />;
}

export default function Page() {
  return (
    <Suspense fallback={<BoardLoading />}>
      <BoardPage />
    </Suspense>
  );
}
