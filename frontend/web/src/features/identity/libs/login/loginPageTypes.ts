import type { StartEmailAuthenticationInput } from '@flex-thia/contracts/identity/auth';
import { type FormEventHandler } from 'react';
import { type UseFormReturn } from 'react-hook-form';
export interface LoginPageViewProps {
  form: UseFormReturn<StartEmailAuthenticationInput>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  pending: boolean;
  requestId?: string;
}
