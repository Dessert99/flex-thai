/** 권한 부족을 세션 종료와 분리해 안내하는 복구 화면을 제공한다 */
import { Button } from '@/shared/ui/button';
import { PageEmpty } from '@/shared/ui/page-state';

/** 접근 거부 화면이 Router에 요청할 복귀 동작 */
export interface ForbiddenPageProps {
  onNavigateHome: () => void;
}

/** 현재 인증 세션을 유지한 채 허용된 홈으로 돌아갈 수 있게 한다 */
export function ForbiddenPage({ onNavigateHome }: ForbiddenPageProps) {
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
          description='현재 계정에는 이 화면을 사용할 권한이 없습니다.'
          title='접근 권한이 없습니다.'
        />
      </div>
    </main>
  );
}
