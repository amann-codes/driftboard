import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import SwRegister from '@/components/SwRegister';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata = { title: 'Driftboard', description: 'An offline-first kanban board' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} font-sans antialiased`}>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
