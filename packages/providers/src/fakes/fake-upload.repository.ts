/** S3 없이 업로드 소유권과 검증 상태를 재현하는 in-memory adapter */
import type { InputType, UploadRepository } from '@flex-thia/domain';

/** fake upload adapter가 보관하는 검증 record */
export interface FakeUploadRecord {
  uploadId: string;
  ownerId: string;
  inputType: InputType;
  inputKey: string;
  sizeBytes: number;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
}

/** 요청 사용자에게 속한 VERIFIED upload만 반환하는 fake repository */
export class FakeUploadRepository implements UploadRepository {
  constructor(private readonly records: FakeUploadRecord[] = []) {}

  /** object 존재 여부를 새지 않게 소유권과 검증 상태를 함께 거른다 */
  findVerifiedOwnedByIds(
    ownerId: string,
    uploadIds: string[],
  ): ReturnType<UploadRepository['findVerifiedOwnedByIds']> {
    const requestedIds = new Set(uploadIds);

    return Promise.resolve(
      this.records
        .filter(
          (record) =>
            record.ownerId === ownerId &&
            record.status === 'VERIFIED' &&
            requestedIds.has(record.uploadId),
        )
        .map(({ uploadId, inputType, inputKey, sizeBytes }) => ({
          uploadId,
          inputType,
          inputKey,
          sizeBytes,
        })),
    );
  }
}
