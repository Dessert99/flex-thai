/** 로그인 redirect를 승인된 same-origin route와 search 계약으로 제한한다 */
import { questionListQuerySchema } from '@flex-thia/contracts';

const approvedStaticPaths = new Set([
  '/',
  '/login',
  '/login/mfa',
  '/learn',
  '/questions',
  '/history',
  '/vocabularies',
  '/saved-vocabularies',
  '/admin',
  '/admin/totp-setup',
  '/admin/content-imports',
  '/admin/questions',
  '/admin/vocabularies',
  '/forbidden',
]);

const approvedDynamicPaths = [
  /^\/questions\/[0-9a-f-]+$/u,
  /^\/vocabularies\/[0-9a-f-]+$/u,
  /^\/admin\/content-imports\/[0-9a-f-]+$/u,
  /^\/admin\/questions\/[0-9a-f-]+$/u,
  /^\/admin\/questions\/[0-9a-f-]+\/versions\/[0-9a-f-]+\/replace$/u,
  /^\/admin\/vocabularies\/[0-9a-f-]+$/u,
];

/** 외부·미등록 route·계약 밖 search를 제거하고 안전한 내부 href만 반환한다 */
export function parseSafeRedirect(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('#')
  ) {
    return undefined;
  }

  const url = new URL(value, 'https://flex-thia.invalid');
  if (!isApprovedPath(url.pathname) || !hasValidSearch(url)) {
    return undefined;
  }

  return `${url.pathname}${url.search}`;
}

function isApprovedPath(pathname: string): boolean {
  return (
    approvedStaticPaths.has(pathname) ||
    approvedDynamicPaths.some((pattern) => pattern.test(pathname))
  );
}

function hasValidSearch(url: URL): boolean {
  if (url.search === '') {
    return true;
  }
  if (url.pathname !== '/questions') {
    return false;
  }

  return questionListQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    .success;
}
