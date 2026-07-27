/** FLEX 7대 분류와 세부 유형 설정을 한 관리자 화면에 표현한다 */
import {
  questionMajorCategoryMetadata,
  type CreateQuestionTaxonomyTermRequest,
  type CreateQuestionTypeRequest,
  type CreateQuestionTypeVersionRequest,
  type QuestionTypeApprovedExampleRequest,
  type ReplaceDifficultyCriteriaRequest,
} from '@flex-thia/contracts';
import { useState } from 'react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import { Textarea } from '@/shared/ui/textarea';
import {
  approvedExampleFormSchema,
  difficultyCriteriaFormSchema,
  questionTypeFormSchema,
  taxonomyTermFormSchema,
} from '../model/questionTaxonomyFormSchema';

type SettingsData = {
  questionTypes: ReadonlyArray<{
    id: string;
    slug: string;
    displayName: string;
    majorCategory: keyof typeof questionMajorCategoryMetadata;
    versions: ReadonlyArray<{
      id: string;
      version: number;
      status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
      template: CreateQuestionTypeVersionRequest['template'];
      optionCount: 3 | 4;
      decisionRules: Record<string, unknown>;
      difficultyCriteria: ReadonlyArray<{
        difficulty: number;
        criteria: string;
      }>;
      approvedExamples: ReadonlyArray<{
        id: string;
        title: string;
        payload: unknown;
      }>;
    }>;
  }>;
  topics: ReadonlyArray<Term>;
  tags: ReadonlyArray<Term>;
};
type Term = {
  id: string;
  slug: string;
  displayName: string;
  status: 'ACTIVE' | 'ARCHIVED';
};

