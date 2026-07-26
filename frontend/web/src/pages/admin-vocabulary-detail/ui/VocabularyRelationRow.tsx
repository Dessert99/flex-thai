/** 기존 뜻 관계의 메타데이터와 검토 상태를 안전한 전이로 수정한다 */
import type {
  AdminVocabularyRelation,
  AdminVocabularyRelationUpdateRequest,
} from '@flex-thia/contracts';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

interface Props {
  disabled: boolean;
  onDelete: (relationId: string) => void;
  onUpdate: (
    relationId: string,
    payload: AdminVocabularyRelationUpdateRequest,
  ) => void;
  relation: AdminVocabularyRelation;
}

/** terminal 간 직행 없이 PENDING 재검토와 메타데이터 저장만 제공한다 */
export function VocabularyRelationRow({
  disabled,
  onDelete,
  onUpdate,
  relation,
}: Props) {
  const [type, setType] = useState(relation.type);
  const [direction, setDirection] = useState(relation.direction);
  return (
    <li className='grid gap-cluster'>
      <p>
        {relation.sourceMeaningId} → {relation.targetMeaningId} ·{' '}
        {relation.status}
      </p>
      <div className='flex flex-wrap gap-cluster'>
        <Select
          onValueChange={(value) => {
            if (
              value === 'SYNONYM' ||
              value === 'ANTONYM' ||
              value === 'RELATED'
            ) {
              setType(value);
            }
          }}
          value={type}
        >
          <SelectTrigger aria-label={`관계 ${relation.id} 종류`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='SYNONYM'>동의어</SelectItem>
            <SelectItem value='ANTONYM'>반의어</SelectItem>
            <SelectItem value='RELATED'>관련어</SelectItem>
          </SelectContent>
        </Select>
        <Select
          onValueChange={(value) => {
            if (value === 'DIRECTED' || value === 'BIDIRECTIONAL') {
              setDirection(value);
            }
          }}
          value={direction}
        >
          <SelectTrigger aria-label={`관계 ${relation.id} 방향`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='DIRECTED'>단방향</SelectItem>
            <SelectItem value='BIDIRECTIONAL'>양방향</SelectItem>
          </SelectContent>
        </Select>
        <Button
          disabled={disabled}
          onClick={() => onUpdate(relation.id, { type, direction })}
          type='button'
          variant='outline'
        >
          메타데이터 저장
        </Button>
        <RelationStatusActions
          disabled={disabled}
          onUpdate={onUpdate}
          relation={relation}
        />
        <Button
          disabled={disabled}
          onClick={() => onDelete(relation.id)}
          type='button'
          variant='destructive'
        >
          관계 삭제
        </Button>
      </div>
    </li>
  );
}

function RelationStatusActions({
  disabled,
  onUpdate,
  relation,
}: Pick<Props, 'disabled' | 'onUpdate' | 'relation'>) {
  if (relation.status !== 'PENDING') {
    return (
      <Button
        disabled={disabled}
        onClick={() => onUpdate(relation.id, { status: 'PENDING' })}
        type='button'
        variant='outline'
      >
        재검토 요청
      </Button>
    );
  }
  return (
    <>
      <Button
        disabled={disabled}
        onClick={() => onUpdate(relation.id, { status: 'PASSED' })}
        type='button'
        variant='outline'
      >
        검증 통과
      </Button>
      <Button
        disabled={disabled}
        onClick={() => onUpdate(relation.id, { status: 'FAILED' })}
        type='button'
        variant='outline'
      >
        검증 실패
      </Button>
    </>
  );
}
