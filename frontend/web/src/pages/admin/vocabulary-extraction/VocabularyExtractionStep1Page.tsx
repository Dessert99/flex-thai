import { ExtractionTemplateDialog } from '@/features/content-production/components/vocabulary-extraction/ExtractionTemplateDialog';
import { VocabularyExtractionSource } from '@/features/content-production/components/vocabulary-extraction/VocabularyExtractionSource';
import { useRef, useState } from 'react';
import { Button } from '@/shared/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/components/card';
import { Label } from '@/shared/components/label';
import { Container } from '@/shared/components/layouts/Container';
import { Textarea } from '@/shared/components/textarea';
/** 화면 배치와 기능 컴포넌트를 페이지에서 직접 조립한다 */

export function VocabularyExtractionStep1Page() {
  const [prompt, setPrompt] = useState(
    '자료에 등장하는 태국어 단어와 문맥상 뜻을 추출하세요. 같은 단어와 뜻은 하나로 합치고, 자료에 없는 뜻은 추가하지 마세요.',
  );
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const templateTrigger = useRef<HTMLButtonElement>(null);

  return (
    <Container className='w-full max-w-3xl flex-1'>
      <div className='grid gap-section'>
        <header className='grid gap-cluster'>
          <p className='text-caption text-subtle'>관리자 / 단어 추출</p>
          <h1 className='text-heading'>단어 추출</h1>
          <p className='text-body text-subtle'>
            자료를 넣으면 새 단어와 새로운 뜻을 찾아요.
          </p>
        </header>
        <p
          aria-current='step'
          className='flex items-center gap-cluster text-caption'
        >
          <span className='flex size-avatar items-center justify-center rounded-control bg-brand text-primary-foreground'>
            1
          </span>
          <strong>자료 입력</strong>
        </p>
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
            현재는 자료 입력 단계까지 사용할 수 있어요. 추출 실행은 준비
            중이에요.
          </p>
          {templatesOpen && (
            <ExtractionTemplateDialog
              onClose={() => setTemplatesOpen(false)}
              onRestoreFocus={() => templateTrigger.current?.focus()}
            />
          )}
        </>
      </div>
    </Container>
  );
}
