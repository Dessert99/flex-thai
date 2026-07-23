/** MVP root가 Identity와 health 경계만 조립하는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { IdentityModule } from './identity/identity.module.js';
import { createApplicationModule } from './app.module.js';

describe('createApplicationModule', () => {
  it('로컬 설정에서 Identity module 하나와 health Controller만 조립한다', () => {
    const application = createApplicationModule({
      NODE_ENV: 'test',
      AUTH_MODE: 'fake',
      DATABASE_MODE: 'local',
      DATABASE_URL: 'postgres://local/test',
    });

    expect(application.imports).toHaveLength(1);
    expect(application.imports?.[0]).toMatchObject({ module: IdentityModule });
    expect(application.controllers).toHaveLength(2);
    expect(
      application.controllers?.map(
        (controller) => (controller as { name: string }).name,
      ),
    ).toEqual(['HealthController', 'ReadinessController']);
    expect(application.providers).toHaveLength(1);
  });
});
