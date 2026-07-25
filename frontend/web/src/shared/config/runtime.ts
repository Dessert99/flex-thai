/** 배포 환경의 API base URL을 시작 시 검증하고 정규화한다 */
interface RuntimeEnvironment {
  VITE_API_BASE_URL?: string;
}

/** 브라우저 transport가 사용하는 검증된 런타임 설정 */
export interface RuntimeConfig {
  apiBaseUrl: string;
}

const defaultApiBaseUrl = '/api/v1';

function isValidApiBaseUrl(value: string) {
  if (value.startsWith('/')) {
    return (
      !value.startsWith('//') && !value.includes('?') && !value.includes('#')
    );
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}

/** 환경변수 누락은 same-origin으로 처리하고 잘못된 명시값은 즉시 거부한다 */
export function readRuntimeConfig(
  environment: RuntimeEnvironment,
): RuntimeConfig {
  const configured = environment.VITE_API_BASE_URL?.trim();
  if (!configured) {
    return { apiBaseUrl: defaultApiBaseUrl };
  }
  if (!isValidApiBaseUrl(configured)) {
    throw new Error('VITE_API_BASE_URL이 유효한 API base URL이 아닙니다.');
  }

  return {
    apiBaseUrl: configured.replace(/\/+$/u, ''),
  };
}

/** 애플리케이션 import 시 한 번 검증되는 런타임 설정 */
export const runtimeConfig = readRuntimeConfig({
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
});
