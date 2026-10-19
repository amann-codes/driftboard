import type { ReactNode } from 'react';
import SwRegister from '@/components/SwRegister';
import './globals.css';

export const metadata = { title: 'Driftboard', description: 'An offline-first kanban board' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
