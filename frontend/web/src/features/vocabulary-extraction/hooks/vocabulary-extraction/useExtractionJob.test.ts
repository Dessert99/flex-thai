import { describe, expect, it } from 'vitest';
import { createProgressPreview } from '@/features/vocabulary-extraction/libs/vocabulary-extraction/extractionProgress';
import { extractionPollInterval } from './useExtractionJob';
import type { ExtractionJobResponse } from '@flex-thia/contracts/vocabulary-extraction/vocabulary-extraction';
const job = (
  status: ExtractionJobResponse['status'],
): ExtractionJobResponse => ({
  ...createProgressPreview('running'),
  id: 'id',
  status,
  prompt: '',
  provider: 'gemini',
  model: 'test',
  compared: 0,
  error: null,
  createdAt: '',
  updatedAt: '',
});
describe('extraction polling cadence', () => {
  it('polls active jobs every three seconds', () => {
    expect(extractionPollInterval(job('queued'))).toBe(3000);
    expect(extractionPollInterval(job('running'))).toBe(3000);
  });
  it.each(['failed', 'stopped', 'complete'] as const)(
    'stops for %s',
    (status) => expect(extractionPollInterval(job(status))).toBe(false),
  );
  it('backs off status fetch failures', () => {
    expect(extractionPollInterval(job('running'), 1)).toBe(5000);
    expect(extractionPollInterval(job('running'), 4)).toBe(30000);
  });
});
