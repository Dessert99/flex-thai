import * as extractionSchema from './vocabulary-extraction.schema.js';
/** Drizzle 클라이언트에 전달할 전체 테이블 설정을 조립한다 */

import * as schema5 from './feedback.schema.js';
import * as schema6 from './identity.schema.js';
import * as schema7 from './jobs.schema.js';
import * as schema9 from './learning.schema.js';
import * as schema10 from './operations-cost.schema.js';
import * as schema12 from './thai-content.schema.js';
import * as schema13 from './vocabulary.schema.js';

import * as extractionTemplateSchema from './extraction-templates.schema.js';

export const databaseSchema = {
  ...extractionSchema,
  ...extractionTemplateSchema,
  ...schema5,
  ...schema6,
  ...schema7,
  ...schema9,
  ...schema10,
  ...schema12,
  ...schema13,
};
