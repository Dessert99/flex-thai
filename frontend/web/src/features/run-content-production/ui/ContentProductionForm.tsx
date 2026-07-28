/** 콘텐츠 제작 upload·preview·create 행동을 한 form으로 제공한다 */
import { useState } from 'react';
import type {
  ContentProductionPreset,
  PromptPreviewResponse,
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
  additionalInstructionKo: string | null;
  questionPlanIndex: number;
};
type SubmitInput = Omit<PreviewInput, 'questionPlanIndex'> & {
  uploadId: string;
};

interface ContentProductionFormProps {
  presets: ContentProductionPreset[];
  preview?: PromptPreviewResponse;
  pending?: boolean;
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
  questionCount: number;
  uploaded: UploadedContentProductionInput | null;
}

function FormActions(props: FormActionsProps) {
  const submit = () => {
    if (!props.uploaded) return;
    props.onSubmit({
      presetId: props.previewInput.presetId,
      uploadId: props.uploaded.uploadId,
      additionalInstructionKo: props.previewInput.additionalInstructionKo,
    });
  };
  return (
    <>
      <div className='flex gap-cluster'>
        <Button
          disabled={
            !props.previewInput.presetId ||
            props.questionCount === 0 ||
            props.pending
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

/** verified upload 전에는 실행을 막고 prompt 원문은 read-only로 유지한다 */
export function ContentProductionForm({
  presets,
  preview,
  pending = false,
  onFile,
  onPreview,
  onSubmit,
}: ContentProductionFormProps) {
  const [presetId, setPresetId] = useState(presets[0]?.id ?? '');
  const [uploaded, setUploaded] =
    useState<UploadedContentProductionInput | null>(null);
  const [instruction, setInstruction] = useState('');
  const [questionPlanIndex, setQuestionPlanIndex] = useState('0');
  const selectedPreset = presets.find((preset) => preset.id === presetId);
  const questionCount =
    selectedPreset && 'questionCount' in selectedPreset.parameters
      ? selectedPreset.parameters.questionCount
      : 0;
  const previewInput = {
    presetId,
    additionalInstructionKo: instruction.trim() || null,
    questionPlanIndex: Number(questionPlanIndex),
  };
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
              setPresetId(value);
              setQuestionPlanIndex('0');
            }}
            onQuestionPlanIndexChange={setQuestionPlanIndex}
            presetId={presetId}
            presets={presets}
            questionCount={questionCount}
            questionPlanIndex={questionPlanIndex}
          />
          <TabsContent
            className='grid gap-cluster'
            value='advanced'
          >
            <Label htmlFor='content-production-instruction'>추가 지시</Label>
            <Textarea
              id='content-production-instruction'
              maxLength={2000}
              onChange={(event) => setInstruction(event.target.value)}
              value={instruction}
            />
          </TabsContent>
        </Tabs>
        <FormActions
          onPreview={onPreview}
          onSubmit={onSubmit}
          pending={pending}
          {...(preview ? { preview } : {})}
          previewInput={previewInput}
          questionCount={questionCount}
          uploaded={uploaded}
        />
      </CardContent>
    </Card>
  );
}
