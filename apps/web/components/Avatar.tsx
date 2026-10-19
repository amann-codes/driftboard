// Coloured initials; the colour is derived from the user id so it's the same everywhere.
const COLORS = ['#e8590c', '#2b8a3e', '#1971c2', '#9c36b5', '#c2255c', '#0c8599', '#5f3dc4', '#e67700'];

export function colorFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export default function Avatar({ id, name, title }: { id: string; name: string; title?: string }) {
  const initials = name
    .split(/\s+/)
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="avatar" style={{ background: colorFor(id) }} title={title ?? name}>
      {initials || '?'}
    </span>
  );
}
