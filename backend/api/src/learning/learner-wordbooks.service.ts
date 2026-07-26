/** 단어장 projection과 쓰기 use case를 private key 없는 공개 응답으로 조립한다 */
import { NotFoundException } from '@nestjs/common';
import {
  vocabularyWordbookMembershipResponseSchema,
  wordbookItemListResponseSchema,
  wordbookListResponseSchema,
  wordbookResponseSchema,
  type VocabularyWordbookMembershipResponse,
  type WordbookBulkItemsRequest,
  type WordbookItemListQuery,
  type WordbookItemListResponse,
  type WordbookListResponse,
  type WordbookNameRequest,
  type WordbookRemoveItemsRequest,
  type WordbookResponse,
} from '@flex-thia/contracts';
import type {
  DrizzleWordbookQuery,
  WordbookItemProjection,
  WordbookSummaryProjection,
} from '@flex-thia/database';
import type {
  MediaReadUrlProvider,
  WordbookService,
} from '@flex-thia/domain';
import {
  parseLearnerPublicResponse,
} from './learner-content.service.js';

const MEDIA_URL_TTL_MS = 5 * 60 * 1_000;
type SignMedia = (storageKey: string) => Promise<string>;

/** 단어장 HTTP application service가 소비하는 최소 의존성 */
export interface LearnerWordbooksDependencies {
  query: Pick<
    DrizzleWordbookQuery,
    'listItems' | 'listMemberships' | 'listWordbooks'
  >;
  wordbooks: Pick<
    WordbookService,
    | 'addVocabulary'
    | 'copyVocabularies'
    | 'create'
    | 'delete'
    | 'moveVocabularies'
    | 'removeVocabularies'
    | 'removeVocabulary'
    | 'rename'
  >;
  mediaReadUrls: MediaReadUrlProvider;
  now?: () => Date;
}

const mapWordbook = (wordbook: WordbookSummaryProjection) => ({
  ...wordbook,
  createdAt: wordbook.createdAt.toISOString(),
  updatedAt: wordbook.updatedAt.toISOString(),
});

const mapItem = async (
  item: WordbookItemProjection,
  signMedia: SignMedia,
) => ({
  id: item.id,
  thai: item.thai,
  kind: item.kind,
  meanings: item.meanings,
  pronunciations: await Promise.all(
    item.pronunciations.map(async (pronunciation) => ({
      id: pronunciation.id,
      pronunciationKo: pronunciation.pronunciationKo,
      toneMarks: pronunciation.toneMarks,
      audioUrl: await signMedia(pronunciation.media.storageKey),
    })),
  ),
  saved: item.saved,
  addedAt: item.addedAt.toISOString(),
});

