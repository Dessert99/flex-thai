/** 어휘 추출의 preset 선택·파일 업로드·작업 생성을 제공한다. */
import { Button } from '@/shared/components/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/card';
import { Input } from '@/shared/components/input';
import { Label } from '@/shared/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/select';
import type { ContentProductionPreset } from '@flex-thia/contracts/content-production/content-production';
import { useState } from 'react';
import type { UploadedContentProductionInput } from '../../libs/run-content-production/uploadContentProductionInput';
interface ContentProductionFormProps {
  presets: ContentProductionPreset[];
  pending?: boolean;
  onFile: (file: File) => Promise<UploadedContentProductionInput>;
  onSubmit: (input: { presetId: string; uploadId: string }) => void;
}
export function ContentProductionForm(props: ContentProductionFormProps) {
  const [presetId, setPresetId] = useState(props.presets[0]?.id ?? '');
  const [uploaded, setUploaded] =
    useState<UploadedContentProductionInput | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const upload = async (file: File) => {
    setUploaded(null);
    setUploading(true);
    setUploadError(false);
    try {
      setUploaded(await props.onFile(file));
    } catch {
      setUploadError(true);
    } finally {
      setUploading(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>콘텐츠 제작</CardTitle>
      </CardHeader>
      <CardContent className='grid gap-cluster'>
        <Label htmlFor='content-production-preset'>Preset</Label>
        <Select
          value={presetId}
          onValueChange={setPresetId}
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
        <Label htmlFor='content-production-file'>입력 파일</Label>
        <Input
          id='content-production-file'
          type='file'
          accept='.txt,.pdf,image/jpeg,image/png,image/webp'
          disabled={uploading || props.pending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        {uploadError ? <p role='alert'>파일을 업로드하지 못했습니다.</p> : null}
        <Button
          type='button'
          disabled={
            !uploaded ||
            !props.presets.some((preset) => preset.id === presetId) ||
            uploading ||
            props.pending
          }
          onClick={() => {
            if (uploaded)
              props.onSubmit({ presetId, uploadId: uploaded.uploadId });
          }}
        >
          작업 실행
        </Button>
      </CardContent>
    </Card>
  );
}
