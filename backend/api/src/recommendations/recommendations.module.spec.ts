/** 추천 DynamicModule의 controller·facade·인증 조립을 검증한다 */
import { describe, expect, it } from 'vitest';
import { LearnerRecommendationsController } from './learner-recommendations.controller.js';
import { RecommendationsModule } from './recommendations.module.js';
import { RecommendationsService } from './recommendations.service.js';

describe('RecommendationsModule', () => {
  it('추천 controller와 strict facade를 독립 module로 조립한다', () => {
    const module = RecommendationsModule.register({
      query: {} as never,
      users: {} as never,
      authorizer: {
        authMode: 'fake',
        cognitoClientId: 'local-client',
        nodeEnv: 'test',
      },
    });

    expect(module.controllers).toEqual([LearnerRecommendationsController]);
    const service = module.providers?.find(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === RecommendationsService,
    );
    expect(service).toMatchObject({ provide: RecommendationsService });
    expect(
      typeof service === 'object' && service !== null && 'useValue' in service
        ? service.useValue
        : null,
    ).toBeInstanceOf(RecommendationsService);
    expect(module.exports).toEqual([RecommendationsService]);
  });
});
