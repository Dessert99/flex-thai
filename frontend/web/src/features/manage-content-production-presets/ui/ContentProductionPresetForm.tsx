/** 콘텐츠 제작 preset의 최초 어휘 정책 또는 기존 typed snapshot의 다음 version을 입력받는다 */
import { useState } from 'react';
import type { ContentProductionPresetVersion } from '@flex-thia/contracts';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

type PresetParameters = ContentProductionPresetVersion['parameters'];
type VocabularyParameters = Extract<
  ContentProductionPresetVersion,
  { purpose: 'VOCABULARY_EXTRACTION' }
>['parameters'];

const hasDuplicateDistance = (
  parameters: PresetParameters,
): parameters is PresetParameters & VocabularyParameters =>
  'suspectedDuplicateMaxCodePointDistance' in parameters;

const hasQuestionPolicy = (
  parameters: PresetParameters,
): parameters is Exclude<PresetParameters, VocabularyParameters> =>
  'similarityThreshold' in parameters;

const duplicateDistanceOf = (
  parameters: PresetParameters | undefined,
): number =>
  parameters && hasDuplicateDistance(parameters)
    ? parameters.suspectedDuplicateMaxCodePointDistance
    : 1;

interface ContentProductionPresetFormProps {
  base?: ContentProductionPresetVersion;
  pending?: boolean;
  onCreate: (input: {
    name: string;
    purpose: 'VOCABULARY_EXTRACTION';
    parameters: VocabularyParameters;
  }) => void;
  onCreateVersion: (presetId: string, parameters: PresetParameters) => void;
}

interface PolicyFieldsProps {
  base?: ContentProductionPresetVersion;
  distance: string;
  newVocabularyLimit: string;
  similarityThreshold: string;
  onDistanceChange: (value: string) => void;
  onNewVocabularyLimitChange: (value: string) => void;
  onSimilarityThresholdChange: (value: string) => void;
}

function PolicyFields(props: PolicyFieldsProps) {
  const parameters = props.base?.parameters;
  const showDistance = !parameters || hasDuplicateDistance(parameters);
  const showQuestion = parameters ? hasQuestionPolicy(parameters) : false;
  return (
    <>
      {showDistance ? (
        <>
          <Label htmlFor='preset-duplicate-distance'>
            중복 의심 최대 코드 포인트 거리
          </Label>
          <Input
            id='preset-duplicate-distance'
            min={0}
            onChange={(event) => props.onDistanceChange(event.target.value)}
            type='number'
            value={props.distance}
          />
        </>
      ) : null}
      {showQuestion ? (
        <>
          <Label htmlFor='preset-similarity-threshold'>유사도 기준</Label>
          <Input
            id='preset-similarity-threshold'
            max={1}
            min={0}
            onChange={(event) =>
              props.onSimilarityThresholdChange(event.target.value)
            }
            step='0.01'
            type='number'
            value={props.similarityThreshold}
          />
          <Label htmlFor='preset-new-vocabulary-limit'>
            신규 보조 어휘 한도
          </Label>
          <Input
            id='preset-new-vocabulary-limit'
            max={100}
            min={0}
            onChange={(event) =>
              props.onNewVocabularyLimitChange(event.target.value)
            }
            type='number'
            value={props.newVocabularyLimit}
          />
        </>
      ) : null}
    </>
  );
}

const createNextParameters = (
  base: ContentProductionPresetVersion,
  distance: string,
  similarityThreshold: string,
  newVocabularyLimit: string,
): PresetParameters => {
  if (hasDuplicateDistance(base.parameters)) {
    return {
      ...base.parameters,
      suspectedDuplicateMaxCodePointDistance: Number(distance),
    };
  }
  return {
    ...base.parameters,
    similarityThreshold: Number(similarityThreshold),
    newAuxiliaryVocabularyLimit: Number(newVocabularyLimit),
  };
};

function CreatePresetForm(
  props: Omit<ContentProductionPresetFormProps, 'base'>,
) {
  const [name, setName] = useState('');
  const [distance, setDistance] = useState('1');
  const submit = () =>
    props.onCreate({
      name: name.trim(),
      purpose: 'VOCABULARY_EXTRACTION',
      parameters: {
        suspectedDuplicateMaxCodePointDistance: Number(distance),
      },
    });
  return (
    <Card>
      <CardHeader>
        <CardTitle>새 어휘 추출 preset</CardTitle>
      </CardHeader>
      <CardContent className='grid gap-cluster'>
        <Label htmlFor='preset-name'>이름</Label>
        <Input
          id='preset-name'
          maxLength={200}
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
        <PolicyFields
          distance={distance}
          newVocabularyLimit='0'
          onDistanceChange={setDistance}
          onNewVocabularyLimitChange={() => undefined}
          onSimilarityThresholdChange={() => undefined}
          similarityThreshold='0.8'
        />
        <Button
          disabled={props.pending || name.trim().length === 0}
          onClick={submit}
          type='button'
        >
          Preset 만들기
        </Button>
      </CardContent>
    </Card>
  );
}

function NextVersionForm(
  props: ContentProductionPresetFormProps & {
    base: ContentProductionPresetVersion;
  },
) {
  const [distance, setDistance] = useState(
    String(duplicateDistanceOf(props.base.parameters)),
  );
  const [similarityThreshold, setSimilarityThreshold] = useState(
    hasQuestionPolicy(props.base.parameters)
      ? String(props.base.parameters.similarityThreshold)
      : '0.8',
  );
  const [newVocabularyLimit, setNewVocabularyLimit] = useState(
    hasQuestionPolicy(props.base.parameters)
      ? String(props.base.parameters.newAuxiliaryVocabularyLimit)
      : '0',
  );
  const submit = () =>
    props.onCreateVersion(
      props.base.id,
      createNextParameters(
        props.base,
        distance,
        similarityThreshold,
        newVocabularyLimit,
      ),
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.base.name} vNext</CardTitle>
      </CardHeader>
      <CardContent className='grid gap-cluster'>
        <PolicyFields
          base={props.base}
          distance={distance}
          newVocabularyLimit={newVocabularyLimit}
          onDistanceChange={setDistance}
          onNewVocabularyLimitChange={setNewVocabularyLimit}
          onSimilarityThresholdChange={setSimilarityThreshold}
          similarityThreshold={similarityThreshold}
        />
        <Button
          disabled={props.pending}
          onClick={submit}
          type='button'
        >
          새 버전 만들기
        </Button>
      </CardContent>
    </Card>
  );
}

/** 기존 snapshot 객체를 직접 수정하지 않고 scalar typed field를 새 객체로 복제한다 */
export function ContentProductionPresetForm(
  props: ContentProductionPresetFormProps,
) {
  return props.base ? (
    <NextVersionForm
      {...props}
      base={props.base}
    />
  ) : (
    <CreatePresetForm {...props} />
  );
}
