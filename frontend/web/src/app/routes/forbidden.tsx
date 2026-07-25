/** 인증 세션을 변경하지 않는 접근 거부 경로를 정의한다 */
import { createFileRoute } from '@tanstack/react-router';
import { ForbiddenPage } from '@/pages/forbidden';

/** 서버·route 접근 거부가 이동할 공개 recovery route */
export const Route = createFileRoute('/forbidden')({
  component: ForbiddenRoute,
});

function ForbiddenRoute() {
  const navigate = Route.useNavigate();
  return (
    <ForbiddenPage
      onNavigateHome={() => void navigate({ replace: true, to: '/' })}
    />
  );
}
