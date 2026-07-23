/** 로컬 진입점이 같은 NestJS 서버 설정을 사용하는지 검증한다 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApplicationModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { startLocalApiServer } from './local-server.js';

const { createNestApplication } = vi.hoisted(() => ({
  createNestApplication: vi.fn(),
}));

vi.mock('@nestjs/core', () => ({
  NestFactory: { create: createNestApplication },
}));
vi.mock('./app.module.js', () => ({
  createApplicationModule: vi.fn(() => 'application-module'),
}));
vi.mock('./app.setup.js', () => ({
  configureApp: vi.fn(),
}));

describe('로컬 API 서버', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('선택한 환경과 포트로 공통 애플리케이션을 시작한다', async () => {
    const app = { listen: vi.fn(() => Promise.resolve()) };
    createNestApplication.mockResolvedValue(app);

    await startLocalApiServer({ nodeEnv: 'development', port: 4100 });

    expect(createApplicationModule).toHaveBeenCalledOnce();
    expect(configureApp).toHaveBeenCalledWith(app, undefined, 'development');
    expect(app.listen).toHaveBeenCalledWith(4100);
  });
});
