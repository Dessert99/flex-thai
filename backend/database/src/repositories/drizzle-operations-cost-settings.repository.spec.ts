/** 비용 경고 설정의 replay·conflict·audit transaction을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { DrizzleOperationsCostSettingsRepository } from './drizzle-operations-cost-settings.repository.js';

interface SettingsFixture {
  currency: 'USD';
  warningUsd: string;
  criticalUsd: string;
  updatedAt: Date;
  lastRequestId: string | null;
  lastRequestFingerprint: string | null;
}

const current: SettingsFixture = {
  currency: 'USD' as const,
  warningUsd: '15.000000',
  criticalUsd: '24.000000',
  updatedAt: new Date('2026-07-28T00:00:00.000Z'),
  lastRequestId: null,
  lastRequestFingerprint: null,
};

const updateInput = {
  warningUsd: '16.000000',
  criticalUsd: '25.000000',
  expectedUpdatedAt: current.updatedAt,
  requestId: '00000000-0000-4000-8000-000000000001',
  requestFingerprint: 'fingerprint-1',
  actor: {
    userId: '00000000-0000-4000-8000-000000000002',
    sub: 'admin-sub',
  },
  changedAt: new Date('2026-07-28T01:00:00.000Z'),
};

const createDatabase = (locked: SettingsFixture) => {
  const auditValues = vi.fn();
  const transaction = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          for: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([locked]) })),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([
            {
              currency: 'USD',
              warningUsd: updateInput.warningUsd,
              criticalUsd: updateInput.criticalUsd,
              updatedAt: updateInput.changedAt,
              lastRequestId: updateInput.requestId,
              lastRequestFingerprint: updateInput.requestFingerprint,
            },
          ]),
        })),
      })),
    })),
    insert: vi.fn(() => ({ values: auditValues })),
  };
  const runTransaction = <Result>(
    callback: (value: typeof transaction) => Promise<Result>,
  ): Promise<Result> => callback(transaction);
  return {
    auditValues,
    database: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([locked]) })),
        })),
      })),
      transaction: vi.fn(runTransaction),
    },
  };
};

describe('DrizzleOperationsCostSettingsRepository', () => {
  it('row lock 아래에서 settings update와 audit을 함께 저장한다', async () => {
    const fake = createDatabase(current);
    const repository = new DrizzleOperationsCostSettingsRepository(
      fake.database as never,
    );

    await expect(repository.update(updateInput)).resolves.toMatchObject({
      kind: 'UPDATED',
      settings: {
        warningUsd: '16.000000',
        criticalUsd: '25.000000',
      },
    });
    expect(fake.database.transaction).toHaveBeenCalledOnce();
    expect(fake.auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'USAGE_COST_SETTINGS_UPDATED',
        target: 'operations-cost-settings',
        targetType: 'OPERATIONS_COST_SETTINGS',
        targetId: null,
        requestId: updateInput.requestId,
      }),
    );
  });

  it('동일한 최신 requestId와 fingerprint는 audit 없이 replay를 반환한다', async () => {
    const fake = createDatabase({
      ...current,
      lastRequestId: updateInput.requestId,
      lastRequestFingerprint: updateInput.requestFingerprint,
    });
    const repository = new DrizzleOperationsCostSettingsRepository(
      fake.database as never,
    );

    await expect(repository.update(updateInput)).resolves.toMatchObject({
      kind: 'REPLAY',
    });
    expect(fake.auditValues).not.toHaveBeenCalled();
  });

  it('stale update와 다른 payload의 requestId 재사용은 conflict를 반환한다', async () => {
    const stale = createDatabase({
      ...current,
      updatedAt: new Date('2026-07-28T02:00:00.000Z'),
    });
    const staleRepository = new DrizzleOperationsCostSettingsRepository(
      stale.database as never,
    );
    const reused = createDatabase({
      ...current,
      lastRequestId: updateInput.requestId,
      lastRequestFingerprint: 'other-fingerprint',
    });
    const reusedRepository = new DrizzleOperationsCostSettingsRepository(
      reused.database as never,
    );

    await expect(staleRepository.update(updateInput)).resolves.toEqual({
      kind: 'CONFLICT',
    });
    await expect(reusedRepository.update(updateInput)).resolves.toEqual({
      kind: 'CONFLICT',
    });
    expect(stale.auditValues).not.toHaveBeenCalled();
    expect(reused.auditValues).not.toHaveBeenCalled();
  });
});
