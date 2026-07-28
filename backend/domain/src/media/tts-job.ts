/** TTS 작업 항목의 lease·terminal 전이와 음성 재사용 key를 정의한다 */
import { createHash } from 'node:crypto';

/** TTS가 음성을 연결할 immutable 콘텐츠 대상 종류 */
export type TtsTargetKind =
  | 'VOCABULARY_PRONUNCIATION'
  | 'EXPRESSION'
  | 'THAI_SENTENCE_VERSION'
  | 'CONCEPT_SENTENCE';

/** TTS 항목 처리 상태 */
export type TtsItemStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';

/** TTS job이 항목 상태를 집계해 노출하는 상태 */
export type TtsJobStatus =
  'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'PARTIALLY_FAILED' | 'FAILED';

/** 문제 게시 전 필수 음성 상태를 조회할 읽기·듣기 문제 버전 식별자 */
export interface TtsPublishableContent {
  questionId: string;
  versionId: string;
}

/** 게시에 필요한 TTS target의 외부 노출 없는 준비 상태 */
export type ContentTtsMediaStatus =
  'MISSING' | 'UPLOADING' | 'READY' | 'FAILED';

/** 게시 전 확인할 필수 TTS target의 식별자와 준비 상태 */
export interface ContentTtsReadinessTarget {
  kind: 'THAI_SENTENCE_VERSION' | 'VOCABULARY_PRONUNCIATION';
  targetId: string;
  mediaStatus: ContentTtsMediaStatus;
}

/** 관리자 게시 화면이 blocker와 연결 작업을 함께 읽는 projection */
export interface TtsPublicationReadinessProjection {
  ready: boolean;
  requiredCount: number;
  readyCount: number;
  blockers: Array<{
    kind: ContentTtsReadinessTarget['kind'];
    targetId: string;
    mediaStatus: Exclude<ContentTtsMediaStatus, 'READY'>;
    operation: {
      jobId: string;
      itemId: string;
      itemStatus: TtsItemStatus;
      attempt: number;
      errorCode: string | null;
      retryable: boolean;
    } | null;
  }>;
}

/** 게시할 문제 버전에 필요한 TTS target 준비 상태를 읽는 port */
export interface ContentTtsReadinessRepository {
  listRequiredTargets(
    content: TtsPublishableContent,
  ): Promise<ContentTtsReadinessTarget[]>;
}

/** 필수 TTS target이 준비되지 않은 게시 요청을 안정적으로 구분한다 */
export class ContentTtsReadinessError extends Error {
  readonly code = 'CONTENT_TTS_NOT_READY';

  constructor(readonly targetIds: string[]) {
    super('CONTENT_TTS_NOT_READY');
    this.name = 'ContentTtsReadinessError';
  }
}

/** 대상 내용 변경과 분리해 TTS 입력을 고정하는 snapshot */
export interface TtsTargetSnapshot {
  kind: TtsTargetKind;
  targetId: string;
  text: string;
  required: boolean;
  revision: string;
}

/** 생성 중 공급자 설정 변경이 영향을 주지 않게 고정하는 voice snapshot */
export interface TtsVoiceSnapshot {
  presetId: string;
  provider: string;
  model: string;
  voice: string;
  locale: 'th-TH';
  audioFormat: 'audio/wav';
  generationRevision: string;
}

