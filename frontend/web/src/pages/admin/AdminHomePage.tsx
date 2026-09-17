import { Container } from '@/shared/components/layouts/Container';
/** 기능 화면을 조립하는 페이지 진입점 */
import { AdminHomePageContainer } from '@/features/operations/components/admin-home/AdminHomePageContainer';

/** 라우트 입력을 기능 화면에 전달한다 */
export function AdminHomePage() {
  return (
    <Container className='max-w-content flex-1'>
      <AdminHomePageContainer />
    </Container>
  );
}
