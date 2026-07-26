/** 관리자 상세에서 대표 어휘 비교와 token 기반 병합 확인을 제공한다 */
import type { AdminVocabularyMergePreviewResponse } from '@flex-thia/contracts';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

/** 병합 panel의 server mutation 경계 */
export interface VocabularyMergePanelProps {
  disabled: boolean;
  onMerge: (preview: AdminVocabularyMergePreviewResponse) => void;
  onPreview: (representativeVocabularyId: string) => void;
  preview: AdminVocabularyMergePreviewResponse | null;
}

/** 대표 UUID를 직접 비교하고 최신 preview가 있을 때만 실행 버튼을 연다 */
export function VocabularyMergePanel({
  disabled,
  onMerge,
  onPreview,
  preview,
}: VocabularyMergePanelProps) {
  const [representativeVocabularyId, setRepresentativeVocabularyId] =
    useState('');
  return (
    <section className='grid gap-cluster'>
      <h2 className='text-heading text-primary'>어휘 병합</h2>
      <Label htmlFor='merge-representative-vocabulary'>대표 어휘 UUID</Label>
      <Input
        id='merge-representative-vocabulary'
        onChange={(event) => setRepresentativeVocabularyId(event.target.value)}
        value={representativeVocabularyId}
      />
      <Button
        disabled={disabled || representativeVocabularyId.length === 0}
        onClick={() => onPreview(representativeVocabularyId)}
        type='button'
        variant='outline'
      >
        병합 미리보기
      </Button>
      {preview ? (
        <div className='grid gap-cluster'>
          <p>
            정규화 거리 {preview.comparison.codePointDistance} · source 사용처{' '}
            {Object.values(preview.source.usage).reduce(
              (total, count) => total + count,
              0,
            )}
            개
          </p>
          <Button
            disabled={disabled}
            onClick={() => onMerge(preview)}
            type='button'
            variant='destructive'
          >
            이 상태로 병합
          </Button>
        </div>
      ) : null}
    </section>
  );
}
