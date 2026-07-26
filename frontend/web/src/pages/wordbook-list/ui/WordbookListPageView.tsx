/** 단어장 생성 입력과 목록·빈 상태를 한 화면에 표현한다 */
import type { WordbookListResponse } from '@flex-thia/contracts';
import { WordbookActions, WordbookForm } from '@/features/manage-wordbook';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';

interface WordbookListPageViewProps {
  items: WordbookListResponse['items'];
}

/** 단어장 이름·항목 수·상세 링크와 관리 행동을 표시한다 */
export function WordbookListPageView({ items }: WordbookListPageViewProps) {
  return (
    <section
      aria-labelledby='wordbooks-title'
      className='grid gap-section'
    >
      <header className='grid gap-cluster'>
        <h1
          className='text-title text-primary'
          id='wordbooks-title'
        >
          내 단어장
        </h1>
        <WordbookForm />
      </header>
      {items.length === 0 ? (
        <p className='text-body text-subtle'>아직 단어장이 없습니다.</p>
      ) : (
        <ul className='grid gap-cluster'>
          {items.map((wordbook) => (
            <li key={wordbook.id}>
              <Card>
                <CardHeader>
                  <CardTitle>{wordbook.name}</CardTitle>
                </CardHeader>
                <CardContent className='grid gap-cluster'>
                  <p className='text-body text-subtle'>
                    {wordbook.itemCount}개 항목
                  </p>
                  <a href={`/wordbooks/${wordbook.id}`}>{wordbook.name} 열기</a>
                  <WordbookActions
                    name={wordbook.name}
                    wordbookId={wordbook.id}
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
