import { describe, expect, it } from 'vitest';
import { parseVocabularyCandidateSearch } from './vocabularyCandidateSearch';

describe('어휘 후보 검색 상태', () => {
  it('status·job·page를 strict query 기본값과 함께 정규화한다', () => {
    expect(
      parseVocabularyCandidateSearch({
        jobId: '00000000-0000-4000-8000-000000000001',
        reviewStatus: 'APPROVED',
        page: '2',
        pageSize: '50',
      }),
    ).toEqual({
      jobId: '00000000-0000-4000-8000-000000000001',
      reviewStatus: 'APPROVED',
      page: 2,
      pageSize: 50,
    });
    expect(parseVocabularyCandidateSearch({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });
});
