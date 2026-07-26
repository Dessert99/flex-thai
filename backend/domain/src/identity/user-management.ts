/** 관리자 사용자 상태와 beta 안내 발송 추적 use case를 정의한다 */
import type {
  IdentityUser,
  IdentityUserManagementRepository,
  ManagedIdentityUser,
} from './user.repository.js';

/** 사용자 관리 use case가 허용하는 관리자 요청 문맥 */
export interface UserManagementActor {
  actorSub: string;
  actorUserId: string;
  requestId: string;
  role: IdentityUser['role'];
}

/** 가입 권한과 무관한 beta 안내 발송 추적 record */
export interface BetaInvitationRecord {
  id: string;
  email: string;
  invitedByUserId: string;
  sentAt: Date;
}

/** beta 안내 발송 사실을 append-only로 저장하는 port */
export interface BetaInvitationRepository {
  recordInvitation(input: {
    actorSub: string;
    email: string;
    invitedByUserId: string;
    requestId: string;
    sentAt: Date;
  }): Promise<BetaInvitationRecord>;
}

/** 사용자 관리 실패를 stable code로 전달한다 */
export class UserManagementError extends Error {
  constructor(
    readonly code: 'ADMIN_REQUIRED' | 'INVALID_SCHOOL_EMAIL' | 'USER_NOT_FOUND',
  ) {
    super(code);
    this.name = 'UserManagementError';
  }
}

/** 관리자 사용자 목록·상태·beta 안내 발송 추적을 조정한다 */
export class UserManagementService {
  constructor(
    private readonly users: IdentityUserManagementRepository,
    private readonly invitations: BetaInvitationRepository,
  ) {}

  /** ADMIN에게만 공개 사용자 목록을 반환한다 */
  async listUsers(actor: UserManagementActor): Promise<ManagedIdentityUser[]> {
    assertAdmin(actor);
    return this.users.listManagedUsers();
  }

  /** 대상 상태를 바꾼 뒤 같은 use case에서 audit을 남긴다 */
  async changeStatus(
    actor: UserManagementActor,
    userId: string,
    status: IdentityUser['status'],
    now: Date,
  ): Promise<ManagedIdentityUser> {
    assertAdmin(actor);
    const user = await this.users.changeStatusWithAudit({
      action:
        status === 'DISABLED'
          ? 'IDENTITY_USER_DISABLED'
          : 'IDENTITY_USER_ENABLED',
      actorSub: actor.actorSub,
      actorUserId: actor.actorUserId,
      occurredAt: now,
      requestId: actor.requestId,
      status,
      userId,
    });
    if (!user) {
      throw new UserManagementError('USER_NOT_FOUND');
    }
    return user;
  }

  /** 학교 이메일 안내 발송을 가입 제한과 무관한 기록으로만 저장한다 */
  async recordBetaInvitation(
    actor: UserManagementActor,
    emailInput: string,
    now: Date,
  ): Promise<BetaInvitationRecord> {
    assertAdmin(actor);
    return this.invitations.recordInvitation({
      actorSub: actor.actorSub,
      email: normalizeSchoolEmail(emailInput),
      invitedByUserId: actor.actorUserId,
      requestId: actor.requestId,
      sentAt: now,
    });
  }
}

const assertAdmin = (actor: UserManagementActor): void => {
  if (actor.role !== 'ADMIN') {
    throw new UserManagementError('ADMIN_REQUIRED');
  }
};

const normalizeSchoolEmail = (emailInput: string): string => {
  const email = emailInput.trim().toLowerCase();
  if (!/^[^\s@]+@hufs\.ac\.kr$/u.test(email)) {
    throw new UserManagementError('INVALID_SCHOOL_EMAIL');
  }
  return email;
};
