/** upload PENDING 생성과 서버 검증 terminal 전이를 Drizzle로 저장한다 */
import { and, eq, inArray } from 'drizzle-orm';
import type {
  UploadLifecycleRepository,
  UploadRecord,
} from '@flex-thia/domain';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { uploads } from '../schema/index.js';
import * as schema from '../schema/index.js';

type UploadDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type UploadRow = typeof uploads.$inferSelect;

const toUploadRecord = (row: UploadRow): UploadRecord => ({
  id: row.id,
  ownerId: row.ownerId,
  inputType: row.inputType,
  objectKey: row.objectKey,
  declaredContentType: row.declaredContentType,
  sizeBytes: row.sizeBytes,
  status: row.status,
});

/** 클라이언트 size를 받지 않고 S3 검증 결과만 완료 row에 기록한다 */
export class DrizzleUploadRepository implements UploadLifecycleRepository {
  constructor(private readonly database: UploadDatabase) {}

  /** 서버가 만든 id와 object key로 PENDING upload을 생성한다 */
  async createPending(input: {
    id: string;
    ownerId: string;
    inputType: 'TEXT' | 'PDF' | 'IMAGE';
    objectKey: string;
    declaredContentType: string;
  }): Promise<UploadRecord> {
    const [row] = await this.database.insert(uploads).values(input).returning();

    if (!row) {
      throw new Error('Upload 생성 결과가 없습니다');
    }

    return toUploadRecord(row);
  }

  /** 다른 사용자의 object 존재 여부를 숨기며 owner와 id로 함께 조회한다 */
  async findOwnedById(
    ownerId: string,
    uploadId: string,
  ): Promise<UploadRecord | null> {
    const [row] = await this.database
      .select()
      .from(uploads)
      .where(and(eq(uploads.id, uploadId), eq(uploads.ownerId, ownerId)))
      .limit(1);
    return row ? toUploadRecord(row) : null;
  }

  /** PENDING upload에만 S3 실제 size와 검증 완료 시각을 기록한다 */
  async markVerified(
    uploadId: string,
    sizeBytes: number,
    verifiedAt: Date,
  ): Promise<UploadRecord> {
    const [row] = await this.database
      .update(uploads)
      .set({ sizeBytes, status: 'VERIFIED', verifiedAt })
      .where(and(eq(uploads.id, uploadId), eq(uploads.status, 'PENDING')))
      .returning();

    if (!row) {
      throw new Error('PENDING upload을 찾을 수 없습니다');
    }

    return toUploadRecord(row);
  }

  /** 검증 실패한 PENDING upload만 REJECTED terminal로 바꾼다 */
  async markRejected(uploadId: string): Promise<void> {
    await this.database
      .update(uploads)
      .set({ status: 'REJECTED' })
      .where(and(eq(uploads.id, uploadId), eq(uploads.status, 'PENDING')));
  }

  /** 요청 사용자의 VERIFIED upload과 서버가 저장한 실제 size만 반환한다 */
  async findVerifiedOwnedByIds(
    ownerId: string,
    uploadIds: string[],
  ): ReturnType<UploadLifecycleRepository['findVerifiedOwnedByIds']> {
    if (uploadIds.length === 0) {
      return [];
    }

    const rows = await this.database
      .select()
      .from(uploads)
      .where(
        and(
          eq(uploads.ownerId, ownerId),
          eq(uploads.status, 'VERIFIED'),
          inArray(uploads.id, uploadIds),
        ),
      );
    return rows.flatMap((row) =>
      row.sizeBytes === null
        ? []
        : [
            {
              uploadId: row.id,
              inputType: row.inputType,
              inputKey: row.objectKey,
              sizeBytes: row.sizeBytes,
            },
          ],
    );
  }
}
