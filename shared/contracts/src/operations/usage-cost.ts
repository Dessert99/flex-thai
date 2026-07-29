/** AI·TTS 운영 사용량·비용의 안전한 공개 JSON 계약을 정의한다 */
import { z } from 'zod';

const usdDecimalPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u;
const estimatedCostUsdPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/u;

const usdDecimalSchema = z.string().regex(usdDecimalPattern);
const estimatedCostUsdSchema = z.string().regex(estimatedCostUsdPattern);

const toMicroUsd = (value: string): bigint => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(`${whole}${fraction.padEnd(6, '0')}`);
};

const positiveUsdDecimalSchema = usdDecimalSchema.refine(
  (value) => toMicroUsd(value) > 0n,
  'USD 금액은 0보다 커야 합니다.',
);

const timeRangeSchema = z
  .object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  })
  .strict();

const thresholdStatusSchema = z.enum(['NORMAL', 'WARNING', 'CRITICAL']);

/** 정규화된 실행 출처 */
export const usageCostSourceSchema = z.enum(['AI', 'TTS']);

/** AI·TTS provider 실행이 공통으로 보존하는 상태 */
export const usageCostRunStatusSchema = z.enum([
  'STARTED',
  'SUCCEEDED',
  'FAILED',
  'OUTCOME_UNKNOWN',
]);

/** GET /admin/usage-cost의 선택적 UTC filter */
export const usageCostOverviewQuerySchema = z
  .object({
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    source: usageCostSourceSchema.optional(),
    provider: z.string().trim().min(1).max(100).optional(),
    model: z.string().trim().min(1).max(160).optional(),
    voice: z.string().trim().min(1).max(160).optional(),
    status: usageCostRunStatusSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.from !== undefined &&
      value.to !== undefined &&
      Date.parse(value.from) >= Date.parse(value.to)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'from은 to보다 빨라야 합니다.',
        path: ['from'],
      });
    }
    if (value.source === 'AI' && value.voice !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'voice filter는 TTS에서만 사용할 수 있습니다.',
        path: ['voice'],
      });
    }
  });

/** provider/model/voice 단위의 실행·비용 집계 */
export const usageCostBreakdownSchema = z
  .object({
    source: usageCostSourceSchema,
    provider: z.string().min(1),
    model: z.string().min(1),
    voice: z.string().min(1).nullable(),
    runCount: z.number().int().nonnegative(),
    estimatedCostUsd: estimatedCostUsdSchema,
  })
  .strict();

/** 사용량·비용 overview의 공개 projection */
export const usageCostOverviewResponseSchema = z
  .object({
    range: timeRangeSchema,
    estimatedCostUsd: estimatedCostUsdSchema,
    inProgressJobCount: z.number().int().nonnegative(),
    failedRunCount: z.number().int().nonnegative(),
    pendingReviewCandidateCount: z.number().int().nonnegative(),
    breakdown: z.array(usageCostBreakdownSchema),
    currentMonthThreshold: z
      .object({
        range: timeRangeSchema,
        estimatedCostUsd: estimatedCostUsdSchema,
        status: thresholdStatusSchema,
      })
      .strict(),
  })
  .strict();

const operationsCostSettingsShape = {
  currency: z.literal('USD'),
  warningUsd: positiveUsdDecimalSchema,
  criticalUsd: positiveUsdDecimalSchema,
  updatedAt: z.iso.datetime(),
};

/** 비용 경고 singleton의 공개 projection */
export const operationsCostSettingsResponseSchema = z
  .object(operationsCostSettingsShape)
  .strict()
  .superRefine((value, context) => {
    if (toMicroUsd(value.warningUsd) >= toMicroUsd(value.criticalUsd)) {
      context.addIssue({
        code: 'custom',
        message: 'warningUsd는 criticalUsd보다 작아야 합니다.',
        path: ['warningUsd'],
      });
    }
  });

/** 비용 경고 설정의 optimistic·idempotent 변경 요청 */
export const updateOperationsCostSettingsRequestSchema = z
  .object({
    warningUsd: positiveUsdDecimalSchema,
    criticalUsd: positiveUsdDecimalSchema,
  })
  .extend({
    expectedUpdatedAt: z.iso.datetime(),
    requestId: z.uuid(),
  })
  .strict()
  .superRefine((value, context) => {
    if (toMicroUsd(value.warningUsd) >= toMicroUsd(value.criticalUsd)) {
      context.addIssue({
        code: 'custom',
        message: 'warningUsd는 criticalUsd보다 작아야 합니다.',
        path: ['warningUsd'],
      });
    }
  });

/** 사용량·비용 overview filter */
export type UsageCostOverviewQuery = z.infer<
  typeof usageCostOverviewQuerySchema
>;

/** provider/model/voice 비용 breakdown */
export type UsageCostBreakdown = z.infer<typeof usageCostBreakdownSchema>;

/** 사용량·비용 overview 응답 */
export type UsageCostOverviewResponse = z.infer<
  typeof usageCostOverviewResponseSchema
>;

/** 비용 경고 설정 응답 */
export type OperationsCostSettingsResponse = z.infer<
  typeof operationsCostSettingsResponseSchema
>;

/** 비용 경고 설정 변경 요청 */
export type UpdateOperationsCostSettingsRequest = z.infer<
  typeof updateOperationsCostSettingsRequestSchema
>;
