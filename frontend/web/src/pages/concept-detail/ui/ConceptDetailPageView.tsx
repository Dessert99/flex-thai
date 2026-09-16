/** 게시 개념의 목차와 종류별 블록을 semantic HTML로 표현한다 */
import { InteractiveThaiSentence } from '@/features/explore-thai-content';
import { ContentErrorReportDialog } from '@/features/report-content-error';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import type { ConceptDetailResponse } from '@flex-thia/contracts';

interface ConceptDetailPageViewProps {
  data: ConceptDetailResponse | undefined;
  error: boolean;
  loading: boolean;
  notFound: boolean;
  onRetry: () => void;
}

/** 저장된 블록 제목에서 파생된 목차와 본문을 렌더링한다 */
export function ConceptDetailPageView({
  data,
  error,
  loading,
  notFound,
  onRetry,
}: ConceptDetailPageViewProps) {
  if (loading)
    return (
      <section
        aria-live='polite'
        className='flex min-h-state flex-col justify-center gap-cluster p-page'
        role='status'
      >
        <Skeleton className='h-control w-full max-w-content' />
        <p className='text-body text-subtle'>개념을 불러오고 있습니다.</p>
      </section>
    );
  if (notFound) {
    return (
      <Alert
        className='rounded-panel border-danger bg-danger-surface'
        variant='destructive'
      >
        <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
        <AlertDescription className='flex flex-col gap-cluster text-danger'>
          <p>게시된 개념을 찾을 수 없습니다.</p>
          <Button
            className='mt-cluster w-auto'
            onClick={onRetry}
            type='button'
            variant='outline'
          >
            다시 시도
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (error || !data) {
    return (
      <Alert
        className='rounded-panel border-danger bg-danger-surface'
        variant='destructive'
      >
        <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
        <AlertDescription className='flex flex-col gap-cluster text-danger'>
          <p>개념을 불러오지 못했습니다.</p>
          <Button
            className='mt-cluster w-auto'
            onClick={onRetry}
            type='button'
            variant='outline'
          >
            다시 시도
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <article className='grid gap-section'>
      <header className='flex flex-wrap items-start justify-between gap-cluster'>
        <div>
          <h1 className='text-title text-primary'>{data.title}</h1>
          <p className='text-body text-subtle'>{data.summary}</p>
        </div>
        <ContentErrorReportDialog
          origin={{
            kind: 'CONCEPT',
            conceptId: data.id,
            conceptVersionId: data.versionId,
            blockId: null,
          }}
          preview={{
            title: data.title,
            metadata: data.summary,
          }}
          triggerLabel='개념 오류 신고'
        />
      </header>
      <nav aria-label='개념 목차'>
        <ol>
          {data.tableOfContents.map((item) => (
            <li key={item.blockId}>
              <a href={`#concept-block-${item.blockId}`}>{item.heading}</a>
            </li>
          ))}
        </ol>
      </nav>
      {data.blocks.map((block) => (
        <ConceptBlock
          block={block}
          concept={data}
          key={block.id}
        />
      ))}
    </article>
  );
}

function ConceptBlock({
  block,
  concept,
}: {
  block: ConceptDetailResponse['blocks'][number];
  concept: ConceptDetailResponse;
}) {
  return (
    <section id={`concept-block-${block.id}`}>
      <div className='flex flex-wrap items-center justify-between gap-cluster'>
        <h2 className='text-subtitle text-primary'>{block.heading}</h2>
        <ContentErrorReportDialog
          origin={{
            kind: 'CONCEPT',
            conceptId: concept.id,
            conceptVersionId: concept.versionId,
            blockId: block.id,
          }}
          preview={{
            title: concept.title,
            metadata: block.heading,
          }}
          triggerLabel='개념 블록 오류 신고'
        />
      </div>
      {block.kind === 'EXPLANATION'
        ? block.paragraphs.map((paragraph, index) => (
            <p key={`${block.id}-paragraph-${index}`}>{paragraph}</p>
          ))
        : null}
      {block.kind === 'RULE_TABLE' ? (
        <table>
          <thead>
            <tr>
              {block.headers.map((header, index) => (
                <th
                  key={`${block.id}-header-${index}`}
                  scope='col'
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, index) => (
              <tr key={`${block.id}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${index}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {block.kind === 'THAI_EXAMPLES' ? (
        <ul lang='th'>
          {block.examples.map((example) => (
            <li key={example.sentence.sentenceVersionId}>
              <InteractiveThaiSentence sentence={example.sentence} />
              <div lang='ko'>
                <ContentErrorReportDialog
                  origin={{
                    kind: 'SENTENCE',
                    sentenceVersionId: example.sentence.sentenceVersionId,
                    tokenPosition: null,
                  }}
                  preview={{
                    title: example.sentence.originalText,
                    metadata: example.sentence.translationKo,
                  }}
                  triggerLabel='예문 오류 신고'
                />
              </div>
              {example.noteKo ? <p lang='ko'>{example.noteKo}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
