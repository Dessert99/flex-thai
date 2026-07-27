/** 문제 목록의 API 지원 필터를 URL 검색값에 직접 연결한다 */
import type { QuestionListFacets } from '@flex-thia/contracts';
import { Button } from '@/shared/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/ui/sheet';
import type { QuestionListSearch } from '../model/questionListSearch';
import { QuestionFilterFields } from './QuestionFilterFields';

interface QuestionFiltersProps {
  facets: QuestionListFacets;
  onChange: (patch: Partial<QuestionListSearch>) => void;
  onReset: () => void;
  search: QuestionListSearch;
}

/** 데스크톱 고정 필터와 모바일 Sheet가 같은 검증 검색값을 사용한다 */
export function QuestionFilters({
  facets,
  onChange,
  onReset,
  search,
}: QuestionFiltersProps) {
  return (
    <>
      <div className='hidden rounded-panel border border-default bg-surface p-page md:block'>
        <QuestionFilterFields
          facets={facets}
          onChange={onChange}
          onReset={onReset}
          search={search}
        />
      </div>
      <div className='md:hidden'>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              type='button'
              variant='outline'
            >
              필터 열기
            </Button>
          </SheetTrigger>
          <SheetContent
            className='bg-surface'
            data-side='bottom'
            side='bottom'
            showCloseButton={false}
          >
            <SheetHeader>
              <SheetTitle>문제 필터</SheetTitle>
              <SheetDescription>
                URL에 저장할 문제 조건을 선택하세요.
              </SheetDescription>
            </SheetHeader>
            <div className='grid gap-cluster p-page'>
              <QuestionFilterFields
                facets={facets}
                onChange={onChange}
                onReset={onReset}
                search={search}
              />
              <SheetClose asChild>
                <Button
                  type='button'
                  variant='outline'
                >
                  필터 닫기
                </Button>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
