/** canonical JSON 파일·텍스트 검증과 논리적 제출 명령 수명을 관리한다 */
import {
  contentImportRequestSchema,
  type ContentImportRequest,
} from '@flex-thia/contracts';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { isApiError } from '@/shared/api';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import type { ContentImportCommand } from '../api/contentImportQueries';

interface ContentImportFormProps {
  error: unknown;
  onReset: () => void;
  onSubmit: (command: ContentImportCommand) => void;
  pending: boolean;
  succeeded: boolean;
}

/** 유효하지 않은 원문을 전송하지 않고 실패 재전송에만 멱등 키를 재사용한다 */
export function ContentImportForm({
  error,
  onReset,
  onSubmit,
  pending,
  succeeded,
}: ContentImportFormProps) {
  const [source, setSource] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [failedCommand, setFailedCommand] =
    useState<ContentImportCommand | null>(null);

  const submitNewCommand = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = parseSource(source);
    if (!body.success) {
      setIssues(body.issues);
      return;
    }

    const command = {
      body: body.data,
      idempotencyKey: crypto.randomUUID(),
    };
    setIssues([]);
    setFailedCommand(command);
    onSubmit(command);
  };

  const updateSource = (value: string) => {
    setSource(value);
    setIssues([]);
    setFailedCommand(null);
    onReset();
  };

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file !== undefined) {
      updateSource(await file.text());
    }
  };

  return (
    <form
      className='grid gap-cluster rounded-panel border border-default bg-surface p-page'
      onSubmit={submitNewCommand}
    >
      <div className='grid gap-cluster'>
        <Label htmlFor='content-import-file'>JSON 파일</Label>
        <Input
          accept='application/json,.json'
          id='content-import-file'
          onChange={(event) => void loadFile(event)}
          type='file'
        />
      </div>
      <div className='grid gap-cluster'>
        <Label htmlFor='content-import-json'>canonical JSON</Label>
        <Textarea
          aria-invalid={issues.length > 0}
          id='content-import-json'
          onChange={(event) => updateSource(event.currentTarget.value)}
          rows={12}
          value={source}
        />
      </div>
      <ContentImportFeedback
        error={error}
        issues={issues}
        succeeded={succeeded}
      />
      <div className='flex flex-wrap gap-cluster'>
        <Button
          disabled={pending}
          type='submit'
        >
          {pending ? '가져오는 중…' : '가져오기'}
        </Button>
        {error !== null && failedCommand !== null ? (
          <Button
            disabled={pending}
            onClick={() => onSubmit(failedCommand)}
            type='button'
            variant='outline'
          >
            같은 요청 다시 보내기
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function ContentImportFeedback({
  error,
  issues,
  succeeded,
}: Pick<ContentImportFormProps, 'error' | 'succeeded'> & {
  issues: string[];
}) {
  return (
    <>
      {issues.length > 0 ? (
        <Alert variant='destructive'>
          <AlertTitle>입력값을 확인해 주세요.</AlertTitle>
          <AlertDescription>
            <ul className='list-disc pl-page'>
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {error !== null ? (
        <Alert variant='destructive'>
          <AlertTitle>가져오기를 완료하지 못했습니다.</AlertTitle>
          <AlertDescription>{toImportErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}
      {succeeded ? (
        <Alert>
          <AlertTitle>콘텐츠 가져오기가 완료되었습니다.</AlertTitle>
        </Alert>
      ) : null}
    </>
  );
}

function parseSource(
  source: string,
):
  | { success: true; data: ContentImportRequest }
  | { success: false; issues: string[] } {
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch {
    return { success: false, issues: ['JSON 구문을 확인해 주세요.'] };
  }

  const parsed = contentImportRequestSchema.safeParse(json);
  if (parsed.success) {
    return parsed;
  }
  return {
    success: false,
    issues: parsed.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return path === '' ? issue.message : `${path}: ${issue.message}`;
    }),
  };
}

function toImportErrorMessage(error: unknown) {
  if (isApiError(error) && error.detail.kind === 'problem') {
    if (error.detail.problem.status === 413) {
      return '파일 크기를 줄여 다시 시도해 주세요.';
    }
    if (error.detail.problem.status === 429) {
      return '잠시 기다린 뒤 같은 요청을 다시 보내 주세요.';
    }
  }
  return '연결을 확인한 뒤 같은 요청을 다시 보내 주세요.';
}
