/** TTS voice preset catalog와 관리자 command를 공개 응답으로 조립한다 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  TtsDomainError,
  assertTtsVoicePresetCanDisable,
  type TtsOperationAuditContext,
  type TtsVoicePresetVersion,
} from '@flex-thia/domain';
import {
  ttsVoicePresetDetailResponseSchema,
  ttsVoicePresetListResponseSchema,
  type ChangeTtsVoicePresetEnabledRequest,
  type CreateTtsVoicePresetRequest,
  type CreateTtsVoicePresetVersionRequest,
  type TtsVoicePresetDetailResponse,
  type TtsVoicePresetListQuery,
  type TtsVoicePresetListResponse,
} from '@flex-thia/contracts';

/** 인증된 관리자와 요청 ID를 command audit 문맥으로 전달한다 */
export interface TtsAdminActorContext {
  userId: string;
  sub: string;
  requestId: string;
}

/** TTS voice preset 목록·상세 query 경계 */
export interface TtsVoicePresetQueryPort {
  list(input: TtsVoicePresetListQuery): Promise<{
    items: TtsVoicePresetVersion[];
    page: TtsVoicePresetListResponse['page'];
  }>;
  findById(id: string): Promise<TtsVoicePresetVersion | null>;
}

/** TTS voice preset immutable command 경계 */
export interface TtsVoicePresetRepositoryPort {
  createInitial(
    input: CreateTtsVoicePresetRequest & {
      id: string;
      context: TtsOperationAuditContext;
      occurredAt: Date;
    },
  ): Promise<TtsVoicePresetVersion>;
  createVersion(
    input: Omit<CreateTtsVoicePresetVersionRequest, 'expectedUpdatedAt'> & {
      id: string;
      sourcePresetId: string;
      expectedUpdatedAt: Date;
      context: TtsOperationAuditContext;
      occurredAt: Date;
    },
  ): Promise<TtsVoicePresetVersion>;
  setEnabled(input: {
    presetId: string;
    expectedUpdatedAt: Date;
    enabled: boolean;
    context: TtsOperationAuditContext;
    occurredAt: Date;
  }): Promise<TtsVoicePresetVersion>;
}

/** TTS voice preset 서비스 조립 의존성 */
export interface TtsVoicePresetsServiceDependencies {
  query: TtsVoicePresetQueryPort;
  repository: TtsVoicePresetRepositoryPort;
  activePresetId: string;
  generateId: () => string;
  now?: () => Date;
}

const auditContext = (actor: TtsAdminActorContext): TtsOperationAuditContext => ({
  actorSub: actor.sub,
  actorUserId: actor.userId,
  requestId: actor.requestId,
});

const withPresetErrors = async <Result>(
  operation: () => Promise<Result>,
): Promise<Result> => {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof TtsDomainError)) throw error;
    if (error.code === 'TTS_VOICE_PRESET_NOT_FOUND') {
      throw new NotFoundException({ code: error.code });
    }
    throw new ConflictException({ code: error.code });
  }
};

/** TTS voice preset 목록·상세와 immutable command를 제공한다 */
export class TtsVoicePresetsService {
  private readonly now: () => Date;

  constructor(
    private readonly dependencies: TtsVoicePresetsServiceDependencies,
  ) {
    this.now = dependencies.now ?? (() => new Date());
  }

  /** preset version page에 configured active 상태를 계산한다 */
  async list(input: TtsVoicePresetListQuery): Promise<TtsVoicePresetListResponse> {
    const page = await this.dependencies.query.list(input);
    return ttsVoicePresetListResponseSchema.parse({
      items: page.items.map((row) => this.toResponse(row)),
      page: page.page,
    });
  }

  /** UUID preset version을 active projection과 함께 반환한다 */
  async get(presetId: string): Promise<TtsVoicePresetDetailResponse> {
    const row = await this.dependencies.query.findById(presetId);
    if (!row) {
      throw new NotFoundException({ code: 'TTS_VOICE_PRESET_NOT_FOUND' });
    }
    return this.toResponse(row);
  }

  /** 최초 immutable preset version을 생성한다 */
  async createPreset(
    actor: TtsAdminActorContext,
    request: CreateTtsVoicePresetRequest,
  ): Promise<TtsVoicePresetDetailResponse> {
    const row = await withPresetErrors(() =>
      this.dependencies.repository.createInitial({
        ...request,
        id: this.dependencies.generateId(),
        context: auditContext(actor),
        occurredAt: this.now(),
      }),
    );
    return this.toResponse(row);
  }

  /** source 이름을 유지하는 새 immutable preset version을 생성한다 */
  async createVersion(
    actor: TtsAdminActorContext,
    sourcePresetId: string,
    request: CreateTtsVoicePresetVersionRequest,
  ): Promise<TtsVoicePresetDetailResponse> {
    const row = await withPresetErrors(() =>
      this.dependencies.repository.createVersion({
        ...request,
        expectedUpdatedAt: new Date(request.expectedUpdatedAt),
        id: this.dependencies.generateId(),
        sourcePresetId,
        context: auditContext(actor),
        occurredAt: this.now(),
      }),
    );
    return this.toResponse(row);
  }

  /** preset을 새 작업에서 선택 가능하게 한다 */
  enablePreset(
    actor: TtsAdminActorContext,
    presetId: string,
    request: ChangeTtsVoicePresetEnabledRequest,
  ): Promise<TtsVoicePresetDetailResponse> {
    return this.setEnabled(actor, presetId, request, true);
  }

  /** configured active preset이 아닌 row만 비활성화한다 */
  async disablePreset(
    actor: TtsAdminActorContext,
    presetId: string,
    request: ChangeTtsVoicePresetEnabledRequest,
  ): Promise<TtsVoicePresetDetailResponse> {
    try {
      assertTtsVoicePresetCanDisable(
        presetId,
        this.dependencies.activePresetId,
      );
    } catch (error) {
      if (error instanceof TtsDomainError) {
        throw new ConflictException({ code: error.code });
      }
      throw error;
    }
    return this.setEnabled(actor, presetId, request, false);
  }

  private async setEnabled(
    actor: TtsAdminActorContext,
    presetId: string,
    request: ChangeTtsVoicePresetEnabledRequest,
    enabled: boolean,
  ): Promise<TtsVoicePresetDetailResponse> {
    const row = await withPresetErrors(() =>
      this.dependencies.repository.setEnabled({
        presetId,
        expectedUpdatedAt: new Date(request.expectedUpdatedAt),
        enabled,
        context: auditContext(actor),
        occurredAt: this.now(),
      }),
    );
    return this.toResponse(row);
  }

  private toResponse(
    row: TtsVoicePresetVersion,
  ): TtsVoicePresetDetailResponse {
    return ttsVoicePresetDetailResponseSchema.parse({
      ...row,
      active: row.id === this.dependencies.activePresetId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
}
