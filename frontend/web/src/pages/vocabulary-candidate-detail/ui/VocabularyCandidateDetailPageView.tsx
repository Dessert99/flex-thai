/** 어휘 후보 extraction snapshot·검증·중복 정보와 검수 행동을 표현한다 */
import type { VocabularyCandidateDetailResponse } from '@flex-thia/contracts';
import type { VocabularyCandidateApprovalInput } from '@/features/review-vocabulary-candidate';
import { VocabularyCandidateReviewForm } from '@/features/review-vocabulary-candidate';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

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
export function VocabularyCandidateDetailPageView({
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
