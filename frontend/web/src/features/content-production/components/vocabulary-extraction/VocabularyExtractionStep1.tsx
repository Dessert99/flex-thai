/** 자료 입력 1단계: 파일·링크와 복사한 지시문을 준비한다 */
import { useRef, useState } from 'react';
import { Button } from '@/shared/components/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/shared/components/card';
import { Label } from '@/shared/components/label';
import { Textarea } from '@/shared/components/textarea';
import { VocabularyExtractionSource } from './VocabularyExtractionSource';
import { ExtractionTemplateDialog } from './ExtractionTemplateDialog';

export function VocabularyExtractionStep1() {
  const [prompt, setPrompt] = useState(
    '자료에 등장하는 태국어 단어와 문맥상 뜻을 추출하세요. 같은 단어와 뜻은 하나로 합치고, 자료에 없는 뜻은 추가하지 마세요.',
  );
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const templateTrigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Card>
        <CardHeader className='border-b border-default'>
          <CardTitle>추출할 자료와 지시문</CardTitle>
          <CardDescription>
            자료를 선택하고 원하는 추출 기준을 작성하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-section'>
          <VocabularyExtractionSource />
          <section className='grid gap-cluster'>
            <Label htmlFor='extraction-prompt'>추출 지시문</Label>
            <Textarea
              id='extraction-prompt'
              className='h-extraction-input resize-none text-body'
              maxLength={20000}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='어떤 단어를 추출할지 알려주세요.'
            />
            <div className='flex flex-wrap items-center justify-between gap-cluster'>
              <Button
                ref={templateTrigger}
                variant='outline'
                onClick={() => setTemplatesOpen(true)}
              >
                템플릿
              </Button>
              <p className='text-caption text-subtle'>
                복사한 지시문을 붙여 넣으세요.
              </p>
            </div>
          </section>
        </CardContent>
        <CardFooter className='flex-wrap justify-between gap-cluster border-t border-default'>
          <p className='text-caption text-subtle'>
            기존 단어와 뜻은 자동으로 제외해요.
          </p>
          <Button
            disabled
            aria-describedby='extraction-availability'
          >
            추출 시작
          </Button>
        </CardFooter>
      </Card>
      <p
        id='extraction-availability'
        className='text-caption text-subtle'
      >
        현재는 자료 입력 단계까지 사용할 수 있어요. 추출 실행은 준비 중이에요.
      </p>
      {templatesOpen && (
        <ExtractionTemplateDialog
          onClose={() => setTemplatesOpen(false)}
          onRestoreFocus={() => templateTrigger.current?.focus()}
        />
      )}
    </>
  );
}
