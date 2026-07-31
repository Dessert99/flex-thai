/** 운영 비용 설정 singleton의 DB 수준 불변식을 검증한다 */
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { operationsCostSettings } from './operations-cost.schema.js';

describe('운영 비용 설정 schema', () => {
  it('singleton ID와 USD 기본값, optimistic replay metadata를 보존한다', () => {
    const columns = getTableColumns(operationsCostSettings);

    expect(columns.id.primary).toBe(true);
    expect(columns.warningUsd.default).toBe('15.000000');
    expect(columns.criticalUsd.default).toBe('24.000000');
    expect(columns.currency.default).toBe('USD');
    expect(columns.updatedAt.notNull).toBe(true);
    expect(columns.updatedBy.notNull).toBe(false);
    expect(columns.lastRequestId.notNull).toBe(false);
    expect(columns.lastRequestFingerprint.notNull).toBe(false);
  });

  it('singleton, USD, 양수 threshold 순서 check을 모두 선언한다', () => {
    const checks = getTableConfig(operationsCostSettings).checks.map(
      ({ name }) => name,
    );

    expect(checks).toEqual(
      expect.arrayContaining([
        'operations_cost_settings_singleton',
        'operations_cost_settings_currency_usd',
        'operations_cost_settings_threshold_order',
      ]),
    );
  });
});
