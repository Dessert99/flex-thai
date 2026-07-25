/** 문제 버전 JSON을 공개 canonical payload 계약으로 한 번만 해석한다 */
import {
  adminQuestionVersionPayloadSchema,
  type AdminQuestionVersionPayload,
} from '@flex-thia/contracts';

/** canonical 문제 버전 JSON 해석의 성공 또는 안전한 첫 오류 */
export type ParseQuestionVersionPayloadResult =
  | { ok: true; payload: AdminQuestionVersionPayload }
  | { ok: false; message: string; path?: string };

/** JSON syntax와 Zod field path를 원문 로깅 없이 form 결과로 바꾼다 */
export function parseQuestionVersionPayload(
  payloadJson: string,
): ParseQuestionVersionPayloadResult {
  let json: unknown;
  try {
    json = JSON.parse(payloadJson);
  } catch {
    return { ok: false, message: 'JSON 구문을 확인해 주세요.' };
  }

  const parsed = adminQuestionVersionPayloadSchema.safeParse(json);
  if (parsed.success) {
    return { ok: true, payload: parsed.data };
  }
  const issue = parsed.error.issues[0];
  const path = issue?.path.join('.');
  return {
    ok: false,
    message: issue?.message ?? 'canonical JSON 계약을 확인해 주세요.',
    ...(path ? { path } : {}),
  };
}
