/** 최초 관리자 지정이 이메일이나 +tag를 입력으로 받지 않게 고정한다 */
import { describe, expect, it } from 'vitest';
import { parseBootstrapAdminArgs } from './bootstrap-admin.js';

describe('parseBootstrapAdminArgs', () => {
  it('정확한 Cognito sub 하나만 허용한다', () => {
    expect(parseBootstrapAdminArgs(['--sub=cognito-sub-value'])).toEqual({
      subject: 'cognito-sub-value',
    });
    expect(() =>
      parseBootstrapAdminArgs(['--email=admin+tag@school.ac.kr']),
    ).toThrow('bootstrap-admin은 --sub 하나만 받습니다');
  });
});
