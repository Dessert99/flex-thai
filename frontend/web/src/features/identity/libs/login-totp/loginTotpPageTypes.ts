import type { LoginTotpFormInput } from '@/features/identity/libs/login-totp/loginTotpFormSchema';
import { type FormEventHandler } from 'react';
import { type UseFormReturn } from 'react-hook-form';
export interface LoginTotpPageViewProps {
  form: UseFormReturn<LoginTotpFormInput>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  pending: boolean;
  requestId?: string;
}
