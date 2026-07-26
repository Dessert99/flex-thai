/** ConceptsModule의 controller·guard 조립을 검증한다 */
import { describe, expect, it } from 'vitest';
import { AdminConceptsController } from './admin-concepts.controller.js';
import { ConceptsService } from './concepts.service.js';
import { LearnerConceptsController } from './learner-concepts.controller.js';
import { ConceptsModule } from './concepts.module.js';

describe('ConceptsModule', () => {
  it('학습자와 관리자 controller를 하나의 strict facade에 연결한다', () => {
    const module = ConceptsModule.register({
      learnerQuery: {} as never,
      adminQuery: {} as never,
      adminService: {} as never,
      mediaReadUrls: {} as never,
      users: {} as never,
      authorizer: {
        authMode: 'fake',
        cognitoClientId: 'local-client',
        nodeEnv: 'test',
      },
    });

    expect(module.controllers).toEqual([
      LearnerConceptsController,
      AdminConceptsController,
    ]);
    expect(module.exports).toEqual([ConceptsService]);
  });
});
