/** 관리자 상세에서 관계 생성·검토·삭제 행동을 제공한다 */
import type { AdminVocabularyDetailResponse } from '@flex-thia/contracts';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

/** 관계 관리 UI가 서버 mutation 경계에 전달할 행동 */
export interface VocabularyRelationManagerProps {
  detail: AdminVocabularyDetailResponse;
  disabled: boolean;
  onCreate: (sourceMeaningId: string, targetMeaningId: string) => void;
  onDelete: (relationId: string) => void;
  onStatusChange: (
    relationId: string,
    status: 'PENDING' | 'PASSED' | 'FAILED',
  ) => void;
}

/** 첫 뜻에서 RELATED 직접 관계를 만들고 검토 상태를 명시적으로 관리한다 */
export function VocabularyRelationManager({
  detail,
  disabled,
  onCreate,
  onDelete,
  onStatusChange,
}: VocabularyRelationManagerProps) {
  const [targetMeaningId, setTargetMeaningId] = useState('');
  const sourceMeaningId = detail.meanings[0]?.id;
  return (
    <section className='grid gap-cluster'>
      <h2 className='text-heading text-primary'>뜻 관계</h2>
      <ul className='grid gap-cluster'>
        {detail.relations.map((relation) => (
          <li
            className='flex flex-wrap items-center gap-cluster'
            key={relation.id}
          >
            <span>
              {relation.type} · {relation.status}
            </span>
            {relation.status !== 'PASSED' ? (
              <Button
                disabled={disabled}
                onClick={() => onStatusChange(relation.id, 'PASSED')}
                type='button'
                variant='outline'
              >
                검증 통과
              </Button>
            ) : null}
            {relation.status !== 'FAILED' ? (
              <Button
                disabled={disabled}
                onClick={() => onStatusChange(relation.id, 'FAILED')}
                type='button'
                variant='outline'
              >
                검증 실패
              </Button>
            ) : null}
            <Button
              disabled={disabled}
              onClick={() => onDelete(relation.id)}
              type='button'
              variant='destructive'
            >
              관계 삭제
            </Button>
          </li>
        ))}
      </ul>
      {sourceMeaningId ? (
        <div className='grid gap-cluster'>
          <Label htmlFor='relation-target-meaning'>연결할 뜻 UUID</Label>
          <Input
            id='relation-target-meaning'
            onChange={(event) => setTargetMeaningId(event.target.value)}
            value={targetMeaningId}
          />
          <Button
            disabled={disabled || targetMeaningId.length === 0}
            onClick={() => onCreate(sourceMeaningId, targetMeaningId)}
            type='button'
            variant='outline'
          >
            RELATED 관계 추가
          </Button>
        </div>
      ) : null}
    </section>
  );
}
