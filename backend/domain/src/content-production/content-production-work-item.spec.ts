/** worker 항목이 문자열 해석 없이 정확한 입력 snapshot과 연결되는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { createContentProductionWorkItem } from './content-production-work-item.js';

describe('콘텐츠 제작 work item', () => {
  it('claim 항목과 같은 job input을 구조화된 실행 입력으로 조립한다', () => {
    const workItem = createContentProductionWorkItem(
      {
        id: 'job-id',
        attempt: 2,
        requestedBy: 'admin-id',
        purpose: 'VOCABULARY_EXTRACTION',
        presetSnapshot: {
          id: 'preset-id',
          name: '어휘 추출',
          purpose: 'VOCABULARY_EXTRACTION',
          version: 1,
          parameters: {},
        },
        inputs: [
          {
            jobInputId: 'job-input-id',
            ordinal: 0,
            uploadId: 'upload-id',
            inputType: 'TEXT',
            inputKey: 'private/input.txt',
            sizeBytes: 10,
          },
        ],
      },
      {
        id: 'item-id',
        sourceRef: 'opaque-source',
        jobInputId: 'job-input-id',
        operation: 'VOCABULARY_EXTRACTION',
        status: 'PROCESSING',
        attempt: 2,
        retryable: false,
        errorCode: null,
        leaseUntil: new Date('2026-07-27T00:05:00.000Z'),
        leaseToken: 'lease-token',
      },
    );

    expect(workItem).toMatchObject({
      jobId: 'job-id',
      jobAttempt: 2,
      requestedBy: 'admin-id',
      input: {
        jobInputId: 'job-input-id',
        inputKey: 'private/input.txt',
        ordinal: 0,
      },
      item: {
        operation: 'VOCABULARY_EXTRACTION',
        sourceRef: 'opaque-source',
      },
    });
  });
});
