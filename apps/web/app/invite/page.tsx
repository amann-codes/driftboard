import type { Metadata } from 'next';
import InviteCard from '@/components/invite/InviteCard';

export const metadata: Metadata = {
  title: 'Invitation · Driftboard',
  description: 'Review and accept your Driftboard invitation.',
};

export default function InvitePage() {
  return <InviteCard />;
}
