/** FLEX 고정 문제 대분류의 공용 schema와 type을 정의한다 */
import { z } from 'zod';

/** FLEX 읽기 영역의 네 가지 문제 분류 */
export const questionMajorCategorySchema = z.enum([
  'READING_VOCABULARY_GRAMMAR',
  'READING_SYNONYM_RELATION',
  'READING_ERROR_IDENTIFICATION',
  'READING_PASSAGE',
]);

/** FLEX 시험의 고정 문제 대분류 type */
export type QuestionMajorCategory = z.infer<typeof questionMajorCategorySchema>;
