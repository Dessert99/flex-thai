/** 기능 화면을 조립하는 페이지 진입점 */
import type { ComponentProps } from 'react';
import { AuditLogManagementPage as AuditLogManagementPageContent } from '@/features/operations/components/audit-log-management/AuditLogManagementPage';

/** 라우트 입력을 기능 화면에 전달한다 */
export function AuditLogManagementPage(
  props: ComponentProps<typeof AuditLogManagementPageContent>,
) {
  return (
    <div className='mx-auto w-full max-w-content flex-1 p-page'>
      <AuditLogManagementPageContent {...props} />
    </div>
  );
}
