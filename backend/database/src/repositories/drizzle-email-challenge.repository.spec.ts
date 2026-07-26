/** 이메일 challenge repository의 제한과 소비 경쟁을 검증한다 */
import { describe, expect, it } from 'vitest';
import { DrizzleEmailChallengeRepository } from './drizzle-email-challenge.repository.js';

const now = new Date('2026-07-26T00:00:00.000Z');
const challengeId = '00000000-0000-4000-8000-000000000001';

interface TestRow {
  id: string;
  email: string;
  purpose: 'LOGIN';
  codeHmac: string;
  linkHmac: string;
  attempts: number;
  status: 'PENDING' | 'RESERVED' | 'SUCCEEDED' | 'EXPIRED';
  expiresAt: Date;
  resendAt: Date;
  reservedAt: Date | null;
  consumedAt: Date | null;
  deliveryStatus: string;
  createdAt: Date;
}

const makeRow = (): TestRow => ({
  id: challengeId,
  email: 'user@hufs.ac.kr',
  purpose: 'LOGIN',
  codeHmac: 'code:123456',
  linkHmac: `link:${'A'.repeat(43)}`,
  attempts: 0,
  status: 'PENDING',
  expiresAt: new Date('2026-07-26T00:10:00.000Z'),
  resendAt: new Date('2026-07-26T00:01:00.000Z'),
  reservedAt: null,
  consumedAt: null,
  deliveryStatus: 'SENT',
  createdAt: now,
});

const makeDatabase = (counts: number[] = [], initialRow = makeRow()) => {
  let row = initialRow;
  let countIndex = 0;
  let transactionTail = Promise.resolve();
  const insertedValues: Array<Partial<TestRow>> = [];
  const updatedValues: Array<Partial<TestRow>> = [];

  const transactionApi = {
    execute: () => Promise.resolve(undefined),
    select: (selection?: unknown) => ({
      from: () => ({
        where: () => {
          if (selection) {
            const value = counts[countIndex] ?? 0;
            countIndex += 1;
            return Promise.resolve([{ value }]);
          }
          return {
            limit: () => Promise.resolve([row]),
          };
        },
      }),
    }),
    insert: () => ({
      values: (values: Partial<TestRow>) => ({
        returning: () => {
          insertedValues.push(values);
          row = { ...makeRow(), ...values };
          return Promise.resolve([row]);
        },
      }),
    }),
    update: () => ({
      set: (values: Partial<TestRow>) => ({
        where: () => ({
          returning: () => {
            updatedValues.push(values);
            row = { ...row, ...values };
            return Promise.resolve([row]);
          },
        }),
      }),
    }),
  };

  return {
    database: {
      transaction: async <T>(
        operation: (transaction: typeof transactionApi) => Promise<T>,
      ): Promise<T> => {
        const previous = transactionTail;
        let release: () => void = () => undefined;
        transactionTail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          return await operation(transactionApi);
        } finally {
          release();
        }
      },
      update: transactionApi.update,
    },
    getRow: () => row,
    insertedValues,
    updatedValues,
  };
};

const verifier = {
  hashAnswer: (answer: string) => answer,
  verifyAnswer: (answer: string, stored: string) =>
    stored.endsWith(`:${answer}`),
};

const createInput = {
  email: 'user@hufs.ac.kr',
  codeHmac: 'code:123456',
  linkHmac: `link:${'A'.repeat(43)}`,
  expiresAt: new Date('2026-07-26T00:10:00.000Z'),
  resendAt: new Date('2026-07-26T00:01:00.000Z'),
  now,
  limits: {
    emailDaily: 5 as const,
    globalDaily: 500 as const,
    maxAttempts: 5 as const,
  },
};

