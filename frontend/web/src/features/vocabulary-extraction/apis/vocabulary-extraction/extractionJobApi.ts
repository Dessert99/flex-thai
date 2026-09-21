import {
  extractionJobSchema,
  extractionSaveReceiptSchema,
  extractionLatestSavedSchema,
  extractionJobsSchema,
  extractionResultsSchema,
  type ExtractionCreateInput,
} from '@flex-thia/contracts/vocabulary-extraction/vocabulary-extraction';
import { authenticatedRequest } from '@/shared/apis/auth/authenticatedRequest';
const base = '/admin/vocabulary-extraction/jobs';
export const extractionJobKeys = {
  all: ['vocabulary-extraction-jobs'] as const,
  detail: (id: string) => ['vocabulary-extraction-jobs', id] as const,
};
export const listExtractionJobs = () =>
  authenticatedRequest({
    path: base,
    response: { kind: 'json', schema: extractionJobsSchema },
  });
export const getExtractionJob = (id: string, signal?: AbortSignal) =>
  authenticatedRequest({
    path: `${base}/${id}`,
    ...(signal ? { signal } : {}),
    response: { kind: 'json', schema: extractionJobSchema },
  });
export const createExtractionJob = (body: ExtractionCreateInput) =>
  authenticatedRequest({
    path: base,
    method: 'POST',
    body,
    response: { kind: 'json', schema: extractionJobSchema },
  });
export const retryExtractionJob = (id: string) =>
  authenticatedRequest({
    path: `${base}/${id}/retry`,
    method: 'POST',
    response: { kind: 'json', schema: extractionJobSchema },
  });
export const getExtractionResults = (id: string) =>
  authenticatedRequest({
    path: `${base}/${id}/results`,
    response: { kind: 'json', schema: extractionResultsSchema },
  });
export const saveExtractionResults = (id: string, selectedIds: string[]) =>
  authenticatedRequest({
    path: `${base}/${id}/save`,
    method: 'POST',
    body: { selectedIds },
    response: { kind: 'json', schema: extractionSaveReceiptSchema },
  });
export const getLatestSavedExtraction = () =>
  authenticatedRequest({
    path: `${base}/latest-saved`,
    response: { kind: 'json', schema: extractionLatestSavedSchema },
  });
