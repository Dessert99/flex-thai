/** 개인 추천 Zod 응답을 Swagger DTO로 연결한다 */
import { recommendationResponseSchema } from '@flex-thia/contracts';
import { createZodDto } from 'nestjs-zod';

/** 개인 추천 응답 DTO */
export class RecommendationResponseDto extends createZodDto(
  recommendationResponseSchema,
) {}
