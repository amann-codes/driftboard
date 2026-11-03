'use client';

import Avatar from '@/components/Avatar';
import type { PresenceUser } from '@/lib/use-board';

export default function PresenceAvatars({
  presence,
  currentUserId,
}: {
  presence: PresenceUser[];
  currentUserId?: string;
}) {
  const others = presence.filter(user => user.userId !== currentUserId);
  if (others.length === 0) return null;

  const visible = others.slice(0, 3);
  const extra = others.length - visible.length;
  const names = others.map(user => user.name).join(', ');

  return (
    <div className="hidden items-center md:flex" aria-label={`${others.length} other ${others.length === 1 ? 'person' : 'people'} viewing`} title={`${names} viewing this board`}>
      <div className="flex items-center -space-x-1.5">
        {visible.map(user => (
          <span key={user.userId} className="rounded-full ring-2 ring-white">
            <Avatar id={user.userId} name={user.name} className="size-7 text-[10px]" />
          </span>
        ))}
        {extra > 0 && (
          <span className="grid size-7 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-drift-body ring-2 ring-white">
            +{extra}
          </span>
        )}
      </div>
    </div>
  );
}
