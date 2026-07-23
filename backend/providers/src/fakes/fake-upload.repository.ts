/** S3 없이 업로드 소유권과 검증 상태를 재현하는 in-memory adapter */
import type {
  InputType,
  UploadLifecycleRepository,
  UploadRecord,
} from '@flex-thia/domain';

/** fake upload adapter가 보관하는 검증 record */
export interface FakeUploadRecord {
  uploadId: string;
  ownerId: string;
  inputType: InputType;
  inputKey: string;
  sizeBytes: number;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  declaredContentType?: string;
}

/** 요청 사용자에게 속한 VERIFIED upload만 반환하는 fake repository */
export class FakeUploadRepository implements UploadLifecycleRepository {
  constructor(private readonly records: FakeUploadRecord[] = []) {}

  /** local upload policy가 사용할 PENDING record를 만든다 */
  createPending(input: {
    id: string;
    ownerId: string;
    inputType: InputType;
    objectKey: string;
    declaredContentType: string;
  }): Promise<UploadRecord> {
    const record: FakeUploadRecord = {
      uploadId: input.id,
      ownerId: input.ownerId,
      inputType: input.inputType,
      inputKey: input.objectKey,
      sizeBytes: 0,
      status: 'PENDING',
      declaredContentType: input.declaredContentType,
    };
    this.records.push(record);
    return Promise.resolve(this.toUploadRecord(record));
  }

  /** 다른 사용자의 upload 존재 여부를 숨기며 소유한 record만 반환한다 */
  findOwnedById(
    ownerId: string,
    uploadId: string,
  ): Promise<UploadRecord | null> {
    const record = this.records.find(
      (candidate) =>
        candidate.ownerId === ownerId && candidate.uploadId === uploadId,
    );
    return Promise.resolve(record ? this.toUploadRecord(record) : null);
  }

  /** 실제 S3 size를 기록하며 PENDING upload만 VERIFIED로 바꾼다 */
  markVerified(uploadId: string, sizeBytes: number): Promise<UploadRecord> {
    const record = this.records.find(
      (candidate) => candidate.uploadId === uploadId,
    );

    if (!record || record.status !== 'PENDING') {
      return Promise.reject(new Error('PENDING upload을 찾을 수 없습니다'));
    }

    record.status = 'VERIFIED';
    record.sizeBytes = sizeBytes;
    return Promise.resolve(this.toUploadRecord(record));
  }

  /** 검증에 실패한 PENDING upload을 terminal REJECTED로 바꾼다 */
  markRejected(uploadId: string): Promise<void> {
    const record = this.records.find(
      (candidate) => candidate.uploadId === uploadId,
    );

    if (record?.status === 'PENDING') {
      record.status = 'REJECTED';
    }

    return Promise.resolve();
  }

  /** object 존재 여부를 새지 않게 소유권과 검증 상태를 함께 거른다 */
  findVerifiedOwnedByIds(
    ownerId: string,
    uploadIds: string[],
  ): ReturnType<UploadLifecycleRepository['findVerifiedOwnedByIds']> {
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

  private toUploadRecord(record: FakeUploadRecord): UploadRecord {
    return {
      id: record.uploadId,
      ownerId: record.ownerId,
      inputType: record.inputType,
      objectKey: record.inputKey,
      declaredContentType:
        record.declaredContentType ??
        (record.inputType === 'PDF'
          ? 'application/pdf'
          : record.inputType === 'TEXT'
            ? 'text/plain'
            : 'image/jpeg'),
      sizeBytes: record.sizeBytes || null,
      status: record.status,
    };
  }
}
