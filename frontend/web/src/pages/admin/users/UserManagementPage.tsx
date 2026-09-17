import { Container } from '@/shared/components/layouts/Container';
/** 기능 화면을 조립하는 페이지 진입점 */
import type { ComponentProps } from 'react';
import { UserManagementPage as UserManagementPageContent } from '@/features/identity/components/user-management/UserManagementPage';

/** 라우트 입력을 기능 화면에 전달한다 */
export function UserManagementPage(
  props: ComponentProps<typeof UserManagementPageContent>,
) {
  return (
    <Container className='max-w-content flex-1'>
      <UserManagementPageContent {...props} />
    </Container>
  );
}
