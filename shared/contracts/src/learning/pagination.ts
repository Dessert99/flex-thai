import { z } from 'zod';
/** 목록 화면들이 공유하는 페이지 정보. */
export const pageMetadataSchema = z
  .object({
    page: z.number().int().safe().positive(),
    pageSize: z.number().int().safe().min(1).max(100),
    totalItems: z.number().int().safe().nonnegative(),
    totalPages: z.number().int().safe().nonnegative(),
  })
  .strict();
export type PageMetadata = z.infer<typeof pageMetadataSchema>;
