/** 관리자 사용자 상태·audit·beta 안내 추적 use case를 검증한다 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdentityUserManagementRepository } from './user.repository.js';
import {
  UserManagementError,
  UserManagementService,
  type BetaInvitationRepository,
} from './user-management.js';

const now = new Date('2026-07-26T00:00:00.000Z');
const actor = {
  actorUserId: '00000000-0000-4000-8000-000000000001',
  actorSub: 'admin-sub',
  requestId: 'request-1',
  role: 'ADMIN',
} as const;
const target = {
  id: '00000000-0000-4000-8000-000000000002',
  cognitoSub: 'learner-sub',
  email: 'learner@hufs.ac.kr',
  role: 'LEARNER',
  status: 'DISABLED',
  mfaEnrolledAt: null,
  createdAt: now,
  updatedAt: now,
} as const;

const users = {
  listManagedUsers:
    vi.fn<IdentityUserManagementRepository['listManagedUsers']>(),
  changeStatusWithAudit:
    vi.fn<IdentityUserManagementRepository['changeStatusWithAudit']>(),
};
const invitations = {
  recordInvitation: vi.fn<BetaInvitationRepository['recordInvitation']>(),
};

beforeEach(() => {
  users.listManagedUsers.mockReset();
  users.changeStatusWithAudit.mockReset();
  invitations.recordInvitation.mockReset();
});

describe('UserManagementService', () => {
  it('ADMIN이 사용자를 DISABLED로 바꾸고 audit을 남긴다', async () => {
    users.changeStatusWithAudit.mockResolvedValue(target);
    const service = new UserManagementService(users, invitations);

    await expect(
      service.changeStatus(actor, target.id, 'DISABLED', now),
    ).resolves.toEqual(target);

    expect(users.changeStatusWithAudit).toHaveBeenCalledWith({
      action: 'IDENTITY_USER_DISABLED',
      actorSub: actor.actorSub,
      actorUserId: actor.actorUserId,
      occurredAt: now,
      requestId: actor.requestId,
      status: 'DISABLED',
      userId: target.id,
    });
  });

  it('LEARNER는 목록·상태 변경·beta 안내 추적을 사용할 수 없다', async () => {
    const service = new UserManagementService(users, invitations);
    const learner = { ...actor, role: 'LEARNER' as const };

    await expect(service.listUsers(learner)).rejects.toEqual(
      new UserManagementError('ADMIN_REQUIRED'),
    );
    await expect(
      service.changeStatus(learner, target.id, 'ACTIVE', now),
    ).rejects.toEqual(new UserManagementError('ADMIN_REQUIRED'));
    await expect(
      service.recordBetaInvitation(learner, 'new@hufs.ac.kr', now),
    ).rejects.toEqual(new UserManagementError('ADMIN_REQUIRED'));
    expect(users.listManagedUsers).not.toHaveBeenCalled();
    expect(users.changeStatusWithAudit).not.toHaveBeenCalled();
    expect(invitations.recordInvitation).not.toHaveBeenCalled();
  });

  it('beta 안내는 정규화한 이메일의 발송 기록만 저장한다', async () => {
    invitations.recordInvitation.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000003',
      email: 'new@hufs.ac.kr',
      invitedByUserId: actor.actorUserId,
      sentAt: now,
    });
    const service = new UserManagementService(users, invitations);

    await service.recordBetaInvitation(actor, ' New@HUFS.ac.kr ', now);

    expect(invitations.recordInvitation).toHaveBeenCalledWith({
      actorSub: actor.actorSub,
      email: 'new@hufs.ac.kr',
      invitedByUserId: actor.actorUserId,
      requestId: actor.requestId,
      sentAt: now,
    });
  });

  it('형식이 깨진 학교 이메일은 발송 기록으로 저장하지 않는다', async () => {
    const service = new UserManagementService(users, invitations);

    await expect(
      service.recordBetaInvitation(actor, 'foo@@hufs.ac.kr', now),
    ).rejects.toEqual(new UserManagementError('INVALID_SCHOOL_EMAIL'));
    expect(invitations.recordInvitation).not.toHaveBeenCalled();
  });
});
