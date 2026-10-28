import type { Metadata } from 'next';
import AuthLayout from '@/components/auth/AuthLayout';
import SignUpForm from '@/components/auth/SignUpForm';

export const metadata: Metadata = {
  title: 'Create your account · Driftboard',
  description: 'Create a Driftboard account and start collaborating on ideas and plans.',
};

export default function SignUpPage() {
  return (
    <AuthLayout>
      <SignUpForm />
    </AuthLayout>
  );
}
