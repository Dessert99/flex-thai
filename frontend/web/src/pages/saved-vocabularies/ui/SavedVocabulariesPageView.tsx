/** 단일 저장 어휘 collection을 태국어 원문 목록으로 표현한다 */
import type { SavedVocabularyListResponse } from '@flex-thia/contracts';

/** 저장된 서버 요약을 상세 링크로 렌더링한다 */
export function SavedVocabulariesPageView({
  items,
}: {
  items: SavedVocabularyListResponse['items'];
}) {
  return (
    <section className='grid gap-section'>
      <h1 className='text-title'>저장한 어휘</h1>
      <ul className='grid gap-cluster'>
        {items.map((item) => (
          <li key={item.id}>
            <a href={`/vocabularies/${item.id}`}>
              <span lang='th'>{item.thai}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
