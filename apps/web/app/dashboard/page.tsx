import type { Metadata } from 'next';
import DashboardView from '@/components/workspace/DashboardView';

export const metadata: Metadata = {
  title: 'Dashboard · Driftboard',
  description: 'See your organizations, projects, and recently updated boards.',
};

export default function DashboardPage() {
  return <DashboardView />;
}
