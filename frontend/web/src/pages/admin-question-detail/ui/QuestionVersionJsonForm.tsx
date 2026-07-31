/** RHF blank JSON 입력과 전체 교체 확인 Dialog를 소유한다 */
import { zodResolver } from '@hookform/resolvers/zod';
import type { AdminQuestionVersionPayload } from '@flex-thia/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { parseQuestionVersionPayload } from '../model/parseQuestionVersionPayload';
import {
  questionVersionJsonFormSchema,
  type QuestionVersionJsonFormValues,
} from '../model/questionVersionJsonFormSchema';

interface QuestionVersionJsonFormProps {
  disabled: boolean;
  initialPayload?: AdminQuestionVersionPayload;
  onReplace: (payload: AdminQuestionVersionPayload) => void;
}

/** 고급 편집용 canonical JSON을 확인 후 전체 교체로 전달한다 */
export function QuestionVersionJsonForm({
  disabled,
  initialPayload,
  onReplace,
}: QuestionVersionJsonFormProps) {
  const [pendingPayload, setPendingPayload] =
    useState<AdminQuestionVersionPayload>();
  const form = useForm<QuestionVersionJsonFormValues>({
    defaultValues: {
      payloadJson:
        initialPayload === undefined
          ? ''
          : JSON.stringify(initialPayload, null, 2),
    },
    resolver: zodResolver(questionVersionJsonFormSchema),
  });

  const inspectPayload = form.handleSubmit(({ payloadJson }) => {
    const parsed = parseQuestionVersionPayload(payloadJson);
    if (!parsed.ok) {
      form.setError('payloadJson', {
        message: parsed.path
          ? `${parsed.path}: ${parsed.message}`
          : parsed.message,
      });
      return;
    }
    setPendingPayload(parsed.payload);
  });

  return (
    <form
      className='grid gap-cluster'
      onSubmit={(event) => void inspectPayload(event)}
    >
      <div className='grid gap-cluster'>
        <Label htmlFor='question-version-json'>canonical 문제 버전 JSON</Label>
        <Textarea
          aria-invalid={form.formState.errors.payloadJson !== undefined}
          id='question-version-json'
          rows={18}
          {...form.register('payloadJson')}
        />
        <p className='text-caption text-subtle'>
          구조화 form에서 제공하지 않는 토큰·표현까지 직접 편집할 때 사용합니다.
        </p>
        {form.formState.errors.payloadJson?.message ? (
          <p className='text-body text-danger'>
            {form.formState.errors.payloadJson.message}
          </p>
        ) : null}
      </div>
      <Button
        disabled={disabled}
        type='submit'
      >
        전체 교체 검토
      </Button>
      <Dialog
        onOpenChange={(open) => {
          if (!open) setPendingPayload(undefined);
        }}
        open={pendingPayload !== undefined}
      >
        <DialogContent className='bg-surface'>
          <DialogHeader>
            <DialogTitle>문제 버전을 전체 교체할까요?</DialogTitle>
            <DialogDescription>
              입력한 canonical JSON이 기존 DRAFT 전체를 대체합니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type='button'
                variant='outline'
              >
                취소
              </Button>
            </DialogClose>
            <Button
              disabled={disabled}
              onClick={() => {
                if (pendingPayload !== undefined) {
                  onReplace(pendingPayload);
                  setPendingPayload(undefined);
                }
              }}
              type='button'
            >
              전체 교체 확정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
