import type { TotpSetupFormInput } from '@/features/identity/libs/totp-setup/totpSetupFormSchema';
import { type FormEventHandler } from 'react';
import { type UseFormReturn } from 'react-hook-form';
export interface TotpSetupPageViewProps {
  form: UseFormReturn<TotpSetupFormInput>;
  onStart: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  pendingSetup: boolean;
  pendingVerify: boolean;
  requestId?: string;
  secretCode?: string;
  setupError: boolean;
}
