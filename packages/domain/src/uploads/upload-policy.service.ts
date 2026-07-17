/** private S3 upload 정책과 서버측 완료 검증을 조율한다 */
import type { InputType } from '../jobs/job.js';
import type {
  UploadLifecycleRepository,
  UploadRecord,
} from './upload.repository.js';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_PDF_PAGES = 30;

const CONTENT_TYPES: Record<InputType, readonly string[]> = {
  TEXT: ['text/plain'],
  PDF: ['application/pdf'],
  IMAGE: ['image/jpeg', 'image/png', 'image/webp'],
};

/** 브라우저가 private S3에 직접 업로드할 짧은 POST policy */
export interface UploadPolicy {
  uploadId: string;
  url: string;
  fields: Record<string, string>;
  expiresAt: string;
}

/** S3가 서버에 반환하는 실제 metadata와 파일 내용 검사 결과 */
export interface UploadInspection {
  sizeBytes: number;
  contentType: string;
  detectedType: InputType | 'UNKNOWN';
  encryptedPdf: boolean;
  pdfPageCount: number | null;
}

/** presigned POST와 object 재검사를 제공하는 storage port */
export interface UploadStorage {
  createPolicy(input: {
    uploadId: string;
    objectKey: string;
    contentType: string;
  }): Promise<UploadPolicy>;
  inspectObject(objectKey: string): Promise<UploadInspection>;
}

/** 업로드 정책과 완료 검사에서 사용하는 안정적인 오류 code */
export class UploadPolicyError extends Error {
  constructor(
    readonly code:
      | 'UPLOAD_TOO_LARGE'
      | 'UPLOAD_EMPTY'
      | 'UPLOAD_CONTENT_TYPE_NOT_ALLOWED'
      | 'UPLOAD_NOT_FOUND'
      | 'UPLOAD_SIGNATURE_MISMATCH'
      | 'ENCRYPTED_PDF_NOT_ALLOWED'
      | 'PDF_PAGE_LIMIT_EXCEEDED',
  ) {
    super(code);
    this.name = 'UploadPolicyError';
  }
}

/** 클라이언트 선언과 S3 실제 object를 분리해 검증하는 upload use case */
export class UploadPolicyService {
  constructor(
    private readonly repository: UploadLifecycleRepository,
    private readonly storage: UploadStorage,
    private readonly generateUploadId: () => string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 허용 크기·MIME을 확인한 뒤 서버가 정한 private object key만 서명한다 */
  async createPolicy(input: {
    ownerId: string;
    inputType: InputType;
    contentType: string;
    declaredSizeBytes: number;
  }): Promise<UploadPolicy> {
    if (input.declaredSizeBytes < 1) {
      throw new UploadPolicyError('UPLOAD_EMPTY');
    }

    if (input.declaredSizeBytes > MAX_FILE_SIZE_BYTES) {
      throw new UploadPolicyError('UPLOAD_TOO_LARGE');
    }

    if (!CONTENT_TYPES[input.inputType].includes(input.contentType)) {
      throw new UploadPolicyError('UPLOAD_CONTENT_TYPE_NOT_ALLOWED');
    }

    const uploadId = this.generateUploadId();
    const objectKey = `inputs/${input.ownerId}/${uploadId}`;
    await this.repository.createPending({
      id: uploadId,
      ownerId: input.ownerId,
      inputType: input.inputType,
      objectKey,
      declaredContentType: input.contentType,
    });
    return this.storage.createPolicy({
      uploadId,
      objectKey,
      contentType: input.contentType,
    });
  }

  /** S3 실제 크기·MIME·signature·PDF 정책이 모두 맞을 때만 VERIFIED로 바꾼다 */
  async complete(ownerId: string, uploadId: string): Promise<UploadRecord> {
    const upload = await this.repository.findOwnedById(ownerId, uploadId);

    if (!upload || upload.status !== 'PENDING') {
      throw new UploadPolicyError('UPLOAD_NOT_FOUND');
    }

    const inspection = await this.storage.inspectObject(upload.objectKey);
    const validationError = this.validateInspection(upload, inspection);

    if (validationError) {
      await this.repository.markRejected(upload.id);
      throw new UploadPolicyError(validationError);
    }

    return this.repository.markVerified(
      upload.id,
      inspection.sizeBytes,
      this.now(),
    );
  }

  private validateInspection(
    upload: UploadRecord,
    inspection: UploadInspection,
  ): UploadPolicyError['code'] | null {
    if (inspection.sizeBytes < 1) {
      return 'UPLOAD_EMPTY';
    }

    if (inspection.sizeBytes > MAX_FILE_SIZE_BYTES) {
      return 'UPLOAD_TOO_LARGE';
    }

    if (
      inspection.contentType !== upload.declaredContentType ||
      inspection.detectedType !== upload.inputType
    ) {
      return 'UPLOAD_SIGNATURE_MISMATCH';
    }

    if (upload.inputType === 'PDF' && inspection.encryptedPdf) {
      return 'ENCRYPTED_PDF_NOT_ALLOWED';
    }

    if (
      upload.inputType === 'PDF' &&
      (inspection.pdfPageCount === null ||
        inspection.pdfPageCount > MAX_PDF_PAGES)
    ) {
      return 'PDF_PAGE_LIMIT_EXCEEDED';
    }

    return null;
  }
}
