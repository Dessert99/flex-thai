/** 관리자 어휘 상세의 교체·관계·병합 mutation과 cache 갱신을 조립한다 */
import type {
  AdminVocabularyMergePreviewResponse,
  AdminVocabularyReplaceRequest,
  AdminVocabularyRelationCreateRequest,
  AdminVocabularyRelationUpdateRequest,
} from '@flex-thia/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createAdminVocabularyRelation,
  deleteAdminVocabularyRelation,
  mergeAdminVocabulary,
  previewAdminVocabularyMerge,
  replaceAdminVocabulary,
  updateAdminVocabularyRelation,
} from '../api/adminVocabularyMutations';

type RelationCommand =
  | {
      kind: 'create';
      payload: AdminVocabularyRelationCreateRequest;
    }
  | {
      kind: 'delete';
      relationId: string;
    }
  | {
      kind: 'status';
      relationId: string;
      payload: AdminVocabularyRelationUpdateRequest;
    };

/** 관계 변경 뒤 무효화할 최소 cache prefix */
export const vocabularyRelationInvalidationKeys = [
  ['admin', 'vocabularies', 'detail'],
  ['admin', 'vocabularies', 'list'],
  ['learner', 'vocabularies'],
] as const;

/** 병합 뒤 source·대표·학습자 사용처 cache key를 계산한다 */
export const vocabularyMergeInvalidationKeys = (
  sourceVocabularyId: string,
  representativeVocabularyId: string,
) =>
  [
    ['admin', 'vocabularies', 'detail', sourceVocabularyId],
    ['admin', 'vocabularies', 'detail', representativeVocabularyId],
    ['admin', 'vocabularies', 'list'],
    ['admin', 'home', 'vocabularies'],
    ['learner', 'vocabularies'],
    ['learner', 'home', 'vocabularies'],
    // 추천 통합 뒤에는 ['learner', 'home', 'recommendations'] prefix도 추가한다.
    ['learner', 'vocabulary'],
    ['learner', 'wordbooks'],
  ] as const;

/** 어휘 상세 화면에서 공유하는 mutation 상태와 명령을 반환한다 */
export function useAdminVocabularyDetailActions(vocabularyId: string) {
  const queryClient = useQueryClient();
  const [mergePreview, setMergePreview] =
    useState<AdminVocabularyMergePreviewResponse | null>(null);
  const refreshSource = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['admin', 'vocabularies', 'detail', vocabularyId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['admin', 'vocabularies', 'list'],
      }),
    ]);
  const replace = useMutation({
    mutationFn: (payload: AdminVocabularyReplaceRequest) =>
      replaceAdminVocabulary({ payload, vocabularyId }),
    onSuccess: () => refreshSource(),
    retry: false,
  });
  const relation = useMutation({
    mutationFn: (command: RelationCommand) => {
      if (command.kind === 'create') {
        return createAdminVocabularyRelation({
          vocabularyId,
          payload: command.payload,
        });
      }
      if (command.kind === 'delete') {
        return deleteAdminVocabularyRelation({
          vocabularyId,
          relationId: command.relationId,
        });
      }
      return updateAdminVocabularyRelation({
        vocabularyId,
        relationId: command.relationId,
        payload: command.payload,
      });
    },
    onSuccess: () =>
      Promise.all(
        vocabularyRelationInvalidationKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
    retry: false,
  });
  const previewMerge = useMutation({
    mutationFn: (representativeVocabularyId: string) =>
      previewAdminVocabularyMerge({
        vocabularyId,
        payload: { representativeVocabularyId },
      }),
    onSuccess: setMergePreview,
    retry: false,
  });
  const merge = useMutation({
    mutationFn: (preview: AdminVocabularyMergePreviewResponse) =>
      mergeAdminVocabulary({
        vocabularyId,
        payload: {
          representativeVocabularyId: preview.representative.id,
          mergeToken: preview.mergeToken,
        },
      }),
    onSuccess: (result) => {
      setMergePreview(null);
      return Promise.all(
        vocabularyMergeInvalidationKeys(
          result.sourceVocabularyId,
          result.representativeVocabularyId,
        ).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
    retry: false,
  });

  return {
    merge,
    mergePreview,
    previewMerge,
    discardMergePreview: () => setMergePreview(null),
    refresh: refreshSource,
    relation,
    replace,
  };
}
