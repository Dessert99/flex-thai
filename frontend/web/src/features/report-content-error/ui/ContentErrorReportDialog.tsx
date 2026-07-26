/** 현재 콘텐츠 문맥을 고정해 오류 신고 한 행동을 수행한다 */
import type {
  ContentErrorReportCategory,
  ContentErrorReportOrigin,
  CreateContentErrorReportRequest,
} from '@flex-thia/contracts';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { submitContentErrorReport } from '../api/contentErrorReportMutation';

/** 신고 대상 미리보기 */
export interface ContentErrorReportPreview {
  title: string;
  metadata: string;
}
/** 공통 오류 신고 dialog 입력 */
export interface ContentErrorReportDialogProps {
  origin: ContentErrorReportOrigin;
  preview: ContentErrorReportPreview;
  triggerLabel?: string;
  onSubmit?: (request: CreateContentErrorReportRequest) => Promise<unknown>;
}

const categories: readonly {
  value: ContentErrorReportCategory;
  label: string;
}[] = [
  { value: 'MEANING_TRANSLATION', label: '뜻·해석' },
  { value: 'PRONUNCIATION_TONE', label: '발음·성조' },
  { value: 'AUDIO', label: '음성' },
  { value: 'ANSWER_EXPLANATION', label: '정답·해설' },
  { value: 'TOKENIZATION', label: '단어 분할' },
  { value: 'OTHER', label: '기타' },
];

/** 문제·어휘·문장·음성·개념이 재사용하는 오류 신고 dialog */
export function ContentErrorReportDialog({
  origin,
  preview,
  triggerLabel = '오류 신고',
  onSubmit = submitContentErrorReport,
}: ContentErrorReportDialogProps) {
  const [category, setCategory] = useState<ContentErrorReportCategory>();
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);

  const submit = async () => {
    if (!category) return;
    setSubmitting(true);
    setError(false);
    try {
      await onSubmit({
        origin,
        category,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      setSubmitted(true);
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant='outline'>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>콘텐츠 오류 신고</DialogTitle>
          <DialogDescription>
            신고만으로 콘텐츠가 자동 숨김되지 않습니다.
          </DialogDescription>
        </DialogHeader>
        {submitted ? (
          <p role='status'>신고가 접수되었습니다.</p>
        ) : (
          <>
            <section aria-label='자동 첨부 대상'>
              <strong>{preview.title}</strong>
              <p>{preview.metadata}</p>
            </section>
            <div>
              <span>신고 분류</span>
              <Select
                value={category ?? ''}
                onValueChange={(value) =>
                  setCategory(value as ContentErrorReportCategory)
                }
              >
                <SelectTrigger aria-label='신고 분류'>
                  <SelectValue placeholder='분류 선택' />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((item) => (
                    <SelectItem
                      key={item.value}
                      value={item.value}
                    >
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <span>추가 설명</span>
              <Textarea
                aria-label='추가 설명'
                maxLength={1000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            {error ? <p role='alert'>신고를 제출하지 못했습니다.</p> : null}
            <DialogFooter>
              <Button
                disabled={!category || submitting}
                onClick={() => void submit()}
                type='button'
              >
                신고 제출
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
