import { authenticatedRequest } from '@/shared/apis/auth/authenticatedRequest';
import { Button } from '@/shared/components/button';
import { Input } from '@/shared/components/input';
import {
  betaInvitationRequestSchema,
  betaInvitationResponseSchema,
} from '@flex-thia/contracts/identity/user-management';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
export function BetaInvitationForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const mutation = useMutation({
    mutationFn: (normalizedEmail: string) =>
      authenticatedRequest({
        body: { email: normalizedEmail },
        method: 'POST',
        path: '/admin/users/invitations',
        response: { kind: 'json', schema: betaInvitationResponseSchema },
      }),
    onSuccess: () => setEmail(''),
  });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = betaInvitationRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError('학교 이메일을 입력해 주세요.');
      return;
    }
    setError(undefined);
    mutation.mutate(parsed.data.email);
  };
  return (
    <form
      className='grid gap-control rounded-panel border border-default bg-surface p-section'
      noValidate
      onSubmit={onSubmit}
    >
      <label
        className='text-body text-primary'
        htmlFor='beta-invitation-email'
      >
        학교 이메일
      </label>
      <Input
        id='beta-invitation-email'
        onChange={(event) => setEmail(event.target.value)}
        type='email'
        value={email}
      />
      <p className='text-caption text-subtle'>
        이 기록은 가입 권한을 제한하지 않습니다.
      </p>
      {error ? (
        <p
          aria-live='polite'
          className='text-body text-danger'
        >
          {error}
        </p>
      ) : null}
      {mutation.isError ? (
        <p
          aria-live='polite'
          className='text-body text-danger'
        >
          beta 안내를 기록하지 못했습니다. 다시 시도해 주세요.
        </p>
      ) : null}
      <Button
        disabled={mutation.isPending}
        type='submit'
      >
        {mutation.isPending ? '기록 중' : 'beta 안내 기록'}
      </Button>
    </form>
  );
}
