/** 검증된 업로드만 Job 입력이 되게 영속 경계를 정의한다 */
import type { InputType } from '../jobs/job.js';

/** 업로드 정책과 S3 실제 object 검증을 연결하는 record */
export interface UploadRecord {
  id: string;
  ownerId: string;
  inputType: InputType;
  objectKey: string;
  declaredContentType: string;
  sizeBytes: number | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
}

/** Job 생성 전에 소유권과 S3 검증 상태를 확인하는 upload port */
export interface UploadRepository {
  findVerifiedOwnedByIds(
    ownerId: string,
    uploadIds: string[],
  ): Promise<
    Array<{
      uploadId: string;
      inputType: InputType;
      inputKey: string;
      sizeBytes: number;
    }>
  >;
}

/** PENDING 생성과 조건부 완료 전이를 추가한 upload lifecycle port */
export interface UploadLifecycleRepository extends UploadRepository {
  createPending(input: {
    id: string;
    ownerId: string;
    inputType: InputType;
    objectKey: string;
    declaredContentType: string;
  }): Promise<UploadRecord>;
  findOwnedById(
    ownerId: string,
    uploadId: string,
  ): Promise<UploadRecord | null>;
  markVerified(
    uploadId: string,
    sizeBytes: number,
    verifiedAt: Date,
  ): Promise<UploadRecord>;
  markRejected(uploadId: string): Promise<void>;
}
