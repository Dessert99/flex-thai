import { validateExtractionFile } from '@/features/vocabulary-extraction/libs/vocabulary-extraction/validateExtractionFile';
import type { ExtractionSourceInput } from '@/features/vocabulary-extraction/hooks/vocabulary-extraction/useCreateExtraction';
import { ExtractionFileInput } from './ExtractionFileInput';
/** 동일 높이의 파일·링크 입력 패널로 푸터 위치를 유지한다 */
import { useState } from 'react';
import { Input } from '@/shared/components/input';
import { Label } from '@/shared/components/label';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/tabs';

export function VocabularyExtractionSource({
  onChange,
}: {
  onChange?: (source: ExtractionSourceInput) => void;
}) {
  const [tab, setTab] = useState('file');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const selectFiles = (files: FileList | null) => {
    const selected = files?.[0];
    if (!selected) return;
    try {
      const file = validateExtractionFile(selected, files?.length ?? 0);
      setFile(file);
      onChange?.({ kind: 'file', file });
    } catch (error) {
      setError(error instanceof Error ? error.message : '파일을 확인하세요.');
      return;
    }
    setError('');
  };
  return (
    <section
      aria-label='추출할 자료'
      className='grid gap-cluster'
    >
      <h3 className='font-semibold'>추출할 자료</h3>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value);
          onChange?.(
            value === 'file' ? { kind: 'file', file } : { kind: 'url', url },
          );
        }}
      >
        <TabsList
          variant='line'
          className='w-full justify-start border-b border-default'
        >
          <TabsTrigger
            value='file'
            className='flex-none'
          >
            파일 업로드
          </TabsTrigger>
          <TabsTrigger
            value='link'
            className='flex-none'
          >
            웹 링크
          </TabsTrigger>
        </TabsList>
        <div className='h-extraction-source'>
          <TabsContent
            value='file'
            className='flex h-full flex-col justify-center gap-cluster'
          >
            <ExtractionFileInput
              file={file}
              error={error}
              onSelect={selectFiles}
              onRemove={() => {
                setFile(null);
                onChange?.({ kind: 'file', file: null });
                setError('');
              }}
            />
          </TabsContent>
          <TabsContent
            value='link'
            className='flex h-full flex-col justify-center gap-cluster'
          >
            <Label htmlFor='extraction-source-url'>웹페이지 주소</Label>
            <Input
              id='extraction-source-url'
              type='url'
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                onChange?.({ kind: 'url', url: e.target.value });
              }}
              placeholder='자료가 있는 웹페이지 주소를 붙여 넣으세요'
            />
            <p className='text-caption text-subtle'>
              페이지 본문을 바탕으로 단어를 추출해요.
            </p>
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}
