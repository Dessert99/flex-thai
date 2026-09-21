/** 어휘 추출 preset의 중복 판정 정책을 편집한다. */
import { Button } from '@/shared/components/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/card';
import { Input } from '@/shared/components/input';
import { Label } from '@/shared/components/label';
import type {
  ContentProductionPresetVersion,
  CreateContentProductionPresetRequest,
} from '@flex-thia/contracts/content-production/content-production';
import { useState } from 'react';
type PresetParameters = ContentProductionPresetVersion['parameters'];
type PresetPurpose = ContentProductionPresetVersion['purpose'];
interface ContentProductionPresetFormProps {
  base?: ContentProductionPresetVersion;
  pending?: boolean;
  onCreate: (
    input: {
      [Purpose in PresetPurpose]: Omit<
        Extract<CreateContentProductionPresetRequest, { purpose: Purpose }>,
        'requestId'
      >;
    }[PresetPurpose],
  ) => void;
  onCreateVersion: (
    presetId: string,
    purpose: PresetPurpose,
    parameters: PresetParameters,
  ) => void;
}

const isValidDistance = (distance: string) =>
  distance.trim() !== '' &&
  Number.isSafeInteger(Number(distance)) &&
  Number(distance) >= 0;

function PresetEditor(props: ContentProductionPresetFormProps) {
  const [name, setName] = useState('');
  const [distance, setDistance] = useState(
    String(props.base?.parameters.suspectedDuplicateMaxCodePointDistance ?? 1),
  );
  const valid = isValidDistance(distance);
  const submit = () => {
    if (!valid) return;
    const parameters = {
      suspectedDuplicateMaxCodePointDistance: Number(distance),
    };
    if (props.base)
      props.onCreateVersion(props.base.id, props.base.purpose, parameters);
    else
      props.onCreate({
        name: name.trim(),
        purpose: 'VOCABULARY_EXTRACTION',
        parameters,
      });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {props.base ? `${props.base.name} vNext` : '새 콘텐츠 제작 preset'}
        </CardTitle>
      </CardHeader>
      <CardContent className='grid gap-cluster'>
        {!props.base ? (
          <>
            <Label htmlFor='preset-name'>이름</Label>
            <Input
              id='preset-name'
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </>
        ) : null}
        <Label htmlFor='preset-duplicate-distance'>
          중복 의심 최대 코드 포인트 거리
        </Label>
        <Input
          id='preset-duplicate-distance'
          type='number'
          min={0}
          value={distance}
          onChange={(event) => setDistance(event.target.value)}
        />
        <Button
          type='button'
          disabled={props.pending || !valid || (!props.base && !name.trim())}
          onClick={submit}
        >
          {props.base ? '새 버전 만들기' : 'Preset 만들기'}
        </Button>
      </CardContent>
    </Card>
  );
}
export function ContentProductionPresetForm(
  props: ContentProductionPresetFormProps,
) {
  return (
    <PresetEditor
      key={props.base?.id ?? 'new'}
      {...props}
    />
  );
}
