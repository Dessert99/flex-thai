/** Drizzle 클라이언트에 전달할 전체 테이블 설정을 조립한다 */

import * as schema6 from './identity.schema.js';
import * as schema9 from './learning.schema.js';
import * as schema13 from './vocabulary.schema.js';

export const databaseSchema = {
  ...schema6,
  ...schema9,
  ...schema13,
};
