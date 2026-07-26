/** 관리자 상세에서 뜻과 메타데이터를 선택해 새 관계를 생성한다 */
import type {
  AdminVocabularyDetailResponse,
  AdminVocabularyRelationCreateRequest,
  AdminVocabularyRelationUpdateRequest,
} from '@flex-thia/contracts';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { VocabularyRelationRow } from './VocabularyRelationRow';

/** 관계 관리 UI가 서버 mutation 경계에 전달할 행동 */
export interface VocabularyRelationManagerProps {
  detail: AdminVocabularyDetailResponse;
  disabled: boolean;
  onCreate: (payload: AdminVocabularyRelationCreateRequest) => void;
  onDelete: (relationId: string) => void;
  onUpdate: (
    relationId: string,
    payload: AdminVocabularyRelationUpdateRequest,
  ) => void;
}

/** 현재 뜻·관계 종류·방향을 선택하고 기존 관계도 계약 범위에서 수정한다 */
export function VocabularyRelationManager({
  detail,
  disabled,
  onCreate,
  onDelete,
  onUpdate,
}: VocabularyRelationManagerProps) {
  const [sourceMeaningId, setSourceMeaningId] = useState(
    detail.meanings[0]?.id ?? '',
  );
  const [targetMeaningId, setTargetMeaningId] = useState('');
  const [type, setType] =
    useState<AdminVocabularyRelationCreateRequest['type']>('RELATED');
  const [direction, setDirection] =
    useState<AdminVocabularyRelationCreateRequest['direction']>('DIRECTED');

  return (
    <section className='grid gap-cluster'>
      <h2 className='text-heading text-primary'>뜻 관계</h2>
      <ul className='grid gap-cluster'>
        {detail.relations.map((relation) => (
          <VocabularyRelationRow
            disabled={disabled}
            key={relation.id}
            onDelete={onDelete}
            onUpdate={onUpdate}
            relation={relation}
          />
        ))}
      </ul>
      {sourceMeaningId ? (
        <div className='grid gap-cluster'>
          <Label htmlFor='relation-source-meaning'>기준 뜻</Label>
          <Select
            onValueChange={setSourceMeaningId}
            value={sourceMeaningId}
          >
            <SelectTrigger
              aria-label='기준 뜻'
              id='relation-source-meaning'
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {detail.meanings.map((meaning) => (
                <SelectItem
                  key={meaning.id}
                  value={meaning.id}
                >
                  {meaning.meaningKo} ({meaning.id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label htmlFor='relation-target-meaning'>연결할 뜻 UUID</Label>
          <Input
            id='relation-target-meaning'
            onChange={(event) => setTargetMeaningId(event.target.value)}
            value={targetMeaningId}
          />
          <RelationMetadataFields
            direction={direction}
            onDirectionChange={setDirection}
            onTypeChange={setType}
            type={type}
          />
          <Button
            disabled={disabled || targetMeaningId.length === 0}
            onClick={() =>
              onCreate({
                sourceMeaningId,
                targetMeaningId,
                type,
                direction,
              })
            }
            type='button'
            variant='outline'
          >
            관계 추가
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function RelationMetadataFields({
  direction,
  onDirectionChange,
  onTypeChange,
  type,
}: {
  direction: AdminVocabularyRelationCreateRequest['direction'];
  onDirectionChange: (
    value: AdminVocabularyRelationCreateRequest['direction'],
  ) => void;
  onTypeChange: (value: AdminVocabularyRelationCreateRequest['type']) => void;
  type: AdminVocabularyRelationCreateRequest['type'];
}) {
  return (
    <div className='flex flex-wrap gap-cluster'>
      <Select
        onValueChange={onTypeChange}
        value={type}
      >
        <SelectTrigger aria-label='관계 종류'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='SYNONYM'>동의어</SelectItem>
          <SelectItem value='ANTONYM'>반의어</SelectItem>
          <SelectItem value='RELATED'>관련어</SelectItem>
        </SelectContent>
      </Select>
      <Select
        onValueChange={onDirectionChange}
        value={direction}
      >
        <SelectTrigger aria-label='관계 방향'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='DIRECTED'>단방향</SelectItem>
          <SelectItem value='BIDIRECTIONAL'>양방향</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
