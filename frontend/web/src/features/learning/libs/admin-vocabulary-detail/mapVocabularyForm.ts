/** 관리자 어휘 상세를 request-local ref form으로 순서 보존 mapping한다 */
import {
  adminVocabularyReplaceRequestSchema,
  type AdminVocabularyDetailResponse,
  type AdminVocabularyReplaceRequest,
} from '@flex-thia/contracts/admin/vocabularies';

/** 응답 child ID를 stable clientRef로만 옮기고 nullable 값을 보존한다 */
export function mapVocabularyDetailToForm(
  detail: AdminVocabularyDetailResponse,
): AdminVocabularyReplaceRequest {
  const pronunciations = detail.meanings.map((meaning) => {
    const link = detail.meaningPronunciations.find(
      ({ meaningId }) => meaningId === meaning.id,
    );
    const pronunciation = detail.pronunciations.find(
      ({ id }) => id === link?.pronunciationId,
    );
    return {
      clientRef: `pronunciation:${meaning.id}`,
      pronunciationKo: pronunciation?.pronunciationKo ?? '',
      toneMarks: pronunciation?.toneMarks ?? '',
    };
  });
  return {
    thai: detail.thai,
    kind: detail.kind,
    meanings: detail.meanings.map(({ id, ...meaning }) => ({
      clientRef: id,
      ...meaning,
    })),
    pronunciations,
    meaningPronunciations: detail.meanings.map(({ id }) => ({
      meaningRef: id,
      pronunciationRef: `pronunciation:${id}`,
    })),
  };
}

/** form 값에서 undocumented ID field 없이 공개 교체 요청만 반환한다 */
export function mapVocabularyFormToRequest(
  form: AdminVocabularyReplaceRequest,
) {
  return adminVocabularyReplaceRequestSchema.parse(form);
}