/** 단어장 read/write 결과를 strict 공개 응답으로 제한한다 */
export class LearnerWordbooksService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: LearnerWordbooksDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  /** 현재 사용자의 단어장을 private 필드 없이 반환한다 */
  async listWordbooks(userId: string): Promise<WordbookListResponse> {
    const items = await this.dependencies.query.listWordbooks(userId);
    return parseLearnerPublicResponse(wordbookListResponseSchema, {
      items: items.map(mapWordbook),
    });
  }

  /** 단어장을 만든 뒤 count를 포함한 사용자 projection을 반환한다 */
  async create(
    userId: string,
    request: WordbookNameRequest,
  ): Promise<WordbookResponse> {
    const created = await this.dependencies.wordbooks.create(
      userId,
      request.name,
    );
    return this.loadResponseProjection(userId, created.id);
  }

  /** 소유 단어장 이름을 변경한 뒤 최신 projection을 반환한다 */
  async rename(
    userId: string,
    wordbookId: string,
    request: WordbookNameRequest,
  ): Promise<WordbookResponse> {
    await this.dependencies.wordbooks.rename(userId, wordbookId, request.name);
    return this.loadResponseProjection(userId, wordbookId);
  }

  /** 소유 단어장 삭제를 domain use case에 위임한다 */
  delete(userId: string, wordbookId: string): Promise<void> {
    return this.dependencies.wordbooks.delete(userId, wordbookId);
  }

  /** 검색된 공개 항목 media를 응답별 5분 URL로 바꾼다 */
  async listItems(
    userId: string,
    wordbookId: string,
    query: WordbookItemListQuery,
  ): Promise<WordbookItemListResponse> {
    const result = await this.dependencies.query.listItems(
      userId,
      wordbookId,
      {
        page: query.page,
        pageSize: query.pageSize,
        ...(query.query === undefined ? {} : { query: query.query }),
        ...(query.kind === undefined ? {} : { kind: query.kind }),
        ...(query.partOfSpeech === undefined
          ? {}
          : { partOfSpeech: query.partOfSpeech }),
        ...(query.difficulty === undefined
          ? {}
          : { difficulty: query.difficulty }),
      },
    );
    if (!result) {
      throw new NotFoundException({ code: 'WORDBOOK_NOT_FOUND' });
    }
    const signMedia = this.createResponseSigner();
    return parseLearnerPublicResponse(wordbookItemListResponseSchema, {
      wordbook: mapWordbook(result.wordbook),
      items: await Promise.all(
        result.items.map((item) => mapItem(item, signMedia)),
      ),
      page: result.page,
    });
  }

  /** 현재 게시 어휘를 소유 단어장에 멱등 추가한다 */
  addVocabulary(
    userId: string,
    wordbookId: string,
    vocabularyId: string,
  ): Promise<void> {
    return this.dependencies.wordbooks.addVocabulary(
      userId,
      wordbookId,
      vocabularyId,
    );
  }

  /** 상태와 무관하게 소유 단어장의 membership을 멱등 제거한다 */
  removeVocabulary(
    userId: string,
    wordbookId: string,
    vocabularyId: string,
  ): Promise<void> {
    return this.dependencies.wordbooks.removeVocabulary(
      userId,
      wordbookId,
      vocabularyId,
    );
  }

  /** 선택 membership을 대상 단어장에 복사한다 */
  copyVocabularies(
    userId: string,
    sourceId: string,
    request: WordbookBulkItemsRequest,
  ): Promise<void> {
    return this.dependencies.wordbooks.copyVocabularies(
      userId,
      sourceId,
      request.targetWordbookId,
      request.vocabularyIds,
    );
  }

  /** 선택 membership을 대상 단어장으로 원자 이동한다 */
  moveVocabularies(
    userId: string,
    sourceId: string,
    request: WordbookBulkItemsRequest,
  ): Promise<void> {
    return this.dependencies.wordbooks.moveVocabularies(
      userId,
      sourceId,
      request.targetWordbookId,
      request.vocabularyIds,
    );
  }

  /** 선택 membership을 소유 단어장에서 한 번에 제거한다 */
  removeVocabularies(
    userId: string,
    sourceId: string,
    request: WordbookRemoveItemsRequest,
  ): Promise<void> {
    return this.dependencies.wordbooks.removeVocabularies(
      userId,
      sourceId,
      request.vocabularyIds,
    );
  }

  /** 어휘가 속한 현재 사용자 단어장 ID만 반환한다 */
  async listMemberships(
    userId: string,
    vocabularyId: string,
  ): Promise<VocabularyWordbookMembershipResponse> {
    return parseLearnerPublicResponse(
      vocabularyWordbookMembershipResponseSchema,
      {
        wordbookIds: await this.dependencies.query.listMemberships(
          userId,
          vocabularyId,
        ),
      },
    );
  }

  private async loadResponseProjection(
    userId: string,
    wordbookId: string,
  ): Promise<WordbookResponse> {
    const projection = (
      await this.dependencies.query.listWordbooks(userId)
    ).find(({ id }) => id === wordbookId);
    if (!projection) {
      throw new NotFoundException({ code: 'WORDBOOK_NOT_FOUND' });
    }
    return parseLearnerPublicResponse(
      wordbookResponseSchema,
      mapWordbook(projection),
    );
  }

  private createResponseSigner(): SignMedia {
    const expiresAt = new Date(this.now().getTime() + MEDIA_URL_TTL_MS);
    const cache = new Map<string, Promise<string>>();
    return (storageKey) => {
      const cached = cache.get(storageKey);
      if (cached) return cached;
      const pending = this.dependencies.mediaReadUrls.createReadUrl(
        storageKey,
        expiresAt,
      );
      cache.set(storageKey, pending);
      return pending;
    };
  }
}
