import type { Metadata } from 'next';
import OrganizationsView from '@/components/workspace/OrganizationsView';

export const metadata: Metadata = {
  title: 'Organizations · Driftboard',
  description: 'Browse your organizations, projects, and boards.',
};

export default function OrganizationsPage() {
  return <OrganizationsView />;
}
