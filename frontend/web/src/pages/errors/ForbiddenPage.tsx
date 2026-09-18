import { Button } from '@/shared/components/button';
/** 화면 배치와 기능 컴포넌트를 페이지에서 직접 조립한다 */

/** 접근 거부 화면이 Router에 요청할 복귀 동작 */
export interface ForbiddenPageProps {
  onNavigateHome: () => void;
}
export function ForbiddenPage({ onNavigateHome }: ForbiddenPageProps) {
  return (
    <main className='grid min-h-screen place-items-center bg-background p-page'>
      <>
        <div className='w-full max-w-content'>
          <section className='flex min-h-state flex-col items-center justify-center gap-cluster rounded-panel border border-default bg-surface-muted p-page text-center'>
            <h2 className='text-title text-primary'>접근 권한이 없습니다.</h2>
            <p className='text-body text-subtle'>
              현재 계정에는 이 화면을 사용할 권한이 없습니다.
            </p>
            {
              <Button
                onClick={onNavigateHome}
                type='button'
              >
                홈으로 돌아가기
              </Button>
            }
          </section>
        </div>
      </>
    </main>
  );
}
