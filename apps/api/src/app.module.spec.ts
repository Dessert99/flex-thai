/** 실행 환경에 맞는 인증·업로드·Job module이 root에 조립되는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { createApplicationModule } from './app.module.js';

describe('createApplicationModule', () => {
  it('로컬 설정에서 세 기능 module과 readiness를 모두 조립한다', () => {
    const application = createApplicationModule({
      NODE_ENV: 'test',
      AUTH_MODE: 'fake',
      DATABASE_MODE: 'local',
      DATABASE_URL: 'postgres://local/test',
    });

    expect(application.imports).toHaveLength(3);
    expect(application.controllers).toHaveLength(2);
    expect(application.providers).toHaveLength(1);
  });
});