/** row 교체 없이 버전별로 보존하는 TTS voice preset */
export interface TtsVoicePresetVersion {
  id: string;
  name: string;
  provider: string;
  model: string;
  voice: string;
  locale: 'th-TH';
  audioFormat: 'audio/wav';
  generationRevision: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** TTS 관리자 command와 감사 기록을 묶는 인증 문맥 */
export interface TtsOperationAuditContext {
  actorSub: string;
  actorUserId: string;
  requestId: string;
}

/** 관리자 요청을 새 TTS job과 immutable 대상·voice snapshot으로 만드는 입력 */
export interface CreateTtsJobInput {
  requestedBy: string;
  targets: TtsTargetSnapshot[];
  voice: TtsVoiceSnapshot;
  requestedAt: Date;
}

/** TTS 항목의 현재 상태와 worker가 소비할 immutable 입력 */
export interface TtsItem {
  id: string;
  jobId: string;
  target: TtsTargetSnapshot;
  voice: TtsVoiceSnapshot;
  cacheKey: string;
  status: TtsItemStatus;
  attempt: number;
  leaseToken: string | null;
  leaseUntil: Date | null;
  errorCode: string | null;
  retryable: boolean;
  mediaAssetId: string | null;
}

/** TTS job 목록과 상태 집계에 필요한 최소 read model */
export interface TtsJob {
  id: string;
  status: TtsJobStatus;
  requestedBy: string;
  counts: TtsJobCounts;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

/** TTS job 목록의 상태·페이지 조건 */
export interface TtsJobListInput {
  status?: TtsJobStatus;
  page: number;
  pageSize: number;
}

/** 한 TTS job의 항목 목록 상태·페이지 조건 */
export interface TtsItemListInput {
  jobId: string;
  status?: TtsItemStatus;
  page: number;
  pageSize: number;
}

/** 상태별 TTS 항목 수 */
export interface TtsJobCounts {
  pending: number;
  processing: number;
  succeeded: number;
  failed: number;
}

/** TTS job 목록 응답의 안정적인 pagination 형태 */
export interface TtsJobPage {
  items: TtsJob[];
  page: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

/** voice snapshot을 포함하는 TTS job 상세 read model */
export interface TtsJobDetail extends TtsJob {
  voice: TtsVoiceSnapshot;
}

/** TTS 항목 목록 응답에 노출하는 상태·결과 read model */
export interface TtsItemPage {
  items: Array<{
    id: string;
    target: TtsTargetSnapshot;
    status: TtsItemStatus;
    attempt: number;
    errorCode: string | null;
    retryable: boolean;
    mediaAssetId: string | null;
  }>;
  page: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

/** 현재 lease를 보유한 worker에게 전달하는 작업 단위 */
export interface TtsWorkItem {
  jobId: string;
  itemId: string;
  attempt: number;
  leaseToken: string;
  leaseUntil: Date;
  target: TtsTargetSnapshot;
  voice: TtsVoiceSnapshot;
  cacheKey: string;
}

/** 활성 lease가 만든 음성 자산을 항목에 반영하는 입력 */
export interface TtsSuccessInput {
  item: TtsWorkItem;
  mediaAssetId: string;
  claimToken: string;
  completedAt: Date;
}

/** 활성 lease에서 공급자 실패를 항목에 반영하는 입력 */
export interface TtsFailureInput {
  item: TtsWorkItem;
  errorCode: string;
  retryable: boolean;
  failedAt: Date;
}

/** 선택한 실패 항목을 새 attempt로 여는 관리자 재시도 입력 */
export interface RetryTtsItemsInput {
  jobId: string;
  itemIds: string[];
  expectedAttempts: Record<string, number>;
  requestedAt: Date;
}

/** 인증된 관리자 audit 문맥을 포함하는 durable TTS 재시도 입력 */
export interface AuditedRetryTtsItemsInput extends RetryTtsItemsInput {
  context: TtsOperationAuditContext;
}

/** TTS 상태 전이를 안정적으로 구분하는 domain 오류 */
export class TtsDomainError extends Error {
  constructor(
    readonly code:
      | 'TTS_ITEM_LEASE_ACTIVE'
      | 'TTS_ITEM_NOT_FOUND'
      | 'TTS_ITEM_NOT_RETRYABLE'
      | 'TTS_ITEM_STALE_ATTEMPT'
      | 'TTS_ITEM_STALE_LEASE'
      | 'TTS_ITEM_TERMINAL'
      | 'TTS_JOB_TARGETS_REQUIRED'
      | 'TTS_RETRY_ATTEMPT_MISMATCH'
      | 'TTS_RETRY_ITEMS_REQUIRED'
      | 'TTS_RETRY_SELECTION_INVALID'
      | 'TTS_VOICE_PRESET_NOT_FOUND'
      | 'TTS_VOICE_PRESET_VERSION_CONFLICT'
      | 'TTS_VOICE_PRESET_STALE_REVISION'
      | 'TTS_VOICE_PRESET_ACTIVE_DISABLE'
      | 'TTS_AUDIO_NOT_READY'
      | 'TTS_MEDIA_READ_URL_PROVIDER_REQUIRED'
      | 'TTS_PUBLICATION_TARGET_MISMATCH',
  ) {
    super(code);
    this.name = 'TtsDomainError';
  }
}

/** active voice preset을 운영 중 실수로 비활성화하지 못하게 한다 */
export const assertTtsVoicePresetCanDisable = (
  presetId: string,
  activePresetId: string,
): void => {
  if (presetId === activePresetId) {
    throw new TtsDomainError('TTS_VOICE_PRESET_ACTIVE_DISABLE');
  }
};

/** claim 시점과 새 lease를 한 transaction에서 기록하기 위한 입력 */
export interface ClaimTtsItemInput {
  claimedAt: Date;
  leaseToken: string;
  leaseUntil: Date;
}

const isTerminal = (item: TtsItem): boolean =>
  item.status === 'SUCCEEDED' || item.status === 'FAILED';

/** 필수 target이 모두 READY일 때만 게시 수명을 진행하게 한다 */
export const assertContentTtsReady = (
  targets: Awaited<
    ReturnType<ContentTtsReadinessRepository['listRequiredTargets']>
  >,
): void => {
  const targetIds = [
    ...new Set(
      targets
        .filter((target) => target.mediaStatus !== 'READY')
        .map((target) => target.targetId),
    ),
  ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

  if (targetIds.length > 0) {
    throw new ContentTtsReadinessError(targetIds);
  }
};

const assertActiveLease = (
  current: TtsItem,
  workItem: TtsWorkItem,
  leaseToken: string,
  completedAt: Date,
): void => {
  if (isTerminal(current)) {
    throw new TtsDomainError('TTS_ITEM_TERMINAL');
  }

  if (
    current.status !== 'PROCESSING' ||
    current.id !== workItem.itemId ||
    current.jobId !== workItem.jobId ||
    current.attempt !== workItem.attempt ||
    current.leaseToken !== leaseToken ||
    workItem.leaseToken !== leaseToken ||
    current.leaseUntil === null ||
    current.leaseUntil.getTime() !== workItem.leaseUntil.getTime() ||
    current.leaseUntil <= completedAt
  ) {
    throw new TtsDomainError('TTS_ITEM_STALE_LEASE');
  }
};

/** PENDING 또는 만료 lease의 PROCESSING 항목만 새 worker가 claim한다 */
export const claimTtsItem = (
  item: TtsItem,
  input: ClaimTtsItemInput,
): TtsItem => {
  if (isTerminal(item)) {
    throw new TtsDomainError('TTS_ITEM_TERMINAL');
  }

  if (
    item.status === 'PROCESSING' &&
    item.leaseUntil !== null &&
    item.leaseUntil > input.claimedAt
  ) {
    throw new TtsDomainError('TTS_ITEM_LEASE_ACTIVE');
  }

  return {
    ...item,
    status: 'PROCESSING',
    leaseToken: input.leaseToken,
    leaseUntil: input.leaseUntil,
  };
};

/** 활성 lease 소유자의 음성 자산만 성공 terminal 상태로 확정한다 */
export const completeTtsItem = (
  current: TtsItem,
  input: TtsSuccessInput,
): TtsItem => {
  assertActiveLease(current, input.item, input.claimToken, input.completedAt);

  return {
    ...current,
    status: 'SUCCEEDED',
    leaseToken: null,
    leaseUntil: null,
    errorCode: null,
    retryable: false,
    mediaAssetId: input.mediaAssetId,
  };
};

/** 활성 lease 소유자의 공급자 실패만 실패 terminal 상태로 확정한다 */
export const failTtsItem = (
  current: TtsItem,
  input: TtsFailureInput,
): TtsItem => {
  assertActiveLease(current, input.item, input.item.leaseToken, input.failedAt);

  return {
    ...current,
    status: 'FAILED',
    leaseToken: null,
    leaseUntil: null,
    errorCode: input.errorCode,
    retryable: input.retryable,
    mediaAssetId: null,
  };
};

/** 선택한 retryable 실패 항목만 optimistic attempt 확인 뒤 새 PENDING으로 연다 */
export const retryTtsItems = (
  items: readonly TtsItem[],
  input: RetryTtsItemsInput,
): TtsItem[] => {
  const itemIds = new Set(input.itemIds);

  for (const itemId of itemIds) {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item || item.jobId !== input.jobId) {
      throw new TtsDomainError('TTS_ITEM_NOT_FOUND');
    }
    if (input.expectedAttempts[itemId] !== item.attempt) {
      throw new TtsDomainError('TTS_ITEM_STALE_ATTEMPT');
    }
    if (item.status !== 'FAILED' || !item.retryable) {
      throw new TtsDomainError('TTS_ITEM_NOT_RETRYABLE');
    }
  }

  return items.map((item) => {
    if (!itemIds.has(item.id)) return item;

    return {
      ...item,
      status: 'PENDING',
      attempt: item.attempt + 1,
      leaseToken: null,
      leaseUntil: null,
      errorCode: null,
      retryable: false,
      mediaAssetId: null,
    };
  });
};

/** 항목 상태를 job 목록용 상태와 counts로 순수하게 집계한다 */
export const aggregateTtsJobStatus = (
  items: readonly TtsItem[],
): { status: TtsJobStatus; counts: TtsJobCounts } => {
  const counts: TtsJobCounts = {
    pending: 0,
    processing: 0,
    succeeded: 0,
    failed: 0,
  };

  for (const item of items) {
    if (item.status === 'PENDING') counts.pending += 1;
    if (item.status === 'PROCESSING') counts.processing += 1;
    if (item.status === 'SUCCEEDED') counts.succeeded += 1;
    if (item.status === 'FAILED') counts.failed += 1;
  }

  if (counts.processing > 0) return { status: 'RUNNING', counts };
  if (counts.pending > 0) return { status: 'QUEUED', counts };
  if (counts.failed === 0) return { status: 'SUCCEEDED', counts };
  if (counts.succeeded === 0) return { status: 'FAILED', counts };
  return { status: 'PARTIALLY_FAILED', counts };
};

const normalizeTtsText = (text: string): string =>
  text.normalize('NFKC').trim().replace(/\s+/gu, ' ');

/** text와 전체 voice snapshot을 canonical JSON으로 SHA-256 digest해 재사용 key를 만든다 */
export const createTtsCacheKey = (
  text: string,
  voice: TtsVoiceSnapshot,
): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        text: normalizeTtsText(text),
        presetId: voice.presetId,
        provider: voice.provider,
        model: voice.model,
        voice: voice.voice,
        locale: voice.locale,
        audioFormat: voice.audioFormat,
        generationRevision: voice.generationRevision,
      }),
    )
    .digest('hex');
