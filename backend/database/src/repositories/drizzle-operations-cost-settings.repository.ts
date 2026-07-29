/** 비용 경고 singleton을 optimistic update하고 동일 transaction에 감사를 남긴다 */
import { eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import * as schema from '../schema/index.js';
import { auditLogs } from '../schema/identity.schema.js';
import { operationsCostSettings } from '../schema/operations-cost.schema.js';

type OperationsCostSettingsDatabase = PgDatabase<
  PgQueryResultHKT,
  typeof schema
>;
type OperationsCostSettingsTransaction = Parameters<
  Parameters<OperationsCostSettingsDatabase['transaction']>[0]
>[0];

/** 저장된 비용 경고 설정의 공개 가능한 부분 */
export interface OperationsCostSettingsRecord {
  currency: 'USD';
  warningUsd: string;
  criticalUsd: string;
  updatedAt: Date;
}

/** optimistic update와 audit에 필요한 관리자 요청 문맥 */
export interface UpdateOperationsCostSettingsInput {
  warningUsd: string;
  criticalUsd: string;
  expectedUpdatedAt: Date;
  requestId: string;
  requestFingerprint: string;
  actor: { userId: string; sub: string };
  changedAt: Date;
}

/** optimistic update가 저장·replay·conflict 중 무엇으로 끝났는지 구분한다 */
export type UpdateOperationsCostSettingsResult =
  | { kind: 'UPDATED'; settings: OperationsCostSettingsRecord }
  | { kind: 'REPLAY'; settings: OperationsCostSettingsRecord }
  | { kind: 'CONFLICT' };

/** singleton이 migration으로 준비되지 않았을 때 안정적인 오류를 전달한다 */
export class OperationsCostSettingsRepositoryError extends Error {
  constructor(readonly code: 'OPERATIONS_COST_SETTINGS_MISSING') {
    super(code);
    this.name = 'OperationsCostSettingsRepositoryError';
  }
}

type SettingsRow = {
  currency: string;
  warningUsd: string;
  criticalUsd: string;
  updatedAt: Date;
  lastRequestId: string | null;
  lastRequestFingerprint: string | null;
};

const settingSelection = {
  currency: operationsCostSettings.currency,
  warningUsd: operationsCostSettings.warningUsd,
  criticalUsd: operationsCostSettings.criticalUsd,
  updatedAt: operationsCostSettings.updatedAt,
  lastRequestId: operationsCostSettings.lastRequestId,
  lastRequestFingerprint: operationsCostSettings.lastRequestFingerprint,
};

const toRecord = (row: SettingsRow): OperationsCostSettingsRecord => ({
  currency: 'USD',
  warningUsd: row.warningUsd,
  criticalUsd: row.criticalUsd,
  updatedAt: row.updatedAt,
});

const requireSettings = (row: SettingsRow | undefined): SettingsRow => {
  if (!row) {
    throw new OperationsCostSettingsRepositoryError(
      'OPERATIONS_COST_SETTINGS_MISSING',
    );
  }
  return row;
};

const toAuditLog = (
  input: UpdateOperationsCostSettingsInput,
  before: SettingsRow,
  after: OperationsCostSettingsRecord,
) => ({
  actorSub: input.actor.sub,
  actorUserId: input.actor.userId,
  action: 'USAGE_COST_SETTINGS_UPDATED',
  target: 'operations-cost-settings',
  targetType: 'OPERATIONS_COST_SETTINGS',
  targetId: null,
  summary: {
    before: {
      warningUsd: before.warningUsd,
      criticalUsd: before.criticalUsd,
    },
    after: {
      warningUsd: after.warningUsd,
      criticalUsd: after.criticalUsd,
    },
    currency: 'USD',
  },
  requestId: input.requestId,
  createdAt: input.changedAt,
});

/** 비용 경고 설정의 CAS·replay와 append-only audit을 저장한다 */
export class DrizzleOperationsCostSettingsRepository {
  constructor(private readonly database: OperationsCostSettingsDatabase) {}

  /** 현재 singleton 설정을 읽고 migration 누락은 즉시 드러낸다 */
  async find(): Promise<OperationsCostSettingsRecord> {
    const [row] = await this.database
      .select(settingSelection)
      .from(operationsCostSettings)
      .where(eq(operationsCostSettings.id, 1))
      .limit(1);
    return toRecord(requireSettings(row));
  }

  /** request replay·stale conflict·audit append를 같은 row lock 아래에서 처리한다 */
  async update(
    input: UpdateOperationsCostSettingsInput,
  ): Promise<UpdateOperationsCostSettingsResult> {
    return this.database.transaction(async (transaction) => {
      const current = await this.lockSettings(transaction);
      if (current.lastRequestId === input.requestId) {
        return current.lastRequestFingerprint === input.requestFingerprint
          ? { kind: 'REPLAY', settings: toRecord(current) }
          : { kind: 'CONFLICT' };
      }
      if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
        return { kind: 'CONFLICT' };
      }
      const [updated] = await transaction
        .update(operationsCostSettings)
        .set({
          warningUsd: input.warningUsd,
          criticalUsd: input.criticalUsd,
          updatedAt: input.changedAt,
          updatedBy: input.actor.userId,
          lastRequestId: input.requestId,
          lastRequestFingerprint: input.requestFingerprint,
        })
        .where(eq(operationsCostSettings.id, 1))
        .returning(settingSelection);
      const settings = toRecord(requireSettings(updated));
      await transaction
        .insert(auditLogs)
        .values(toAuditLog(input, current, settings));
      return { kind: 'UPDATED', settings };
    });
  }

  private async lockSettings(
    transaction: OperationsCostSettingsTransaction,
  ): Promise<SettingsRow> {
    const [row] = await transaction
      .select(settingSelection)
      .from(operationsCostSettings)
      .where(eq(operationsCostSettings.id, 1))
      .for('update')
      .limit(1);
    return requireSettings(row);
  }
}
