/** refresh token cookie 이름과 보안 속성을 한 곳에서 관리한다 */

/** 브라우저에 저장하는 refresh token cookie 이름 */
export const REFRESH_COOKIE_NAME = '__Host-flex-thia-refresh';

/** refresh token cookie에 공통 적용하는 보안 속성 */
export const REFRESH_COOKIE_OPTIONS = {
  secure: true,
  httpOnly: true,
  sameSite: 'strict',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
} as const;

type CookieResponse = {
  cookie(
    name: string,
    value: string,
    options: typeof REFRESH_COOKIE_OPTIONS,
  ): void;
};

type ClearCookieResponse = {
  clearCookie(
    name: string,
    options: Omit<typeof REFRESH_COOKIE_OPTIONS, 'maxAge'>,
  ): void;
};

/** 회전 가능한 refresh token을 보안 cookie로 기록한다 */
export const writeRefreshCookie = (
  response: CookieResponse,
  refreshToken: string,
): void => {
  response.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
};

/** logout 뒤 refresh cookie를 동일한 범위와 보안 속성으로 삭제한다 */
export const clearRefreshCookie = (response: ClearCookieResponse): void => {
  response.clearCookie(REFRESH_COOKIE_NAME, {
    secure: REFRESH_COOKIE_OPTIONS.secure,
    httpOnly: REFRESH_COOKIE_OPTIONS.httpOnly,
    sameSite: REFRESH_COOKIE_OPTIONS.sameSite,
    path: REFRESH_COOKIE_OPTIONS.path,
  });
};

/** Cookie header에서 refresh token만 추출한다 */
export const readRefreshToken = (
  cookieHeader: string | string[] | undefined,
): string | null => {
  if (typeof cookieHeader !== 'string') {
    return null;
  }

  const prefix = `${REFRESH_COOKIE_NAME}=`;
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return cookie?.slice(prefix.length) || null;
};
