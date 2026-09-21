/** 단어 추출 입력을 policy·presigned form·완료 검증 순서로 업로드한다 */
import {
  completedUploadResponseSchema,
  uploadPolicyResponseSchema,
} from '@flex-thia/contracts/vocabulary-extraction/uploads';
import { authenticatedRequest } from '@/shared/apis/auth/authenticatedRequest';

const inputTypeFor = (file: File): 'TEXT' | 'PDF' | 'IMAGE' => {
  if (file.type === 'text/plain') return 'TEXT';
  if (file.type === 'application/pdf') return 'PDF';
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    return 'IMAGE';
  throw new Error('EXTRACTION_INPUT_TYPE_UNSUPPORTED');
};

/** verified 단어 추출 입력의 공개 식별자 */
export type UploadedExtractionInput = {
  uploadId: string;
  inputType: 'TEXT' | 'PDF' | 'IMAGE';
  sizeBytes: number;
  status: 'VERIFIED';
};

/** presigned form을 인증 header 없이 60초 제한으로 전송한다 */
export async function uploadExtractionInput(
  file: File,
  signal: AbortSignal,
): Promise<UploadedExtractionInput> {
  signal.throwIfAborted();
  const inputType = inputTypeFor(file);
  const policy = await authenticatedRequest({
    body: {
      inputType,
      contentType: file.type,
      declaredSizeBytes: file.size,
    },
    method: 'POST',
    path: '/admin/vocabulary-extraction/uploads/policies',
    response: { kind: 'json', schema: uploadPolicyResponseSchema },
    signal,
  });
  const form = new FormData();
  Object.entries(policy.fields).forEach(([key, value]) =>
    form.append(key, value),
  );
  form.append('file', file);
  const timeout = new AbortController();
  const timeoutId = globalThis.setTimeout(() => timeout.abort(), 60_000);
  try {
    const response = await fetch(policy.url, {
      body: form,
      method: 'POST',
      signal: AbortSignal.any([signal, timeout.signal]),
    });
    if (!response.ok) throw new Error('EXTRACTION_UPLOAD_FAILED');
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
  return authenticatedRequest({
    method: 'POST',
    path: `/admin/vocabulary-extraction/uploads/${policy.uploadId}/complete`,
    response: { kind: 'json', schema: completedUploadResponseSchema },
    signal,
  });
}
