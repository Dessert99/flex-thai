/** 관리자 오류 신고 query의 stable pagination 값을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  DrizzleContentErrorReportQuery,
  toContentErrorReportAdminItem,
  toContentErrorReportPage,
} from './drizzle-content-error-report.query.js';

const createDatabase = (responses: unknown[][]) => {
  const chains: Array<Record<string, ReturnType<typeof vi.fn>>> = [];
  const select = vi.fn(() => {
    const chain: Record<string, ReturnType<typeof vi.fn>> & {
      then?: (resolve: (value: unknown[]) => unknown) => Promise<unknown>;
    } = {};
    for (const method of [
      'from',
      'innerJoin',
      'leftJoin',
      'where',
      'orderBy',
      'limit',
      'offset',
    ]) {
      chain[method] = vi.fn(() => chain);
    }
    chain.then = (resolve) =>
      Promise.resolve(responses.shift() ?? []).then(resolve);
    chains.push(chain);
    return chain;
  });
  return { select, chains };
};

const report = {
  id: 'report-id',
  reporterUserId: 'learner-id',
  targetKind: 'QUESTION' as const,
  category: 'OTHER' as const,
  status: 'OPEN' as const,
  assigneeUserId: 'admin-id',
  description: null,
  canonicalReference: {},
  snapshot: {},
  createdAt: new Date(2),
  updatedAt: new Date(2),
};

describe('오류 신고 관리자 page', () => {
  it('전체 건수로 totalPages를 계산한다', () => {
    expect(toContentErrorReportPage([], 41, 2, 20)).toEqual({
      items: [],
      totalItems: 41,
      page: 2,
      pageSize: 20,
      totalPages: 3,
    });
  });

  it('신고자와 담당자 email을 한 projection에서 보존한다', () => {
    expect(
      toContentErrorReportAdminItem({
        report: {
          id: 'report-id',
          reporterUserId: 'learner-id',
          targetKind: 'QUESTION',
          category: 'OTHER',
          status: 'OPEN',
          assigneeUserId: 'admin-id',
          description: null,
          canonicalReference: {} as never,
          snapshot: {} as never,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
        reporterEmail: 'learner@hufs.ac.kr',
        assigneeEmail: 'admin@hufs.ac.kr',
      }),
    ).toMatchObject({
      reporter: { id: 'learner-id', email: 'learner@hufs.ac.kr' },
      assignee: { id: 'admin-id', email: 'admin@hufs.ac.kr' },
    });
  });

  it('filter와 stable order 및 pagination으로 목록을 조회한다', async () => {
    const database = createDatabase([
      [
        {
          report,
          reporterEmail: 'learner@example.com',
          assigneeEmail: 'admin@example.com',
        },
      ],
      [{ value: 1 }],
    ]);
    const query = new DrizzleContentErrorReportQuery(database as never);
    await expect(
      query.list({
        status: 'OPEN',
        targetKind: 'QUESTION',
        category: 'OTHER',
        assigneeUserId: 'admin-id',
        page: 2,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({ totalItems: 1, items: [{ id: 'report-id' }] });
    expect(database.chains[0]?.where).toHaveBeenCalledOnce();
    expect(database.chains[0]?.orderBy).toHaveBeenCalledOnce();
    expect(database.chains[0]?.limit).toHaveBeenCalledWith(20);
    expect(database.chains[0]?.offset).toHaveBeenCalledWith(20);
  });

  it('상세 history를 시간순으로 hydration한다', async () => {
    const database = createDatabase([
      [
        {
          report,
          reporterEmail: 'learner@example.com',
          assigneeEmail: 'admin@example.com',
        },
      ],
      [
        {
          entry: {
            id: 'history-id',
            action: 'SUBMITTED',
            actorUserId: 'learner-id',
            fromStatus: null,
            toStatus: null,
            fromAssigneeUserId: null,
            toAssigneeUserId: null,
            createdAt: new Date(1),
          },
          actorEmail: 'learner@example.com',
        },
      ],
    ]);
    const query = new DrizzleContentErrorReportQuery(database as never);
    await expect(query.findById('report-id')).resolves.toMatchObject({
      reporter: { email: 'learner@example.com' },
      assignee: { email: 'admin@example.com' },
      history: [
        {
          id: 'history-id',
          actorEmail: 'learner@example.com',
        },
      ],
    });
    expect(database.chains[1]?.orderBy).toHaveBeenCalledOnce();
  });
});
