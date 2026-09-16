/** 합의한 구조를 다시 위반하는 변경을 검사기가 잡는지 검증한다. */
import { describe, expect, it } from 'vitest';
import { checkSourceArchitecture } from './check-source-architecture.mjs';

const featureFile =
  'frontend/web/src/features/vocabulary/components/VocabularyList.tsx';
const pageFile = 'frontend/web/src/pages/VocabularyListPage.tsx';

describe('소스 구조 검사', () => {
  it('페이지가 feature 컴포넌트를 직접 가져와 조립할 수 있다', () => {
    expect(
      checkSourceArchitecture({
        [featureFile]: 'export function VocabularyList() { return null; }',
        [pageFile]:
          "import { VocabularyList } from '@/features/vocabulary/components/VocabularyList'; export function VocabularyListPage() { return <VocabularyList />; }",
      }),
    ).toEqual([]);
  });

  it.each([
    "export * from './component';",
    "export { Component } from './component';",
    "import { Component } from './component'; export { Component };",
  ])('파일 이름과 관계없이 배럴 재수출을 거부한다: %s', (source) => {
    expect(
      checkSourceArchitecture({ 'shared/contracts/src/public.ts': source }),
    ).toEqual([expect.stringContaining('배럴 재수출')]);
  });

  it('페이지에 상태 로직과 하위 구현 폴더를 두지 않는다', () => {
    expect(
      checkSourceArchitecture({
        [pageFile]:
          'export function VocabularyListPage() { const data = useQuery(); return null; }',
        'frontend/web/src/pages/vocabulary/components/List.tsx':
          'export const List = 1;',
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('상태·조회·이벤트'),
        expect.stringContaining('조립용 페이지 파일'),
      ]),
    );
  });

  it('상위 계층과 다른 feature의 직접 참조를 거부한다', () => {
    expect(
      checkSourceArchitecture({
        [featureFile]:
          "import '@/pages/VocabularyListPage'; import '@/features/wordbook/components/Wordbook';",
        [pageFile]: 'export const Page = 1;',
        'frontend/web/src/features/wordbook/components/Wordbook.tsx':
          'export const Wordbook = 1;',
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('상위 계층'),
        expect.stringContaining('다른 feature'),
      ]),
    );
  });

  it('라우트 구현 index.tsx와 같은 파일의 named export를 허용한다', () => {
    expect(
      checkSourceArchitecture({
        'frontend/web/src/app/routes/index.tsx':
          'const Route = {}; export { Route };',
      }),
    ).toEqual([]);
  });
});
