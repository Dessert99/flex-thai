import { type VocabularyCandidateApprovalInput } from '@/features/content-production/apis/review-vocabulary-candidate/vocabularyCandidateApi';
import { VocabularyCandidateReviewForm } from '@/features/content-production/components/review-vocabulary-candidate/VocabularyCandidateReviewForm';
import { useVocabularyCandidateDetail } from '@/features/content-production/hooks/vocabulary-candidate-detail/useVocabularyCandidateDetail';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Badge } from '@/shared/components/badge';
import { Button } from '@/shared/components/button';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/table';
import { toUserMessage } from '@/shared/libs/error/toUserMessage';
import type { VocabularyCandidateDetailResponse } from '@flex-thia/contracts/content-production/vocabulary-candidates';
/** 화면 배치와 기능 컴포넌트를 페이지에서 직접 조립한다 */

export function VocabularyCandidateDetailPage(
  pageInput: Parameters<typeof useVocabularyCandidateDetail>[0],
) {
  const { query, action, isApiError } = useVocabularyCandidateDetail(pageInput);

  if (query.isPending)
    return (
      <Container className='max-w-content flex-1'>
        <>
          <section
            aria-live='polite'
            className='flex min-h-state flex-col justify-center gap-cluster p-page'
            role='status'
          >
            <Skeleton className='h-control w-full max-w-content' />
            <p className='text-body text-subtle'>
              어휘 후보를 불러오고 있습니다.
            </p>
          </section>
        </>
      </Container>
    );

  if (query.isError || !query.data) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <Alert
            className='rounded-panel border-danger bg-danger-surface'
            variant='destructive'
          >
            <AlertTitle className='text-danger'>
              문제가 발생했습니다.
            </AlertTitle>
            <AlertDescription className='flex flex-col gap-cluster text-danger'>
              <p>어휘 후보를 불러오지 못했습니다.</p>
              <Button
                className='mt-cluster w-auto'
                onClick={() => void query.refetch()}
                type='button'
                variant='outline'
              >
                다시 시도
              </Button>
            </AlertDescription>
          </Alert>
        </>
      </Container>
    );
  }

  const errorMessage =
    isApiError(action.error) &&
    action.error.detail.kind === 'problem' &&
    action.error.detail.problem.status === 409
      ? '다른 검수자가 먼저 변경했습니다. 최신 후보를 다시 확인해 주세요.'
      : toUserMessage(action.error)?.message;

  return (
    <Container className='max-w-content flex-1'>
      <>
        <VocabularyCandidateDetailContent
          data={query.data}
          {...(errorMessage ? { errorMessage } : {})}
          onCreateDraft={(input) => action.mutate({ kind: 'APPROVE', input })}
          onDiscard={() => action.mutate({ kind: 'DISCARD' })}
          onLinkExisting={(vocabularyId) =>
            action.mutate({
              kind: 'APPROVE',
              input: { action: 'LINK_EXISTING', vocabularyId },
            })
          }
          pending={action.isPending}
        />
      </>
    </Container>
  );
}
/** 어휘 후보 extraction snapshot·검증·중복 정보와 검수 행동을 표현한다 */

type CreateDraftInput = Extract<
  VocabularyCandidateApprovalInput,
  { action: 'CREATE_DRAFT' }
>;

export interface VocabularyCandidateDetailPageViewProps {
  data: VocabularyCandidateDetailResponse;
  errorMessage?: string;
  pending?: boolean;
  onCreateDraft: (input: CreateDraftInput) => void;
  onDiscard: () => void;
  onLinkExisting: (vocabularyId: string) => void;
}

/** 공개 snapshot만 변경 불가능하게 보여주고 pending 후보에만 검수 form을 연다 */
export function VocabularyCandidateDetailContent({
  data,
  errorMessage,
  pending = false,
  onCreateDraft,
  onDiscard,
  onLinkExisting,
}: VocabularyCandidateDetailPageViewProps) {
  const { candidate } = data;
  return (
    <section className='grid gap-section'>
      <header className='flex items-center justify-between'>
        <h1 className='text-title text-primary'>{candidate.thai}</h1>
        <Badge>{candidate.classification}</Badge>
      </header>
      <dl className='grid gap-cluster'>
        <div>
          <dt className='text-label text-subtle'>종류</dt>
          <dd>{candidate.kind}</dd>
        </div>
        {candidate.meanings.map((meaning, index) => (
          <div key={`${meaning.meaningKo}-${index}`}>
            <dt className='text-label text-subtle'>뜻 {index + 1}</dt>
            <dd>
              {meaning.meaningKo} · {meaning.partOfSpeech} · 난이도{' '}
              {meaning.difficulty}
            </dd>
          </div>
        ))}
      </dl>
      {candidate.suspectedMatches.length > 0 ? (
        <section className='grid gap-cluster'>
          <h2 className='text-heading text-primary'>중복 의심 어휘</h2>
          <ul>
            {candidate.suspectedMatches.map((match) => (
              <li key={match.vocabularyId}>
                <span>{match.vocabularyId}</span> · {match.normalizedThai} ·
                거리 {match.codePointDistance}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>검증 단계</TableHead>
            <TableHead>결과</TableHead>
            <TableHead>코드</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.validations.map((validation) => (
            <TableRow key={validation.stage}>
              <TableCell>{validation.stage}</TableCell>
              <TableCell>{validation.status}</TableCell>
              <TableCell>{validation.code ?? '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {errorMessage ? (
        <Alert variant='destructive'>
          <AlertTitle>검수 요청을 처리하지 못했습니다.</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      {candidate.review.status === 'PENDING' ? (
        <VocabularyCandidateReviewForm
          candidate={candidate}
          onCreateDraft={onCreateDraft}
          onDiscard={onDiscard}
          onLinkExisting={onLinkExisting}
          pending={pending}
        />
      ) : (
        <p>이미 {candidate.review.status} 상태로 검수가 완료되었습니다.</p>
      )}
    </section>
  );
}
