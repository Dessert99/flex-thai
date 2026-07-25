/** 로그인 index route를 Login Page Container에 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import { LoginPageContainer } from '@/pages/login';

/** 검증된 redirect search를 로그인 성공 navigation에 전달한다 */
export const Route = createFileRoute('/login/')({
  component: LoginIndexRoute,
});

function LoginIndexRoute() {
  const { redirect } = Route.useSearch();
  return (
    <LoginPageContainer
      {...(redirect === undefined ? {} : { redirectTo: redirect })}
    />
  );
}
