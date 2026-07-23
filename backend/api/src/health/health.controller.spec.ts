/** API 프로세스 생존 응답을 고정하는 단위 테스트 */
import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('API 프로세스가 살아 있으면 고정된 상태를 반환한다', () => {
    const controller = new HealthController();

    expect(controller.getHealth()).toEqual({
      status: 'ok',
      service: 'api',
    });
  });
});
