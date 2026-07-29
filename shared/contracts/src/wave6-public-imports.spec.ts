/** Wave 6 비용 운영 계약이 패키지 공개 진입점에서 사용 가능한지 검증한다 */
import {
  operationsCostSettingsResponseSchema,
  updateOperationsCostSettingsRequestSchema,
  usageCostOverviewQuerySchema,
  usageCostOverviewResponseSchema,
} from '@flex-thia/contracts';
import type * as Contracts from '@flex-thia/contracts';
import { describe, expect, expectTypeOf, it } from 'vitest';

type Wave6ContractBoundary = [
  Contracts.UsageCostOverviewQuery,
  Contracts.UsageCostOverviewResponse,
  Contracts.OperationsCostSettingsResponse,
  Contracts.UpdateOperationsCostSettingsRequest,
];

describe('Wave 6 contracts 공개 import', () => {
  it('패키지 루트가 사용량과 비용 경고 계약을 공개한다', () => {
    expectTypeOf<Wave6ContractBoundary>().toBeArray();
    expect([
      operationsCostSettingsResponseSchema,
      updateOperationsCostSettingsRequestSchema,
      usageCostOverviewQuerySchema,
      usageCostOverviewResponseSchema,
    ]).not.toContain(undefined);
  });
});
