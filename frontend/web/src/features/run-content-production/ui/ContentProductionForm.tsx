/** 콘텐츠 제작 upload·preview·create 행동을 한 form으로 제공한다 */
/* eslint-disable max-lines, max-lines-per-function */
import { useState } from 'react';
import {
  contentProductionQuestionOptionsSchema,
  type ContentProductionQuestionOptions,
  type ContentProductionPreset,
  type PromptPreviewResponse,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { Textarea } from '@/shared/ui/textarea';
import type { UploadedContentProductionInput } from '../model/uploadContentProductionInput';

type PreviewInput = {
  presetId: string;
  options: ContentProductionQuestionOptions;
  questionPlanIndex: number;
};
type SubmitInput = {
  options: ContentProductionQuestionOptions | null;
  presetId: string;
  uploadId: string;
};

interface ContentProductionFormProps {
  presets: ContentProductionPreset[];
  preview?: PromptPreviewResponse;
  pending?: boolean;
  onConfigurationChange: () => void;
  onFile: (file: File) => Promise<UploadedContentProductionInput>;
  onPreview: (input: PreviewInput) => void;
  onSubmit: (input: SubmitInput) => void;
}

interface QuickSettingsProps {
  onFile: ContentProductionFormProps['onFile'];
  onPresetChange: (presetId: string) => void;
  onQuestionPlanIndexChange: (index: string) => void;
  presetId: string;
  presets: ContentProductionPreset[];
  questionCount: number;
  questionPlanIndex: string;
}

function QuickSettings(props: QuickSettingsProps) {
  return (
    <TabsContent
      className='grid gap-cluster'
      value='quick'
    >
      <Label htmlFor='content-production-preset'>Preset</Label>
      <Select
        onValueChange={props.onPresetChange}
        value={props.presetId}
      >
        <SelectTrigger id='content-production-preset'>
          <SelectValue placeholder='Preset 선택' />
        </SelectTrigger>
        <SelectContent>
          {props.presets.map((preset) => (
            <SelectItem
              key={preset.id}
              value={preset.id}
            >
              {preset.name} v{preset.version}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {props.questionCount > 0 ? (
        <>
          <Label htmlFor='content-production-plan-index'>미리보기 항목</Label>
          <Select
            onValueChange={props.onQuestionPlanIndexChange}
            value={props.questionPlanIndex}
          >
            <SelectTrigger id='content-production-plan-index'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: props.questionCount }, (_, index) => (
                <SelectItem
                  key={index}
                  value={String(index)}
                >
                  {index + 1}번
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      ) : null}
      <Label htmlFor='content-production-file'>입력 파일</Label>
      <Input
        accept='.txt,.pdf,image/jpeg,image/png,image/webp'
        id='content-production-file'
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void props.onFile(file);
        }}
        type='file'
      />
    </TabsContent>
  );
}

interface FormActionsProps {
  onPreview: ContentProductionFormProps['onPreview'];
  onSubmit: ContentProductionFormProps['onSubmit'];
  pending: boolean;
  preview?: PromptPreviewResponse;
  previewInput: PreviewInput;
  previewValid: boolean;
  uploaded: UploadedContentProductionInput | null;
}

function FormActions(props: FormActionsProps) {
  const submit = () => {
    if (!props.uploaded) return;
    props.onSubmit({
      options: props.previewValid ? props.previewInput.options : null,
      presetId: props.previewInput.presetId,
      uploadId: props.uploaded.uploadId,
    });
  };
  return (
    <>
      <div className='flex gap-cluster'>
        <Button
          disabled={
            !props.previewInput.presetId || !props.previewValid || props.pending
          }
          onClick={() => props.onPreview(props.previewInput)}
          type='button'
          variant='outline'
        >
          Prompt 미리보기
        </Button>
        <Button
          disabled={
            !props.uploaded || !props.previewInput.presetId || props.pending
          }
          onClick={submit}
          type='button'
        >
          작업 실행
        </Button>
      </div>
      {props.preview ? (
        <Textarea
          aria-label='생성 prompt'
          readOnly
          value={props.preview.prompt}
        />
      ) : null}
    </>
  );
}

interface AdvancedSettingsProps {
  options: ContentProductionQuestionOptions | null;
  onChange: (options: ContentProductionQuestionOptions) => void;
}

const parseIds = (value: string) =>
  value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

/** 문제 생성 preset의 typed 옵션을 JSON 없이 각 field로 수정한다 */
function AdvancedSettings({ options, onChange }: AdvancedSettingsProps) {
  if (!options) {
    return (
      <TabsContent value='advanced'>
        문제 생성 preset에서만 고급 설정을 사용할 수 있습니다.
      </TabsContent>
    );
  }
  const set = <Key extends keyof ContentProductionQuestionOptions>(
    key: Key,
    value: ContentProductionQuestionOptions[Key],
  ) => onChange({ ...options, [key]: value });
  return (
    <TabsContent
      className='grid gap-cluster'
      value='advanced'
    >
      <Label htmlFor='content-production-question-count'>문항 수</Label>
      <Input
        id='content-production-question-count'
        min={1}
        onChange={(event) => set('questionCount', Number(event.target.value))}
        type='number'
        value={options.questionCount}
      />
      {options.questionTypePlan.map((item, index) => (
        <div
          className='grid gap-cluster'
          key={`${item.questionTypeVersionId}-${index}`}
        >
          <Label htmlFor={`content-production-question-type-${index}`}>
            문제 유형 버전 {index + 1}
          </Label>
          <Input
            id={`content-production-question-type-${index}`}
            onChange={(event) =>
              set(
                'questionTypePlan',
                options.questionTypePlan.map((current, currentIndex) =>
                  currentIndex === index
                    ? {
                        ...current,
                        questionTypeVersionId: event.target.value,
                      }
                    : current,
                ),
              )
            }
            value={item.questionTypeVersionId}
          />
          <Label htmlFor={`content-production-question-type-count-${index}`}>
            문제 유형 수 {index + 1}
          </Label>
          <Input
            id={`content-production-question-type-count-${index}`}
            min={1}
            onChange={(event) =>
              set(
                'questionTypePlan',
                options.questionTypePlan.map((current, currentIndex) =>
                  currentIndex === index
                    ? { ...current, count: Number(event.target.value) }
                    : current,
                ),
              )
            }
            type='number'
            value={item.count}
          />
        </div>
      ))}
      {options.difficultyPlan.map((item, index) => (
        <div
          className='grid gap-cluster'
          key={`${item.difficulty}-${index}`}
        >
          <Label htmlFor={`content-production-difficulty-${index}`}>
            난이도 {index + 1}
          </Label>
          <Input
            id={`content-production-difficulty-${index}`}
            max={5}
            min={1}
            onChange={(event) =>
              set(
                'difficultyPlan',
                options.difficultyPlan.map((current, currentIndex) =>
                  currentIndex === index
                    ? {
                        ...current,
                        difficulty: Number(event.target.value),
                      }
                    : current,
                ),
              )
            }
            type='number'
            value={item.difficulty}
          />
          <Label htmlFor={`content-production-difficulty-count-${index}`}>
            난이도 수 {index + 1}
          </Label>
          <Input
            id={`content-production-difficulty-count-${index}`}
            min={1}
            onChange={(event) =>
              set(
                'difficultyPlan',
                options.difficultyPlan.map((current, currentIndex) =>
                  currentIndex === index
                    ? { ...current, count: Number(event.target.value) }
                    : current,
                ),
              )
            }
            type='number'
            value={item.count}
          />
        </div>
      ))}
      {(
        [
          ['targetVocabularyIds', '대상 어휘 IDs'],
          ['requiredVocabularyIds', '필수 어휘 IDs'],
          ['excludedVocabularyIds', '제외 어휘 IDs'],
        ] as const
      ).map(([key, label]) => (
        <div
          className='grid gap-cluster'
          key={key}
        >
          <Label htmlFor={`content-production-${key}`}>{label}</Label>
          <Input
            id={`content-production-${key}`}
            onChange={(event) => set(key, parseIds(event.target.value))}
            value={options[key].join(', ')}
          />
        </div>
      ))}
      <Label htmlFor='content-production-auxiliary-limit'>
        신규 보조 어휘 한도
      </Label>
      <Input
        id='content-production-auxiliary-limit'
        min={0}
        onChange={(event) =>
          set('newAuxiliaryVocabularyLimit', Number(event.target.value))
        }
        type='number'
        value={options.newAuxiliaryVocabularyLimit}
      />
      <Label htmlFor='content-production-similarity-threshold'>
        유사도 기준
      </Label>
      <Input
        id='content-production-similarity-threshold'
        max={1}
        min={0}
        onChange={(event) =>
          set('similarityThreshold', Number(event.target.value))
        }
        step='0.01'
        type='number'
        value={options.similarityThreshold}
      />
      <Label htmlFor='content-production-default-voice'>
        기본 음성 preset ID
      </Label>
      <Input
        id='content-production-default-voice'
        onChange={(event) => set('defaultVoicePresetId', event.target.value)}
        value={options.defaultVoicePresetId}
      />
      {options.speakerVoiceAssignments.map((item, index) => (
        <div
          className='grid gap-cluster'
          key={`${item.speakerRole}-${index}`}
        >
          <Label htmlFor={`content-production-speaker-role-${index}`}>
            speaker role {index + 1}
          </Label>
          <Input
            id={`content-production-speaker-role-${index}`}
            onChange={(event) =>
              set(
                'speakerVoiceAssignments',
                options.speakerVoiceAssignments.map((current, currentIndex) =>
                  currentIndex === index
                    ? { ...current, speakerRole: event.target.value }
                    : current,
                ),
              )
            }
            value={item.speakerRole}
          />
          <Label htmlFor={`content-production-speaker-voice-${index}`}>
            speaker 음성 preset ID {index + 1}
          </Label>
          <Input
            id={`content-production-speaker-voice-${index}`}
            onChange={(event) =>
              set(
                'speakerVoiceAssignments',
                options.speakerVoiceAssignments.map((current, currentIndex) =>
                  currentIndex === index
                    ? { ...current, voicePresetId: event.target.value }
                    : current,
                ),
              )
            }
            value={item.voicePresetId}
          />
        </div>
      ))}
      <Label htmlFor='content-production-instruction'>추가 지시</Label>
      <Textarea
        id='content-production-instruction'
        maxLength={2000}
        onChange={(event) =>
          set('additionalInstructionKo', event.target.value.trim() || null)
        }
        value={options.additionalInstructionKo ?? ''}
      />
    </TabsContent>
  );
}

const questionOptionsFrom = (
  preset: ContentProductionPreset | undefined,
): ContentProductionQuestionOptions | null => {
  if (!preset || preset.purpose === 'VOCABULARY_EXTRACTION') return null;
  const {
    questionCount,
    questionTypePlan,
    difficultyPlan,
    targetVocabularyIds,
    requiredVocabularyIds,
    excludedVocabularyIds,
    newAuxiliaryVocabularyLimit,
    similarityThreshold,
    defaultVoicePresetId,
    speakerVoiceAssignments,
    additionalInstructionKo,
  } = preset.parameters;
  return contentProductionQuestionOptionsSchema.parse({
    questionCount,
    questionTypePlan,
    difficultyPlan,
    targetVocabularyIds,
    requiredVocabularyIds,
    excludedVocabularyIds,
    newAuxiliaryVocabularyLimit,
    similarityThreshold,
    defaultVoicePresetId,
    speakerVoiceAssignments,
    additionalInstructionKo,
  });
};

/** verified upload 전에는 실행을 막고 prompt 원문은 read-only로 유지한다 */
export function ContentProductionForm({
  presets,
  preview,
  pending = false,
  onConfigurationChange,
  onFile,
  onPreview,
  onSubmit,
}: ContentProductionFormProps) {
  const [presetId, setPresetId] = useState(presets[0]?.id ?? '');
  const [uploaded, setUploaded] =
    useState<UploadedContentProductionInput | null>(null);
  const [questionOptions, setQuestionOptions] =
    useState<ContentProductionQuestionOptions | null>(() =>
      questionOptionsFrom(presets[0]),
    );
  const [questionPlanIndex, setQuestionPlanIndex] = useState('0');
  const questionCount = questionOptions?.questionCount ?? 0;
  const parsedOptions =
    contentProductionQuestionOptionsSchema.safeParse(questionOptions);
  const previewInput = {
    presetId,
    options: parsedOptions.success
      ? parsedOptions.data
      : (questionOptions ?? {}),
    questionPlanIndex: Number(questionPlanIndex),
  } as PreviewInput;
  return (
    <Card>
      <CardHeader>
        <CardTitle>새 콘텐츠 제작</CardTitle>
      </CardHeader>
      <CardContent className='grid gap-cluster'>
        <Tabs defaultValue='quick'>
          <TabsList>
            <TabsTrigger value='quick'>빠른 설정</TabsTrigger>
            <TabsTrigger value='advanced'>고급 설정</TabsTrigger>
          </TabsList>
          <QuickSettings
            onFile={async (file) => {
              const result = await onFile(file);
              setUploaded(result);
              return result;
            }}
            onPresetChange={(value) => {
              onConfigurationChange();
              setPresetId(value);
              setQuestionOptions(
                questionOptionsFrom(
                  presets.find((preset) => preset.id === value),
                ),
              );
              setQuestionPlanIndex('0');
            }}
            onQuestionPlanIndexChange={(value) => {
              onConfigurationChange();
              setQuestionPlanIndex(value);
            }}
            presetId={presetId}
            presets={presets}
            questionCount={questionCount}
            questionPlanIndex={questionPlanIndex}
          />
          <AdvancedSettings
            onChange={(options) => {
              onConfigurationChange();
              setQuestionOptions(options);
            }}
            options={questionOptions}
          />
        </Tabs>
        <FormActions
          onPreview={onPreview}
          onSubmit={onSubmit}
          pending={pending}
          {...(preview ? { preview } : {})}
          previewInput={previewInput}
          previewValid={parsedOptions.success}
          uploaded={uploaded}
        />
      </CardContent>
    </Card>
  );
}
