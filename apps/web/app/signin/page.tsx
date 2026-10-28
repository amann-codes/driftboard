import type { Metadata } from 'next';
import AuthLayout from '@/components/auth/AuthLayout';
import SignInForm from '@/components/auth/SignInForm';

export const metadata: Metadata = {
  title: 'Sign in · Driftboard',
  description: 'Sign in to Driftboard to continue collaborating with your team.',
};

export default function SignInPage() {
  return (
    <AuthLayout>
      <SignInForm />
    </AuthLayout>
  );
}
