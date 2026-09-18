import type { VerifyEmailCodeInput } from '@flex-thia/contracts/identity/auth';
import { type FormEventHandler } from 'react';
import { type UseFormReturn } from 'react-hook-form';
export interface EmailChallengePageViewProps {
  email?: string;
  errorMessage?: string;
  form: UseFormReturn<VerifyEmailCodeInput>;
  onResend: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  pending: boolean;
  resendPending: boolean;
  resendSeconds: number;
}
