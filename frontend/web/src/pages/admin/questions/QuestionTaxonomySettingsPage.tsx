import {
  CreateQuestionTypeForm,
  CreateQuestionTypeVersionForm,
} from '@/features/learning/components/question-taxonomy-settings/QuestionTypeForms';
import { QuestionTypeVersionEditor } from '@/features/learning/components/question-taxonomy-settings/QuestionTypeVersionEditor';
import { useQuestionTaxonomySettings } from '@/features/learning/hooks/question-taxonomy-settings/useQuestionTaxonomySettings';
import { taxonomyTermFormSchema } from '@/features/learning/libs/question-taxonomy-settings/questionTaxonomyFormSchema';
import type {
  Props,
  Term,
} from '@/features/learning/libs/question-taxonomy-settings/questionTaxonomySettingsPageTypes';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import { Input } from '@/shared/components/input';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
import { questionMajorCategoryMetadata } from '@flex-thia/contracts/questions/question-taxonomy-settings';
import { useState } from 'react';
/** 페이지에서 화면 배치와 기능 컴포넌트를 조립한다 */

export function QuestionTaxonomySettingsPage() {
  const props = useQuestionTaxonomySettings();

  const { data } = props;

  if (props.loading) {
    return (
      <Container className='max-w-content flex-1'>
        <section
          aria-live='polite'
          className='flex min-h-state flex-col justify-center gap-cluster p-page'
          role='status'
        >
          <Skeleton className='h-control w-full max-w-content' />
          <p className='text-body text-subtle'>
            문제 유형 설정을 불러오고 있습니다.
          </p>
        </section>
      </Container>
    );
  }

  if (props.error || data === undefined) {
    return (
      <Container className='max-w-content flex-1'>
        <Alert
          className='rounded-panel border-danger bg-danger-surface'
          variant='destructive'
        >
          <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
          <AlertDescription className='flex flex-col gap-cluster text-danger'>
            <p>문제 유형 설정을 불러오지 못했습니다.</p>
            <Button
              className='mt-cluster w-auto'
              onClick={props.onRetry}
              type='button'
              variant='outline'
            >
              다시 시도
            </Button>
          </AlertDescription>
        </Alert>
      </Container>
    );
  }

  return (
    <Container className='max-w-content flex-1'>
      <section className='grid gap-section'>
        <header className='space-y-cluster'>
          <h1 className='text-title text-primary'>문제 유형 설정</h1>
          <p className='text-body text-subtle'>
            활성화한 버전은 수정하지 않고 다음 DRAFT 버전으로 이어집니다.
          </p>
        </header>
        <CreateQuestionTypeForm onCreate={props.onCreateType} />
        <div className='grid gap-section'>
          {Object.entries(questionMajorCategoryMetadata).map(
            ([category, metadata]) => (
              <section
                className='grid gap-cluster rounded-panel border border-default p-page'
                key={category}
              >
                <h2 className='text-heading text-primary'>{metadata.label}</h2>
                {data.questionTypes
                  .filter(({ majorCategory }) => majorCategory === category)
                  .map((questionType) => (
                    <article
                      className='grid gap-cluster'
                      key={questionType.id}
                    >
                      <h3 className='font-semibold'>
                        {questionType.displayName}
                      </h3>
                      {questionType.versions[0] ? (
                        <CreateQuestionTypeVersionForm
                          initial={questionType.versions[0]}
                          key={questionType.versions[0].id}
                          onCreate={(input) =>
                            props.onCreateVersion(questionType.id, input)
                          }
                        />
                      ) : null}
                      {questionType.versions.map((version) => (
                        <QuestionTypeVersionEditor
                          key={version.id}
                          onActivate={props.onActivate}
                          onAddExample={props.onAddExample}
                          onRetire={props.onRetire}
                          onSaveCriteria={props.onSaveCriteria}
                          version={version}
                        />
                      ))}
                    </article>
                  ))}
              </section>
            ),
          )}
        </div>
        <TermSettings
          kind='topic'
          onArchive={props.onArchiveTerm}
          onCreate={props.onCreateTerm}
          terms={data.topics}
        />
        <TermSettings
          kind='tag'
          onArchive={props.onArchiveTerm}
          onCreate={props.onCreateTerm}
          terms={data.tags}
        />
      </section>
    </Container>
  );
}

function TermSettings({
  kind,
  onArchive,
  onCreate,
  terms,
}: {
  kind: 'topic' | 'tag';
  onArchive: Props['onArchiveTerm'];
  onCreate: Props['onCreateTerm'];
  terms: ReadonlyArray<Term>;
}) {
  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const label = kind === 'topic' ? '주제' : '태그';
  return (
    <section className='grid gap-cluster rounded-panel border border-default p-page'>
      <h2 className='text-heading'>{label} 설정</h2>
      <form
        className='flex flex-wrap gap-cluster'
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = taxonomyTermFormSchema.safeParse({
            slug,
            displayName,
          });
          if (parsed.success) onCreate(kind, parsed.data);
        }}
      >
        <Input
          aria-label={`${label} slug`}
          onChange={(event) => setSlug(event.target.value)}
          value={slug}
        />
        <Input
          aria-label={`${label} 이름`}
          onChange={(event) => setDisplayName(event.target.value)}
          value={displayName}
        />
        <Button type='submit'>{label} 만들기</Button>
      </form>
      <ul className='grid gap-cluster'>
        {terms.map((term) => (
          <li
            className='flex items-center justify-between'
            key={term.id}
          >
            <span>
              {term.displayName} · {term.slug} · {term.status}
            </span>
            {term.status === 'ACTIVE' ? (
              <Button
                onClick={() => onArchive(kind, term.id)}
                type='button'
                variant='outline'
              >
                보관
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
