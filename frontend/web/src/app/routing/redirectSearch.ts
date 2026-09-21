/** 로그인 redirect를 승인된 same-origin route와 search 계약으로 제한한다 */

import {
  wordbookIdPathSchema,
  wordbookItemListQuerySchema,
} from '@flex-thia/contracts/learning/wordbooks';

const approvedStaticPaths = new Set([
  '/',
  '/login',
  '/login/mfa',
  '/learn',
  '/vocabularies',
  '/wordbooks',
  '/admin',
  '/admin/users',
  '/admin/audit-logs',
  '/admin/totp-setup',
  '/admin/vocabularies',
  '/forbidden',
]);

const approvedDynamicPaths = [
  /^\/vocabularies\/[0-9a-f-]+$/u,
  /^\/wordbooks\/[0-9a-f-]+$/u,
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
    (approvedDynamicPaths.some((pattern) => pattern.test(pathname)) &&
      (!pathname.startsWith('/wordbooks/') || isValidWordbookPath(pathname)))
  );
}

function hasValidSearch(url: URL): boolean {
  if (url.search === '') {
    return true;
  }
  if (isValidWordbookPath(url.pathname)) {
    return wordbookItemListQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    ).success;
  }
  return false;
}

function isValidWordbookPath(pathname: string): boolean {
  if (!pathname.startsWith('/wordbooks/')) {
    return false;
  }
  return wordbookIdPathSchema.safeParse({
    wordbookId: pathname.slice('/wordbooks/'.length),
  }).success;
}
