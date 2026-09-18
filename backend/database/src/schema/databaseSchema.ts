/** Drizzle 클라이언트에 전달할 전체 테이블 설정을 조립한다 */
import * as schema0 from './ai-question-production.schema.js';
import * as schema1 from './ai-vocabulary-production.schema.js';
import * as schema2 from './async-dispatch-outbox.schema.js';
import * as schema3 from './concepts.schema.js';
import * as schema4 from './content-import.schema.js';
import * as schema5 from './feedback.schema.js';
import * as schema6 from './identity.schema.js';
import * as schema7 from './jobs.schema.js';
import * as schema8 from './learning-practice.schema.js';
import * as schema9 from './learning.schema.js';
import * as schema10 from './operations-cost.schema.js';
import * as schema11 from './questions.schema.js';
import * as schema12 from './thai-content.schema.js';
import * as schema13 from './vocabulary.schema.js';

import * as extractionTemplateSchema from './extraction-templates.schema.js';

export const databaseSchema = {
  ...extractionTemplateSchema,
  ...schema0,
  ...schema1,
  ...schema2,
  ...schema3,
  ...schema4,
  ...schema5,
  ...schema6,
  ...schema7,
  ...schema8,
  ...schema9,
  ...schema10,
  ...schema11,
  ...schema12,
  ...schema13,
};