describe('DrizzleEmailChallengeRepository', () => {
  it('동시 code와 link 성공 중 하나만 소비를 예약한다', async () => {
    const { database } = makeDatabase();
    const repository = new DrizzleEmailChallengeRepository(
      database as never,
      verifier,
    );

    const outcomes = await Promise.allSettled([
      repository.reserveConsumption({
        challengeId,
        answer: { kind: 'CODE', answer: '123456' },
        now,
      }),
      repository.reserveConsumption({
        challengeId,
        answer: { kind: 'LINK', answer: 'A'.repeat(43) },
        now,
      }),
    ]);

    expect(
      outcomes.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
  });

  it('FAILED delivery는 challenge와 함께 terminal 상태가 되어 소비할 수 없다', async () => {
    const { database, getRow } = makeDatabase();
    const repository = new DrizzleEmailChallengeRepository(
      database as never,
      verifier,
    );

    await repository.markDelivery(challengeId, 'FAILED');

    expect(getRow()).toMatchObject({
      deliveryStatus: 'FAILED',
      status: 'EXPIRED',
    });
    await expect(
      repository.reserveConsumption({
        challengeId,
        answer: { kind: 'CODE', answer: '123456' },
        now,
      }),
    ).rejects.toMatchObject({ code: 'CHALLENGE_EXPIRED' });
  });

  it('만료된 RESERVED는 IN_PROGRESS보다 먼저 EXPIRED로 종료한다', async () => {
    const row = makeRow();
    row.status = 'RESERVED';
    row.reservedAt = new Date('2026-07-25T23:59:00.000Z');
    row.expiresAt = now;
    const { database, getRow } = makeDatabase([], row);
    const repository = new DrizzleEmailChallengeRepository(
      database as never,
      verifier,
    );

    await expect(
      repository.reserveConsumption({
        challengeId,
        answer: { kind: 'CODE', answer: '123456' },
        now,
      }),
    ).rejects.toMatchObject({ code: 'CHALLENGE_EXPIRED' });
    expect(getRow()).toMatchObject({ status: 'EXPIRED' });
  });

  it('lease가 지난 RESERVED를 회수해 새 reservedAt으로 다시 예약한다', async () => {
    const row = makeRow();
    row.status = 'RESERVED';
    row.reservedAt = new Date('2026-07-25T23:58:59.999Z');
    const retryAt = new Date('2026-07-26T00:00:00.000Z');
    const { database, getRow } = makeDatabase([], row);
    const repository = new DrizzleEmailChallengeRepository(
      database as never,
      verifier,
    );

    await expect(
      repository.reserveConsumption({
        challengeId,
        answer: { kind: 'CODE', answer: '123456' },
        now: retryAt,
      }),
    ).resolves.toMatchObject({ status: 'RESERVED', reservedAt: retryAt });
    expect(getRow()).toMatchObject({ status: 'RESERVED', reservedAt: retryAt });
  });

  it('lease 안의 RESERVED는 계속 IN_PROGRESS로 거부한다', async () => {
    const row = makeRow();
    row.status = 'RESERVED';
    row.reservedAt = new Date('2026-07-25T23:59:30.001Z');
    const { database } = makeDatabase([], row);
    const repository = new DrizzleEmailChallengeRepository(
      database as never,
      verifier,
    );

    await expect(
      repository.reserveConsumption({
        challengeId,
        answer: { kind: 'CODE', answer: '123456' },
        now,
      }),
    ).rejects.toMatchObject({ code: 'CHALLENGE_IN_PROGRESS' });
  });

  it.each([
    [[1], 'CHALLENGE_RESEND_COOLDOWN'],
    [[0, 5], 'EMAIL_DAILY_LIMIT_EXCEEDED'],
    [[0, 4, 500], 'GLOBAL_DAILY_LIMIT_EXCEEDED'],
  ] as const)(
    'cooldown·이메일·전체 일일 상한 경계에서 생성을 거부한다',
    async (counts, code) => {
      const { database } = makeDatabase([...counts]);
      const repository = new DrizzleEmailChallengeRepository(
        database as never,
        verifier,
      );

      await expect(
        repository.createWithinLimits(createInput),
      ).rejects.toMatchObject({ code });
    },
  );

  it('다섯 번째 오답은 challenge를 만료시킨다', async () => {
    const row = makeRow();
    row.attempts = 4;
    const { database, getRow } = makeDatabase([], row);
    const repository = new DrizzleEmailChallengeRepository(
      database as never,
      verifier,
    );

    await expect(
      repository.reserveConsumption({
        challengeId,
        answer: { kind: 'CODE', answer: '000000' },
        now,
      }),
    ).rejects.toMatchObject({ code: 'CHALLENGE_ATTEMPTS_EXCEEDED' });
    expect(getRow()).toMatchObject({ attempts: 5, status: 'EXPIRED' });
  });

  it('재전송은 기존 PENDING을 만료시키고 같은 transaction에서 새 행을 만든다', async () => {
    const resendNow = new Date('2026-07-26T00:01:00.000Z');
    const { database, insertedValues, updatedValues } = makeDatabase([1, 1]);
    const repository = new DrizzleEmailChallengeRepository(
      database as never,
      verifier,
    );

    await repository.replaceForResend({
      ...createInput,
      challengeId,
      now: resendNow,
      expiresAt: new Date('2026-07-26T00:11:00.000Z'),
      resendAt: new Date('2026-07-26T00:02:00.000Z'),
    });

    expect(updatedValues).toContainEqual({ status: 'EXPIRED' });
    expect(insertedValues).toContainEqual(
      expect.objectContaining({
        email: 'user@hufs.ac.kr',
        codeHmac: 'code:123456',
        status: 'PENDING',
      }),
    );
  });

  it('새 challenge가 이미 예약됐으면 이전 challenge를 복구하지 않는다', async () => {
    let updateCount = 0;
    const transaction = {
      execute: () => Promise.resolve(undefined),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => {
              updateCount += 1;
              return Promise.resolve([]);
            },
          }),
        }),
      }),
    };
    const repository = new DrizzleEmailChallengeRepository(
      {
        transaction: (operation: (value: typeof transaction) => unknown) =>
          Promise.resolve(operation(transaction)),
      } as never,
      verifier,
    );

    await repository.restoreReplacedChallenge({
      previousChallengeId: challengeId,
      replacementChallengeId: '00000000-0000-4000-8000-000000000002',
    });

    expect(updateCount).toBe(1);
  });
});
