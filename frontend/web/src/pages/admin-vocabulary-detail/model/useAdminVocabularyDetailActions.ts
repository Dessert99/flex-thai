/** 관리자 어휘 상세의 교체·관계·병합 mutation과 cache 갱신을 조립한다 */
import type {
  AdminVocabularyMergePreviewResponse,
  AdminVocabularyReplaceRequest,
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
      sourceMeaningId: string;
      targetMeaningId: string;
    }
  | {
      kind: 'delete';
      relationId: string;
    }
  | {
      kind: 'status';
      relationId: string;
      status: 'PENDING' | 'PASSED' | 'FAILED';
    };

/** 어휘 상세 화면에서 공유하는 mutation 상태와 명령을 반환한다 */
export function useAdminVocabularyDetailActions(vocabularyId: string) {
  const queryClient = useQueryClient();
  const [mergePreview, setMergePreview] =
    useState<AdminVocabularyMergePreviewResponse | null>(null);
  const refresh = () =>
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
    onSuccess: () => refresh(),
    retry: false,
  });
  const relation = useMutation({
    mutationFn: (command: RelationCommand) => {
      if (command.kind === 'create') {
        return createAdminVocabularyRelation({
          vocabularyId,
          payload: {
            sourceMeaningId: command.sourceMeaningId,
            targetMeaningId: command.targetMeaningId,
            type: 'RELATED',
            direction: 'DIRECTED',
          },
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
        payload: { status: command.status },
      });
    },
    onSuccess: () => refresh(),
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
    onSuccess: () => {
      setMergePreview(null);
      return refresh();
    },
    retry: false,
  });

  return {
    merge,
    mergePreview,
    previewMerge,
    refresh,
    relation,
    replace,
  };
}
