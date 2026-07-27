/** FLEX 7대 분류와 세부 유형 설정을 한 관리자 화면에 표현한다 */
import {
  questionMajorCategoryMetadata,
  type CreateQuestionTaxonomyTermRequest,
  type CreateQuestionTypeRequest,
  type CreateQuestionTypeVersionRequest,
  type QuestionTypeApprovedExampleRequest,
  type QuestionTaxonomySettingsResponse,
  type ReplaceDifficultyCriteriaRequest,
} from '@flex-thia/contracts';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import { taxonomyTermFormSchema } from '../model/questionTaxonomyFormSchema';
import {
  CreateQuestionTypeForm,
  CreateQuestionTypeVersionForm,
} from './QuestionTypeForms';
import { QuestionTypeVersionEditor } from './QuestionTypeVersionEditor';

type Term = QuestionTaxonomySettingsResponse['topics'][number];

interface Props {
  data: QuestionTaxonomySettingsResponse | undefined;
  error: boolean;
  loading: boolean;
  onActivate: (versionId: string) => void;
  onAddExample?: (
    versionId: string,
    input: QuestionTypeApprovedExampleRequest,
  ) => void;
  onArchiveTerm: (kind: 'topic' | 'tag', id: string) => void;
  onCreateTerm: (
    kind: 'topic' | 'tag',
    input: CreateQuestionTaxonomyTermRequest,
  ) => void;
  onCreateType: (input: CreateQuestionTypeRequest) => void;
  onCreateVersion: (
    questionTypeId: string,
    input: CreateQuestionTypeVersionRequest,
  ) => void;
  onRetry: () => void;
  onRetire: (versionId: string) => void;
  onSaveCriteria: (
    versionId: string,
    input: ReplaceDifficultyCriteriaRequest,
  ) => void;
}

/** 로딩·오류와 설정 편집 명령을 명시적으로 분리한다 */
export function QuestionTaxonomySettingsPageView(props: Props) {
  const { data } = props;
  if (props.loading) {
    return <PageLoading message='문제 유형 설정을 불러오고 있습니다.' />;
  }
  if (props.error || data === undefined) {
    return (
      <PageError
        message='문제 유형 설정을 불러오지 못했습니다.'
        onRetry={props.onRetry}
      />
    );
  }
  return (
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
