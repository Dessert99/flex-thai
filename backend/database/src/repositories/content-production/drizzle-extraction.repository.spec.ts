import { describe, expect, it, vi } from 'vitest';
import { DrizzleExtractionRepository } from './drizzle-extraction.repository.js';
import {
  vocabularies,
  vocabularyMeanings,
} from '../../schema/vocabulary.schema.js';

/** SQL 실행 대신 저장 경계의 응답을 제공하는 단위 테스트용 transaction double. */
function setup(selects: unknown[][], inserts: unknown[][] = []) {
  function select() {
    const rows = selects.shift() ?? [];
    const chain = {
      from: () => chain,
      where: () => chain,
      for: () => Promise.resolve(rows),
      orderBy: () => Promise.resolve(rows),
      then: (resolve: (value: unknown[]) => unknown) =>
        Promise.resolve(rows).then(resolve),
    };
    return chain;
  }
  const writes: Array<{ table: unknown; value: unknown }> = [];
  const update = vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
  }));
  const tx = {
    select: vi.fn(select),
    execute: vi.fn().mockResolvedValue([]),
    update,
    insert: vi.fn((table: unknown) => ({
      values: (value: unknown) => {
        writes.push({ table, value });
        const rows = inserts.shift() ?? [];
        const chain = {
          onConflictDoNothing: () => chain,
          returning: () => Promise.resolve(rows),
        };
        return chain;
      },
    })),
  };
  const db = {
    transaction: vi.fn((run: (session: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };
  return {
    repository: new DrizzleExtractionRepository(
      db as unknown as ConstructorParameters<
        typeof DrizzleExtractionRepository
      >[0],
    ),
    tx,
    db,
    writes,
  };
}
const result = {
  thai: 'ขึ้น',
  meaningKo: '오르다',
  partOfSpeech: '동사',
  context: '원문',
  classification: 'NEW_WORD',
  vocabularyId: null,
};
const receipt = {
  savedAt: '2026-09-18T00:00:00.000Z',
  selectedIds: ['0:0'],
  items: [],
};
describe('추출 결과 저장 트랜잭션', () => {
  it('이미 저장한 동일 요청은 단어 삽입이나 최신 시각 변경 없이 같은 기록을 반환한다', async () => {
    const f = setup([[{ status: 'complete', receipt }]]);
    expect(await f.repository.save('job', 'owner', ['0:0'])).toEqual(receipt);
    expect(f.tx.insert).not.toHaveBeenCalled();
    expect(f.tx.update).not.toHaveBeenCalled();
  });
  it('이미 저장한 작업의 다른 선택으로 덮어쓰지 않는다', async () => {
    const f = setup([[{ status: 'complete', receipt }]]);
    await expect(f.repository.save('job', 'owner', [])).rejects.toThrow(
      'EXTRACTION_ALREADY_SAVED',
    );
  });
  it.each([{ rows: [] }, { rows: [{ status: 'running' }] }])(
    '없는 작업 또는 미완료 작업을 저장하지 않는다',
    async ({ rows }) => {
      const f = setup([rows]);
      await expect(f.repository.save('job', 'owner', [])).rejects.toThrow();
      expect(f.tx.insert).not.toHaveBeenCalled();
    },
  );
  it('서버 결과에 없는 식별자를 거부한다', async () => {
    const f = setup([
      [{ status: 'complete' }],
      [{ ordinal: 0 }],
      [{ data: { results: [result] } }],
    ]);
    await expect(f.repository.save('job', 'owner', ['0:9'])).rejects.toThrow(
      'EXTRACTION_SELECTION_INVALID',
    );
    expect(f.tx.insert).not.toHaveBeenCalled();
  });
  it('선택한 뜻만 등록하며 원문을 단어 예문이나 문맥 필드로 복사하지 않는다', async () => {
    const f = setup(
      [
        [{ status: 'complete' }],
        [{ ordinal: 0 }],
        [{ data: { results: [result, { ...result, meaningKo: '제외' }] } }],
        [],
      ],
      [
        [{ id: 'v', thai: 'ขึ้น', status: 'DRAFT' }],
        [{ id: 'm', meaningKo: '오르다' }],
      ],
    );
    const saved = await f.repository.save('job', 'owner', ['0:0']);
    expect(saved.items).toEqual([
      {
        vocabularyId: 'v',
        meaningId: 'm',
        thai: 'ขึ้น',
        meaningKo: '오르다',
        classification: 'NEW_WORD',
      },
    ]);
    expect(f.writes).toEqual([
      {
        table: vocabularies,
        value: {
          thai: 'ขึ้น',
          normalizedThai: 'ขึ้น',
          kind: 'WORD',
          status: 'DRAFT',
        },
      },
      {
        table: vocabularyMeanings,
        value: { vocabularyId: 'v', meaningKo: '오르다', partOfSpeech: '동사' },
      },
    ]);
    expect(f.db.transaction).toHaveBeenCalledOnce();
    expect(f.tx.update).toHaveBeenCalledOnce();
  });
  it('추출 후 다른 작업이 등록한 단어에는 뜻 추가로 저장한다', async () => {
    const f = setup(
      [
        [{ status: 'complete' }],
        [{ ordinal: 0 }],
        [{ data: { results: [result] } }],
        [{ id: 'v', thai: 'ขึ้น', status: 'DRAFT' }],
        [{ meaningKo: '올라타다' }],
      ],
      [[], [{ id: 'm', meaningKo: '오르다' }]],
    );
    expect(
      (await f.repository.save('job', 'owner', ['0:0'])).items[0]
        ?.classification,
    ).toBe('NEW_MEANING');
  });
  it('이미 존재하는 동일 뜻은 다시 삽입하지 않는다', async () => {
    const f = setup(
      [
        [{ status: 'complete' }],
        [{ ordinal: 0 }],
        [{ data: { results: [result] } }],
        [{ id: 'v', thai: 'ขึ้น', status: 'DRAFT' }],
        [{ meaningKo: '오르다' }],
      ],
      [[]],
    );
    expect((await f.repository.save('job', 'owner', ['0:0'])).items).toEqual(
      [],
    );
    expect(f.writes).toHaveLength(1);
  });
  it('저장 도중 실패하면 완료 기록을 쓰지 않고 transaction 오류로 전달한다', async () => {
    const f = setup(
      [
        [{ status: 'complete' }],
        [{ ordinal: 0 }],
        [{ data: { results: [result] } }],
        [],
      ],
      [[{ id: 'v', thai: 'ขึ้น', status: 'DRAFT' }], []],
    );
    await expect(f.repository.save('job', 'owner', ['0:0'])).rejects.toThrow(
      'EXTRACTION_SAVE_FAILED',
    );
    expect(f.tx.update).not.toHaveBeenCalled();
  });
});
