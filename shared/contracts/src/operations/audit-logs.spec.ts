/** 관리자 감사 기록 목록·상세 공개 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  auditLogDetailResponseSchema,
  auditLogIdPathSchema,
  auditLogListQuerySchema,
  auditLogListResponseSchema,
} from './audit-logs.js';

const auditLogId = '00000000-0000-4000-8000-000000000001';
const actorUserId = '00000000-0000-4000-8000-000000000002';

describe('감사 기록 공개 계약', () => {
  it('검색·actor·대상·기간과 페이지 query를 정규화한다', () => {
    expect(
      auditLogListQuerySchema.parse({
        query: '  ROLE ',
        actorUserId,
        action: ' IDENTITY_USER_ROLE_CHANGED ',
        targetType: ' USER ',
        targetId: actorUserId,
        from: '2026-07-26T00:00:00.000Z',
        to: '2026-07-27T00:00:00.000Z',
        page: '2',
        pageSize: '50',
      }),
    ).toEqual({
      query: 'ROLE',
      actorUserId,
      action: 'IDENTITY_USER_ROLE_CHANGED',
      targetType: 'USER',
      targetId: actorUserId,
      from: '2026-07-26T00:00:00.000Z',
      to: '2026-07-27T00:00:00.000Z',
      page: 2,
      pageSize: 50,
    });
    expect(auditLogListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it('역전 기간과 잘못된 UUID·페이지를 거부한다', () => {
    expect(() =>
      auditLogListQuerySchema.parse({
        from: '2026-07-27T00:00:00.000Z',
        to: '2026-07-26T00:00:00.000Z',
      }),
    ).toThrow();
    expect(() =>
      auditLogListQuerySchema.parse({ actorUserId: 'not-uuid' }),
    ).toThrow();
    expect(() => auditLogListQuerySchema.parse({ pageSize: '101' })).toThrow();
    expect(() => auditLogListQuerySchema.parse({ unknown: true })).toThrow();
    expect(auditLogIdPathSchema.parse({ auditLogId })).toEqual({ auditLogId });
  });

  it('목록은 사용자와 시스템 actor 및 nullable legacy 대상을 허용한다', () => {
    const parsed = auditLogListResponseSchema.parse({
      items: [
        {
          id: auditLogId,
          actor: {
            kind: 'USER',
            userId: actorUserId,
            email: 'admin@hufs.ac.kr',
          },
          action: 'IDENTITY_USER_DISABLED',
          target: `users/${actorUserId}`,
          targetType: 'USER',
          targetId: actorUserId,
          createdAt: '2026-07-27T00:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000003',
          actor: { kind: 'SYSTEM', label: 'SYSTEM_BOOTSTRAP' },
          action: 'ROLE_BOOTSTRAPPED',
          target: actorUserId,
          targetType: null,
          targetId: null,
          createdAt: '2026-07-26T00:00:00.000Z',
        },
      ],
      page: {
        page: 1,
        pageSize: 20,
        totalItems: 2,
        totalPages: 1,
      },
    });

    expect(parsed.items[1]?.actor).toEqual({
      kind: 'SYSTEM',
      label: 'SYSTEM_BOOTSTRAP',
    });
    expect(() =>
      auditLogListResponseSchema.parse({
        items: [
          {
            ...parsed.items[0],
            requestId: 'request-1',
            summary: {},
          },
        ],
        page: parsed.page,
      }),
    ).toThrow();
  });

  it('상세만 구조화 summary와 request ID를 포함한다', () => {
    expect(
      auditLogDetailResponseSchema.parse({
        id: auditLogId,
        actor: { kind: 'SYSTEM', label: 'SYSTEM_BOOTSTRAP' },
        action: 'ROLE_BOOTSTRAPPED',
        target: actorUserId,
        targetType: null,
        targetId: null,
        summary: { role: 'ADMIN' },
        requestId: 'request-1',
        createdAt: '2026-07-26T00:00:00.000Z',
      }),
    ).toMatchObject({
      summary: { role: 'ADMIN' },
      requestId: 'request-1',
    });
  });
});