interface Props {
  data: SettingsData | undefined;
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
  if (props.loading) {
    return <PageLoading message='문제 유형 설정을 불러오고 있습니다.' />;
  }
  if (props.error || !props.data) {
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
      <CreateTypeForm onCreate={props.onCreateType} />
      <div className='grid gap-section'>
        {Object.entries(questionMajorCategoryMetadata).map(
          ([category, metadata]) => (
            <section
              className='grid gap-cluster rounded-panel border border-default p-page'
              key={category}
            >
              <h2 className='text-heading text-primary'>{metadata.label}</h2>
              {props.data!.questionTypes
                .filter(({ majorCategory }) => majorCategory === category)
                .map((questionType) => (
                  <article
                    className='grid gap-cluster'
                    key={questionType.id}
                  >
                    <div className='flex items-center justify-between gap-cluster'>
                      <h3 className='font-semibold'>
                        {questionType.displayName}
                      </h3>
                      <Button
                        onClick={() => {
                          const latest = questionType.versions[0];
                          if (latest) {
                            props.onCreateVersion(questionType.id, {
                              template: latest.template,
                              optionCount: latest.optionCount,
                              decisionRules: latest.decisionRules,
                            });
                          }
                        }}
                        type='button'
                        variant='outline'
                      >
                        다음 DRAFT
                      </Button>
                    </div>
                    {questionType.versions.map((version) => (
                      <VersionEditor
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
        terms={props.data.topics}
      />
      <TermSettings
        kind='tag'
        onArchive={props.onArchiveTerm}
        onCreate={props.onCreateTerm}
        terms={props.data.tags}
      />
    </section>
  );
}

function CreateTypeForm({
  onCreate,
}: {
  onCreate: (input: CreateQuestionTypeRequest) => void;
}) {
  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [majorCategory, setCategory] =
    useState<CreateQuestionTypeRequest['majorCategory']>(
      'READING_VOCABULARY_GRAMMAR',
    );
  return (
    <form
      className='grid gap-cluster rounded-panel border border-default p-page md:grid-cols-4'
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = questionTypeFormSchema.safeParse({
          slug,
          displayName,
          majorCategory,
        });
        if (parsed.success) onCreate(parsed.data);
      }}
    >
      <Input
        aria-label='세부 유형 slug'
        onChange={(event) => setSlug(event.target.value)}
        placeholder='reading-vocabulary'
        value={slug}
      />
      <Input
        aria-label='세부 유형 이름'
        onChange={(event) => setDisplayName(event.target.value)}
        placeholder='어휘 의미 선택'
        value={displayName}
      />
      <select
        aria-label='FLEX 대분류'
        className='rounded-md border border-default bg-surface px-3'
        onChange={(event) =>
          setCategory(event.target.value as typeof majorCategory)
        }
        value={majorCategory}
      >
        {Object.entries(questionMajorCategoryMetadata).map(
          ([value, { label }]) => (
            <option
              key={value}
              value={value}
            >
              {label}
            </option>
          ),
        )}
      </select>
      <Button type='submit'>세부 유형 만들기</Button>
    </form>
  );
}

function VersionEditor({
  onActivate,
  onAddExample,
  onRetire,
  onSaveCriteria,
  version,
}: {
  onActivate: Props['onActivate'];
  onAddExample: Props['onAddExample'];
  onRetire: Props['onRetire'];
  onSaveCriteria: Props['onSaveCriteria'];
  version: SettingsData['questionTypes'][number]['versions'][number];
}) {
  const [criteria, setCriteria] = useState(
    [1, 2, 3, 4, 5].map(
      (difficulty) =>
        version.difficultyCriteria.find(
          (item) => item.difficulty === difficulty,
        )?.criteria ?? '',
    ),
  );
  const [exampleTitle, setExampleTitle] = useState('');
  const [exampleJson, setExampleJson] = useState('');
  const ready =
    version.difficultyCriteria.length === 5 &&
    version.approvedExamples.length > 0;
  return (
    <div className='grid gap-cluster rounded-panel bg-muted p-page'>
      <div className='flex flex-wrap items-center gap-cluster'>
        <strong>v{version.version}</strong>
        <Badge variant='secondary'>{version.status}</Badge>
        <span>{version.template}</span>
        <span>{version.optionCount}지선다</span>
      </div>
      {version.status === 'DRAFT' ? (
        <>
          <div className='grid gap-cluster md:grid-cols-5'>
            {criteria.map((value, index) => (
              <div
                className='grid gap-2'
                key={index}
              >
                <Label htmlFor={`${version.id}-difficulty-${index + 1}`}>
                  난이도 {index + 1}
                </Label>
                <Input
                  id={`${version.id}-difficulty-${index + 1}`}
                  onChange={(event) =>
                    setCriteria((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? event.target.value : item,
                      ),
                    )
                  }
                  value={value}
                />
              </div>
            ))}
          </div>
          <Button
            onClick={() => {
              const input = {
                criteria: criteria.map((description, index) => ({
                  difficulty: index + 1,
                  criteria: description,
                })),
              };
              const parsed = difficultyCriteriaFormSchema.safeParse(input);
              if (parsed.success) onSaveCriteria(version.id, parsed.data);
            }}
            type='button'
            variant='outline'
          >
            난이도 기준 저장
          </Button>
          {version.approvedExamples.length === 0 ? (
            <p className='text-body text-danger'>승인 예시가 필요합니다.</p>
          ) : null}
          <Input
            aria-label={`v${version.version} 승인 예시 이름`}
            onChange={(event) => setExampleTitle(event.target.value)}
            placeholder='승인 예시 이름'
            value={exampleTitle}
          />
          <Textarea
            aria-label={`v${version.version} 승인 예시 JSON`}
            onChange={(event) => setExampleJson(event.target.value)}
            placeholder='canonical 문제 버전 JSON'
            value={exampleJson}
          />
          <div className='flex gap-cluster'>
            <Button
              onClick={() => {
                try {
                  const parsed = approvedExampleFormSchema.safeParse({
                    title: exampleTitle,
                    payload: JSON.parse(exampleJson),
                  });
                  if (parsed.success) onAddExample?.(version.id, parsed.data);
                } catch {
                  return;
                }
              }}
              type='button'
              variant='outline'
            >
              승인 예시 추가
            </Button>
            <Button
              disabled={!ready}
              onClick={() => onActivate(version.id)}
              type='button'
            >
              v{version.version} 활성화
            </Button>
          </div>
        </>
      ) : null}
      {version.status === 'ACTIVE' ? (
        <Button
          onClick={() => onRetire(version.id)}
          type='button'
          variant='outline'
        >
          v{version.version} 사용 종료
        </Button>
      ) : null}
    </div>
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
      <ul className='grid gap-2'>
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
