/** 문제 유형 버전의 난이도·승인 예시·상태 전이를 책임별로 편집한다 */
import type {
  QuestionTaxonomySettingsResponse,
  QuestionTypeApprovedExampleRequest,
  ReplaceDifficultyCriteriaRequest,
} from '@flex-thia/contracts';
import { useState } from 'react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import {
  approvedExampleFormSchema,
  difficultyCriteriaFormSchema,
} from '../model/questionTaxonomyFormSchema';

type QuestionTypeVersion =
  QuestionTaxonomySettingsResponse['questionTypes'][number]['versions'][number];

interface QuestionTypeVersionEditorProps {
  onActivate: (versionId: string) => void;
  onAddExample:
    | ((versionId: string, input: QuestionTypeApprovedExampleRequest) => void)
    | undefined;
  onRetire: (versionId: string) => void;
  onSaveCriteria: (
    versionId: string,
    input: ReplaceDifficultyCriteriaRequest,
  ) => void;
  version: QuestionTypeVersion;
}

/** DRAFT 편집과 ACTIVE 종료 행동을 버전 상태에 맞게 제한한다 */
export function QuestionTypeVersionEditor({
  onActivate,
  onAddExample,
  onRetire,
  onSaveCriteria,
  version,
}: QuestionTypeVersionEditorProps) {
  return (
    <div className='grid gap-cluster rounded-panel bg-muted p-page'>
      <div className='flex flex-wrap items-center gap-cluster'>
        <strong>v{version.version}</strong>
        <Badge variant='secondary'>{version.status}</Badge>
        <span>{version.template}</span>
        <span>{version.optionCount}지선다</span>
      </div>
      {version.status === 'DRAFT' ? (
        <DraftVersionEditor
          onActivate={onActivate}
          onAddExample={onAddExample}
          onSaveCriteria={onSaveCriteria}
          version={version}
        />
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

function DraftVersionEditor({
  onActivate,
  onAddExample,
  onSaveCriteria,
  version,
}: Omit<QuestionTypeVersionEditorProps, 'onRetire'>) {
  const ready =
    version.difficultyCriteria.length === 5 &&
    version.approvedExamples.length > 0;

  return (
    <>
      <DifficultyCriteriaEditor
        onSave={onSaveCriteria}
        version={version}
      />
      {version.approvedExamples.length === 0 ? (
        <p className='text-body text-danger'>승인 예시가 필요합니다.</p>
      ) : null}
      <ApprovedExampleEditor
        onAdd={onAddExample}
        version={version}
      />
      <Button
        disabled={!ready}
        onClick={() => onActivate(version.id)}
        type='button'
      >
        v{version.version} 활성화
      </Button>
    </>
  );
}

function DifficultyCriteriaEditor({
  onSave,
  version,
}: {
  onSave: QuestionTypeVersionEditorProps['onSaveCriteria'];
  version: QuestionTypeVersion;
}) {
  const [criteria, setCriteria] = useState(
    [1, 2, 3, 4, 5].map(
      (difficulty) =>
        version.difficultyCriteria.find(
          (item) => item.difficulty === difficulty,
        )?.criteria ?? '',
    ),
  );

  return (
    <>
      <div className='grid gap-cluster md:grid-cols-5'>
        {criteria.map((value, index) => (
          <div
            className='grid gap-cluster'
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
          if (parsed.success) onSave(version.id, parsed.data);
        }}
        type='button'
        variant='outline'
      >
        난이도 기준 저장
      </Button>
    </>
  );
}

function ApprovedExampleEditor({
  onAdd,
  version,
}: {
  onAdd: QuestionTypeVersionEditorProps['onAddExample'];
  version: QuestionTypeVersion;
}) {
  const [title, setTitle] = useState('');
  const [payloadJson, setPayloadJson] = useState('');

  return (
    <>
      <Input
        aria-label={`v${version.version} 승인 예시 이름`}
        onChange={(event) => setTitle(event.target.value)}
        placeholder='승인 예시 이름'
        value={title}
      />
      <Textarea
        aria-label={`v${version.version} 승인 예시 JSON`}
        onChange={(event) => setPayloadJson(event.target.value)}
        placeholder='canonical 문제 버전 JSON'
        value={payloadJson}
      />
      <Button
        onClick={() => {
          try {
            const parsed = approvedExampleFormSchema.safeParse({
              title,
              payload: JSON.parse(payloadJson) as unknown,
            });
            if (parsed.success) onAdd?.(version.id, parsed.data);
          } catch {
            return;
          }
        }}
        type='button'
        variant='outline'
      >
        승인 예시 추가
      </Button>
    </>
  );
}
