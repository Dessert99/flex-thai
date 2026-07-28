/** 콘텐츠 제작 preset의 최초 어휘 정책 또는 기존 typed snapshot의 다음 version을 입력받는다 */
import { useState } from 'react';
import type { ContentProductionPresetVersion } from '@flex-thia/contracts';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

type PresetParameters = ContentProductionPresetVersion['parameters'];

const duplicateDistanceOf = (
  parameters: PresetParameters | undefined,
): number =>
  parameters && 'suspectedDuplicateMaxCodePointDistance' in parameters
    ? parameters.suspectedDuplicateMaxCodePointDistance
    : 1;

interface ContentProductionPresetFormProps {
  base?: ContentProductionPresetVersion;
  pending?: boolean;
  onCreate: (input: {
    name: string;
    purpose: 'VOCABULARY_EXTRACTION';
    parameters: { suspectedDuplicateMaxCodePointDistance: number };
  }) => void;
  onCreateVersion: (presetId: string, parameters: PresetParameters) => void;
}

/** 기존 snapshot 객체를 직접 수정하지 않고 scalar typed field를 새 객체로 복제한다 */
export function ContentProductionPresetForm({
  base,
  pending = false,
  onCreate,
  onCreateVersion,
}: ContentProductionPresetFormProps) {
  const [name, setName] = useState('');
  const [distance, setDistance] = useState(
    String(duplicateDistanceOf(base?.parameters)),
  );
  const [similarityThreshold, setSimilarityThreshold] = useState(
    base && 'similarityThreshold' in base.parameters
      ? String(base.parameters.similarityThreshold)
      : '0.8',
  );
  const [newVocabularyLimit, setNewVocabularyLimit] = useState(
    base && 'newAuxiliaryVocabularyLimit' in base.parameters
      ? String(base.parameters.newAuxiliaryVocabularyLimit)
      : '0',
  );
  const submit = () => {
    const suspectedDuplicateMaxCodePointDistance = Number(distance);
    if (!base) {
      onCreate({
        name: name.trim(),
        purpose: 'VOCABULARY_EXTRACTION',
        parameters: { suspectedDuplicateMaxCodePointDistance },
      });
      return;
    }
    let parameters: PresetParameters = { ...base.parameters };
    if ('suspectedDuplicateMaxCodePointDistance' in parameters) {
      parameters = {
        ...parameters,
        suspectedDuplicateMaxCodePointDistance,
      };
    }
    if ('similarityThreshold' in parameters) {
      parameters = {
        ...parameters,
        similarityThreshold: Number(similarityThreshold),
        newAuxiliaryVocabularyLimit: Number(newVocabularyLimit),
      };
    }
    onCreateVersion(base.id, parameters);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {base ? `${base.name} vNext` : '새 어휘 추출 preset'}
        </CardTitle>
      </CardHeader>
      <CardContent className='grid gap-cluster'>
        {!base ? (
          <>
            <Label htmlFor='preset-name'>이름</Label>
            <Input
              id='preset-name'
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </>
        ) : null}
        {'suspectedDuplicateMaxCodePointDistance' in
        (base?.parameters ?? {
          suspectedDuplicateMaxCodePointDistance: 1,
        }) ? (
          <>
            <Label htmlFor='preset-duplicate-distance'>
              중복 의심 최대 코드 포인트 거리
            </Label>
            <Input
              id='preset-duplicate-distance'
              min={0}
              onChange={(event) => setDistance(event.target.value)}
              type='number'
              value={distance}
            />
          </>
        ) : null}
        {base && 'similarityThreshold' in base.parameters ? (
          <>
            <Label htmlFor='preset-similarity-threshold'>유사도 기준</Label>
            <Input
              id='preset-similarity-threshold'
              max={1}
              min={0}
              onChange={(event) => setSimilarityThreshold(event.target.value)}
              step='0.01'
              type='number'
              value={similarityThreshold}
            />
            <Label htmlFor='preset-new-vocabulary-limit'>
              신규 보조 어휘 한도
            </Label>
            <Input
              id='preset-new-vocabulary-limit'
              max={100}
              min={0}
              onChange={(event) => setNewVocabularyLimit(event.target.value)}
              type='number'
              value={newVocabularyLimit}
            />
          </>
        ) : null}
        <Button
          disabled={pending || (!base && name.trim().length === 0)}
          onClick={submit}
          type='button'
        >
          {base ? '새 버전 만들기' : 'Preset 만들기'}
        </Button>
      </CardContent>
    </Card>
  );
}
