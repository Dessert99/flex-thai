/** 관리자 사용자 상태와 beta 안내 발송 추적 use case를 정의한다 */
import type {
  IdentityUser,
  IdentityUserManagementRepository,
  ManagedIdentityUser,
  ManagedIdentityUserChangeResult,
  ManagedIdentityUserListQuery,
  ManagedIdentityUserPage,
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
    readonly code:
      | 'ADMIN_REQUIRED'
      | 'INVALID_SCHOOL_EMAIL'
      | 'USER_NOT_FOUND'
      | 'SELF_LOCKOUT_FORBIDDEN'
      | 'LAST_ACTIVE_ADMIN_REQUIRED',
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
  async listUsers(
    actor: UserManagementActor,
    query: ManagedIdentityUserListQuery,
  ): Promise<ManagedIdentityUserPage> {
    assertAdmin(actor);
    return this.users.listManagedUsers(query);
  }

  /** 대상 상태를 바꾼 뒤 같은 use case에서 audit을 남긴다 */
  async changeStatus(
    actor: UserManagementActor,
    userId: string,
    status: IdentityUser['status'],
    now: Date,
  ): Promise<ManagedIdentityUser> {
    assertAdmin(actor);
    const result = await this.users.changeStatusWithAudit({
      actorSub: actor.actorSub,
      actorUserId: actor.actorUserId,
      occurredAt: now,
      requestId: actor.requestId,
      status,
      userId,
    });
    return resolveChangeResult(result);
  }

  /** 대상 역할을 바꾸고 원자적 audit 결과를 반환한다 */
  async changeRole(
    actor: UserManagementActor,
    userId: string,
    role: IdentityUser['role'],
    now: Date,
  ): Promise<ManagedIdentityUser> {
    assertAdmin(actor);
    const result = await this.users.changeRoleWithAudit({
      actorSub: actor.actorSub,
      actorUserId: actor.actorUserId,
      occurredAt: now,
      requestId: actor.requestId,
      role,
      userId,
    });
    return resolveChangeResult(result);
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

const resolveChangeResult = (
  result: ManagedIdentityUserChangeResult,
): ManagedIdentityUser => {
  if (result.kind === 'UPDATED' || result.kind === 'UNCHANGED') {
    return result.user;
  }
  if (result.kind === 'NOT_FOUND') {
    throw new UserManagementError('USER_NOT_FOUND');
  }
  if (result.kind === 'SELF_LOCKOUT') {
    throw new UserManagementError('SELF_LOCKOUT_FORBIDDEN');
  }
  throw new UserManagementError('LAST_ACTIVE_ADMIN_REQUIRED');
};

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
