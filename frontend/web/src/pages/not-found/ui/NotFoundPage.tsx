/** 존재하지 않는 경로에서 안전한 복귀 동작을 제공한다 */
import { Button } from '@/shared/ui/button';
import { PageEmpty } from '@/shared/ui/page-state';

/** 찾을 수 없는 경로 화면이 Router에 요청할 복귀 동작 */
export interface NotFoundPageProps {
  onNavigateHome: () => void;
}

/** 잘못된 경로를 노출하지 않고 애플리케이션 홈 복귀를 안내한다 */
export function NotFoundPage({ onNavigateHome }: NotFoundPageProps) {
  return (
    <main className='grid min-h-screen place-items-center bg-surface p-page'>
      <div className='w-full max-w-content'>
        <PageEmpty
          action={
            <Button
              onClick={onNavigateHome}
              type='button'
            >
              홈으로 돌아가기
            </Button>
          }
          description='주소를 다시 확인하거나 홈에서 이동해 주세요.'
          title='페이지를 찾을 수 없습니다.'
        />
      </div>
    </main>
  );
}
