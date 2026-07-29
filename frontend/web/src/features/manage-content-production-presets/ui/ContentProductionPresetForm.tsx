/** 콘텐츠 제작 preset의 최초 어휘 정책 또는 기존 typed snapshot의 다음 version을 입력받는다 */
/* eslint-disable max-lines, max-lines-per-function */
import { useState } from 'react';
import type {
  ContentProductionPresetVersion,
  CreateContentProductionPresetRequest,
} from '@flex-thia/contracts';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

type PresetParameters = ContentProductionPresetVersion['parameters'];
type PresetPurpose = ContentProductionPresetVersion['purpose'];
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
  const next = { ...base.parameters };
  if (hasDuplicateDistance(base.parameters)) {
    Object.assign(next, {
      suspectedDuplicateMaxCodePointDistance: Number(distance),
    });
  }
  if (hasQuestionPolicy(base.parameters)) {
    Object.assign(next, {
      similarityThreshold: Number(similarityThreshold),
      newAuxiliaryVocabularyLimit: Number(newVocabularyLimit),
    });
  }
  return next;
};

function CreatePresetForm(
  props: Omit<ContentProductionPresetFormProps, 'base'>,
) {
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState<PresetPurpose>(
    'VOCABULARY_EXTRACTION',
  );
  const [distance, setDistance] = useState('1');
  const [similarityThreshold, setSimilarityThreshold] = useState('0.8');
  const [newVocabularyLimit, setNewVocabularyLimit] = useState('0');
  const [questionTypeVersionId, setQuestionTypeVersionId] = useState('');
  const [defaultVoicePresetId, setDefaultVoicePresetId] = useState('');
  const submit = () => {
    if (purpose === 'VOCABULARY_EXTRACTION') {
      props.onCreate({
        name: name.trim(),
        purpose,
        parameters: {
          suspectedDuplicateMaxCodePointDistance: Number(distance),
        },
      });
      return;
    }
    const questionParameters = {
      questionCount: 1,
      questionTypePlan: [{ questionTypeVersionId, count: 1 }],
      difficultyPlan: [{ difficulty: 1 as const, count: 1 }],
      targetVocabularyIds: [],
      requiredVocabularyIds: [],
      excludedVocabularyIds: [],
      newAuxiliaryVocabularyLimit: Number(newVocabularyLimit),
      similarityThreshold: Number(similarityThreshold),
      defaultVoicePresetId,
      speakerVoiceAssignments: [],
      additionalInstructionKo: null,
      commonPrinciples: [],
      similarQuestions: [],
    };
    props.onCreate({
      name: name.trim(),
      purpose,
      parameters:
        purpose === 'VOCABULARY_THEN_QUESTION_GENERATION'
          ? {
              ...questionParameters,
              suspectedDuplicateMaxCodePointDistance: Number(distance),
            }
          : questionParameters,
    } as Parameters<typeof props.onCreate>[0]);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>새 콘텐츠 제작 preset</CardTitle>
      </CardHeader>
      <CardContent className='grid gap-cluster'>
        <Label htmlFor='preset-name'>이름</Label>
        <Input
          id='preset-name'
          maxLength={200}
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
        <Label htmlFor='preset-purpose'>목적</Label>
        <Select
          onValueChange={(value) => setPurpose(value as PresetPurpose)}
          value={purpose}
        >
          <SelectTrigger id='preset-purpose'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='VOCABULARY_EXTRACTION'>어휘 추출</SelectItem>
            <SelectItem value='QUESTION_GENERATION'>문제 생성</SelectItem>
            <SelectItem value='VOCABULARY_THEN_QUESTION_GENERATION'>
              어휘 추출 후 문제 생성
            </SelectItem>
          </SelectContent>
        </Select>
        <PolicyFields
          {...(purpose === 'VOCABULARY_EXTRACTION'
            ? {}
            : {
                base: {
                  parameters:
                    purpose === 'VOCABULARY_THEN_QUESTION_GENERATION'
                      ? {
                          similarityThreshold: 0.8,
                          suspectedDuplicateMaxCodePointDistance: 1,
                        }
                      : { similarityThreshold: 0.8 },
                } as ContentProductionPresetVersion,
              })}
          distance={distance}
          newVocabularyLimit={newVocabularyLimit}
          onDistanceChange={setDistance}
          onNewVocabularyLimitChange={setNewVocabularyLimit}
          onSimilarityThresholdChange={setSimilarityThreshold}
          similarityThreshold={similarityThreshold}
        />
        {purpose !== 'VOCABULARY_EXTRACTION' ? (
          <>
            <Label htmlFor='preset-question-type-version'>
              문제 유형 버전 ID
            </Label>
            <Input
              id='preset-question-type-version'
              onChange={(event) => setQuestionTypeVersionId(event.target.value)}
              value={questionTypeVersionId}
            />
            <Label htmlFor='preset-default-voice'>기본 음성 preset ID</Label>
            <Input
              id='preset-default-voice'
              onChange={(event) => setDefaultVoicePresetId(event.target.value)}
              value={defaultVoicePresetId}
            />
          </>
        ) : null}
        <Button
          disabled={
            props.pending ||
            name.trim().length === 0 ||
            (purpose !== 'VOCABULARY_EXTRACTION' &&
              (!questionTypeVersionId || !defaultVoicePresetId))
          }
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
      props.base.purpose,
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
