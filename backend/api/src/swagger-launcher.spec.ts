/** Swagger 편의 명령의 서버·브라우저 실행 순서를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { createSwaggerUrl, launchSwagger } from './swagger-launcher.js';

describe('Swagger 실행 명령', () => {
  it('기본 포트와 사용자 지정 포트로 문서 URL을 만든다', () => {
    expect(createSwaggerUrl(3000)).toBe('http://localhost:3000/api/docs');
    expect(createSwaggerUrl(4100)).toBe('http://localhost:4100/api/docs');
  });

  it('서버가 준비된 뒤 브라우저를 연다', async () => {
    const events: string[] = [];

    await launchSwagger({
      port: 4100,
      startServer: vi.fn(() => {
        events.push('server');
        return Promise.resolve();
      }),
      openPage: vi.fn(() => {
        events.push('browser');
        return Promise.resolve();
      }),
    });

    expect(events).toEqual(['server', 'browser']);
  });

  it('서버 시작이 실패하면 브라우저를 열지 않는다', async () => {
    const openPage = vi.fn(() => Promise.resolve());

    await expect(
      launchSwagger({
        startServer: vi.fn(() => Promise.reject(new Error('listen failed'))),
        openPage,
      }),
    ).rejects.toThrow('listen failed');
    expect(openPage).not.toHaveBeenCalled();
  });

  it('브라우저 실행이 실패하면 URL을 안내하고 서버를 유지한다', async () => {
    const reportError = vi.fn();

    await expect(
      launchSwagger({
        startServer: vi.fn(() => Promise.resolve()),
        openPage: vi.fn(() => Promise.reject(new Error('open failed'))),
        reportError,
      }),
    ).resolves.toBeUndefined();
    expect(reportError).toHaveBeenCalledWith(
      '브라우저를 열지 못했습니다. 직접 접속하세요: http://localhost:3000/api/docs',
    );
  });
});
