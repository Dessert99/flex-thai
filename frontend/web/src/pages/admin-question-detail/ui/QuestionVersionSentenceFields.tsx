/** 구조화 문제 편집의 문장 표시 필드를 경로 기반 오류와 함께 렌더링한다 */
import type { AdminQuestionVersionPayload } from '@flex-thia/contracts';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

/** 음성 유효성에 영향을 줄 수 있는 구조화 문장 필드 */
export type QuestionVersionSentenceField =
  'originalText' | 'translationKo' | 'pronunciationKo' | 'toneMarks';

/** 문장 입력 네 필드와 직접 연결된 오류를 표시한다 */
export function QuestionVersionSentenceFields({
  errors,
  onChange,
  path,
  sentence,
}: {
  errors: Record<string, string>;
  onChange: (field: QuestionVersionSentenceField, value: string) => void;
  path: string;
  sentence: AdminQuestionVersionPayload['blocks'][number]['sentences'][number]['sentence'];
}) {
  return (
    <div className='grid gap-cluster'>
      {(
        [
          ['originalText', '태국어 문장'],
          ['translationKo', '한국어 번역'],
          ['pronunciationKo', '한국어 발음'],
          ['toneMarks', '성조 표기'],
        ] as const
      ).map(([field, label]) => {
        const fieldPath = `${path}.${field}`;
        const fieldId = fieldPath.replaceAll('.', '-');
        return (
          <div
            className='grid gap-cluster'
            key={field}
          >
            <Label htmlFor={fieldId}>{label}</Label>
            <Input
              aria-invalid={errors[fieldPath] !== undefined}
              id={fieldId}
              onChange={(event) => onChange(field, event.target.value)}
              value={sentence[field]}
            />
            {errors[fieldPath] ? (
              <span className='text-caption text-danger'>
                {errors[fieldPath]}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
