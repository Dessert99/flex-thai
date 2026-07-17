/** 검증된 업로드만 Job 입력이 되게 영속 경계를 정의한다 */
import type { InputType } from '../jobs/job.js';

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
