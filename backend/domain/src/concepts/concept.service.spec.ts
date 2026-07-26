/** 개념 검증과 게시 use case를 검증한다 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';
import { ConceptService } from './concept.service.js';
import type { ConceptAdminRepository } from './concept.repository.js';
import type { ConceptValidationCandidate } from './concept.js';

const draft: ConceptValidationCandidate = {
  id: 'version-1',
  conceptId: 'concept-1',
  revision: 3,
  status: 'DRAFT',
  validationStatus: 'PENDING',
  validatedRevision: null,
  category: 'GRAMMAR',
  position: 0,
  title: '기본 어순',
  summary: '요약',
  blocks: [
    {
      id: 'block-1',
      kind: 'EXPLANATION',
      position: 0,
      heading: '설명',
      paragraphs: ['본문'],
    },
  ],
};

const repository = (): ConceptAdminRepository => ({
  createConcept: vi.fn(),
  createNextDraft: vi.fn(),
  replaceDraft: vi.fn(),
  loadValidationCandidate: vi.fn().mockResolvedValue(draft),
  saveValidation: vi.fn().mockImplementation(async (input) => ({
    versionId: input.versionId,
    revision: input.expectedRevision,
    status: input.issues.length === 0 ? 'PASSED' : 'FAILED',
    issues: input.issues,
    validatedAt: input.validatedAt,
  })),
  publish: vi.fn(),
  hide: vi.fn(),
  restore: vi.fn(),
});

describe('ConceptService', () => {
  it('결정적 검증 통과 뒤 외부 검증 결과를 저장한다', async () => {
    const repo = repository();
    const validator = {
      validate: vi.fn().mockResolvedValue([
        {
          source: 'EXTERNAL' as const,
          path: 'title',
          code: 'UNCLEAR_TITLE',
          evidenceKo: '제목이 모호합니다.',
        },
      ]),
    };
    const service = new ConceptService(repo, validator);

    const report = await service.validateVersion('version-1', {
      actorSub: 'admin',
      actorUserId: 'user-1',
      requestId: 'request-1',
      occurredAt: new Date('2026-07-26T00:00:00.000Z'),
    });

    expect(validator.validate).toHaveBeenCalledWith(draft);
    expect(report.status).toBe('FAILED');
    expect(repo.saveValidation).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: 3 }),
      expect.any(Object),
    );
  });

  it('결정적 검증 실패 시 외부 validator를 호출하지 않는다', async () => {
    const repo = repository();
    const invalid = structuredClone(draft);
    invalid.blocks[0]!.position = 1;
    vi.mocked(repo.loadValidationCandidate).mockResolvedValue(invalid);
    const validator = { validate: vi.fn() };
    const service = new ConceptService(repo, validator);

    const report = await service.validateVersion('version-1', {
      actorSub: 'admin',
      actorUserId: 'user-1',
      requestId: 'request-1',
      occurredAt: new Date(),
    });

    expect(validator.validate).not.toHaveBeenCalled();
    expect(report.status).toBe('FAILED');
  });

  it('없는 버전 검증을 안정적인 오류로 거부한다', async () => {
    const repo = repository();
    vi.mocked(repo.loadValidationCandidate).mockResolvedValue(null);
    const service = new ConceptService(repo, { validate: vi.fn() });

    await expect(
      service.validateVersion('missing', {
        actorSub: 'admin',
        actorUserId: 'user-1',
        requestId: 'request-1',
        occurredAt: new Date(),
      }),
    ).rejects.toMatchObject({
      code: 'CONCEPT_VERSION_NOT_FOUND',
    });
  });
});
