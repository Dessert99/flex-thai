import { z } from 'zod';
export const extractionCreateSchema = z
  .object({
    requestId: z.uuid(),
    sourceName: z.string().trim().min(1).max(200),
    prompt: z.string().trim().min(1).max(20000),
    source: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('pdf'), uploadId: z.uuid() }).strict(),
      z
        .object({
          kind: z.literal('url'),
          url: z
            .url()
            .max(2048)
            .refine((value) => {
              const url = new URL(value);
              return (
                url.protocol === 'https:' &&
                !url.username &&
                !url.password &&
                (!url.port || url.port === '443')
              );
            }),
        })
        .strict(),
    ]),
  })
  .strict();
export const extractionResultSchema = z.object({
  id: z.string(),
  page: z.number().int().positive().nullable(),
  existingMeanings: z.array(z.string()),
  thai: z.string(),
  meaningKo: z.string(),
  partOfSpeech: z.string(),
  context: z.string(),
  classification: z.enum(['NEW_WORD', 'NEW_MEANING']),
  vocabularyId: z.uuid().nullable(),
});
export const extractionJobSchema = z.object({
  id: z.uuid(),
  sourceName: z.string(),
  prompt: z.string(),
  provider: z.string(),
  model: z.string(),
  status: z.enum(['queued', 'running', 'failed', 'stopped', 'complete']),
  stage: z.number().int().min(0).max(4),
  total: z.number().int(),
  completed: z.number().int(),
  compared: z.number().int(),
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const extractionJobsSchema = z.object({
  items: z.array(extractionJobSchema),
});
export const extractionSaveSchema = z
  .object({
    selectedIds: z.array(z.string().regex(/^\d+:\d+$/)).max(20000),
  })
  .strict()
  .refine(
    (value) => new Set(value.selectedIds).size === value.selectedIds.length,
  );
export const extractionSaveReceiptSchema = z.object({
  savedAt: z.iso.datetime(),
  selectedIds: z.array(z.string()),
  items: z.array(
    z.object({
      vocabularyId: z.uuid(),
      meaningId: z.uuid(),
      thai: z.string(),
      meaningKo: z.string(),
      classification: z.enum(['NEW_WORD', 'NEW_MEANING']),
    }),
  ),
});
export const extractionLatestSavedSchema = z
  .object({
    jobId: z.uuid(),
    sourceName: z.string(),
    receipt: extractionSaveReceiptSchema,
  })
  .nullable();
export const extractionResultsSchema = z.object({
  items: z.array(extractionResultSchema),
  excluded: z.number().int(),
  receipt: extractionSaveReceiptSchema.nullable(),
});
export type ExtractionJobResponse = z.infer<typeof extractionJobSchema>;
export type ExtractionCreateInput = z.infer<typeof extractionCreateSchema>;

export type ExtractionReviewItem = z.infer<typeof extractionResultSchema>;
export type ExtractionSaveReceipt = z.infer<typeof extractionSaveReceiptSchema>;
