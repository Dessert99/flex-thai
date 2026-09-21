import { randomUUID } from 'node:crypto';
/** 템플릿 본문과 관리자 작업 감사를 같은 transaction에 저장한다 */
import { desc, eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import type {
  ExtractionTemplateActor,
  ExtractionTemplateRepository,
} from '@flex-thia/domain/vocabulary-extraction/extraction-template.repository';
import { databaseSchema } from '../../schema/databaseSchema.js';
import { extractionTemplates } from '../../schema/extraction-templates.schema.js';
import { auditLogs } from '../../schema/identity.schema.js';

type Database = PgDatabase<PgQueryResultHKT, typeof databaseSchema>;
export class DrizzleExtractionTemplateRepository implements ExtractionTemplateRepository {
  constructor(private readonly database: Database) {}
  list() {
    return this.database
      .select()
      .from(extractionTemplates)
      .orderBy(
        desc(extractionTemplates.createdAt),
        desc(extractionTemplates.id),
      );
  }
  create(
    input: { description: string; body: string },
    actor: ExtractionTemplateActor,
  ) {
    return this.database.transaction(async (tx) => {
      const [record] = await tx
        .insert(extractionTemplates)
        .values(input)
        .returning();
      if (!record) throw new Error('EXTRACTION_TEMPLATE_CREATE_FAILED');
      await tx.insert(auditLogs).values({
        requestId: randomUUID(),
        actorUserId: actor.userId,
        actorSub: actor.sub,
        action: 'EXTRACTION_TEMPLATE_CREATED',
        target: `extraction-template:${record.id}`,
        targetId: record.id,
        targetType: 'EXTRACTION_TEMPLATE',
        summary: { description: record.description },
      });
      return record;
    });
  }
  async delete(id: string, actor: ExtractionTemplateActor) {
    await this.database.transaction(async (tx) => {
      const [record] = await tx
        .delete(extractionTemplates)
        .where(eq(extractionTemplates.id, id))
        .returning();
      if (!record) return;
      await tx.insert(auditLogs).values({
        requestId: randomUUID(),
        actorUserId: actor.userId,
        actorSub: actor.sub,
        action: 'EXTRACTION_TEMPLATE_DELETED',
        target: `extraction-template:${id}`,
        targetId: id,
        targetType: 'EXTRACTION_TEMPLATE',
        summary: { description: record.description },
      });
    });
  }
}
