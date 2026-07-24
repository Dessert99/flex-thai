/** 공통 관리자 command와 오류 응답이 하나의 request id를 공유하는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { DomainExceptionFilter } from '../errors/domain-exception.filter.js';
import {
  resolveAdminRequestId,
  type AdminRequestIdRequest,
} from './admin-request-id.js';

describe('공통 관리자 request id 문맥', () => {
  it('header가 없으면 한 번 생성해 요청 객체와 filter 응답이 공유한다', () => {
    const request: AdminRequestIdRequest = { headers: {} };
    const requestId = resolveAdminRequestId(request);
    request.headers = { 'x-request-id': 'later-header-must-not-win' };
    const type = vi.fn().mockReturnThis();
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const filter = new DomainExceptionFilter({ error: vi.fn() } as never);

    filter.catch(new Error('private'), {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ type, status, json }),
      }),
    } as never);

    expect(resolveAdminRequestId(request)).toBe(requestId);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ requestId }));
  });

  it('제공된 header는 trim한 뒤 요청 객체에 같은 값으로 저장한다', () => {
    const request = { headers: { 'x-request-id': '  request-provided  ' } };

    expect(resolveAdminRequestId(request)).toBe('request-provided');
    expect(resolveAdminRequestId(request)).toBe('request-provided');
  });
});
