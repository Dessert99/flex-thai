/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-unused-vars */
import { adminConceptDetailQueryOptions } from '@/features/learning/apis/admin-concept-detail/adminConceptDetailQueries';
import {
  changeConceptVisibility,
  createNextConceptDraft,
  publishConceptVersion,
  replaceConceptVersion,
  validateConceptVersion,
} from '@/features/learning/apis/admin-concept-detail/conceptVersionMutations';
import type { AdminConceptDetailPageViewProps } from '@/features/learning/libs/admin-concept-detail/adminConceptDetailPageTypes';
import { conceptDraftFormSchema } from '@/features/learning/libs/admin-concept-detail/conceptDraftFormSchema';
import { isApiError } from '@/shared/apis/ApiError';
import {
  type ConceptBlockInput,
  type ConceptCategory,
  type ReplaceConceptVersionRequest,
} from '@flex-thia/contracts/concepts/concepts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

// eslint-disable-next-line max-lines-per-function -- 기존 초안 동기화와 mutation 흐름을 보존한 기능 훅이다.
export function useAdminConceptDetail({
  conceptId,
}: {
  conceptId: string;
}): AdminConceptDetailPageViewProps {
  const client = useQueryClient();

  const query = useQuery(adminConceptDetailQueryOptions(conceptId));

  const draft = query.data?.versions.find(({ status }) => status === 'DRAFT');

  const [blocks, setBlocks] = useState<ConceptBlockInput[]>([]);

  const [conflict, setConflict] = useState(false);

  const [message, setMessage] = useState<string | null>(null);

  const [metadata, setMetadata] = useState<{
    category: ConceptCategory;
    position: number;
    title: string;
    summary: string;
  }>({
    category: 'GRAMMAR',
    position: 0,
    title: '',
    summary: '',
  });

  useEffect(() => {
    if (draft) {
      setBlocks(
        draft.blocks.map((block): ConceptBlockInput => {
          const { id: _id, ...input } = block;
          return input;
        }),
      );
      setMetadata({
        category: draft.category,
        position: draft.position,
        title: draft.title,
        summary: draft.summary,
      });
    }
  }, [draft]);

  const refresh = () =>
    client.invalidateQueries({
      queryKey: ['admin', 'concepts'],
    });

  const handleError = async (error: unknown) => {
    if (
      isApiError(error) &&
      error.detail.kind === 'problem' &&
      error.detail.problem.status === 409
    ) {
      setConflict(true);
      setMessage(null);
      await refresh();
      return;
    }
    setMessage('요청을 처리하지 못했습니다. 다시 시도해 주세요.');
  };

  const createDraft = useMutation({
    mutationFn: () => createNextConceptDraft(conceptId),
    onError: handleError,
    onSuccess: refresh,
  });

  const replace = useMutation({
    mutationFn: ({
      versionId,
      payload,
    }: {
      versionId: string;
      payload: ReplaceConceptVersionRequest;
    }) => replaceConceptVersion(versionId, payload),
    onError: handleError,
    onSuccess: refresh,
  });

  const validate = useMutation({
    mutationFn: validateConceptVersion,
    onError: handleError,
    onSuccess: refresh,
  });

  const publish = useMutation({
    mutationFn: publishConceptVersion,
    onError: handleError,
    onSuccess: refresh,
  });

  const visibility = useMutation({
    mutationFn: (action: 'hide' | 'restore') =>
      changeConceptVisibility(conceptId, action),
    onError: handleError,
    onSuccess: refresh,
  });
  return {
    blocks: blocks,
    conflict: conflict,
    data: query.data,
    draftMetadata: metadata,
    error: query.isError,
    loading: query.isPending,
    message: message,
    onBlocksChange: setBlocks,
    onCreateDraft: () => createDraft.mutate(),
    onPublish: (versionId) => publish.mutate(versionId),
    onRetry: () => void query.refetch(),
    onMetadataChange: (patch) =>
      setMetadata((current) => ({ ...current, ...patch })),
    onSave: (versionId) => {
      if (!draft) return;
      const parsed = conceptDraftFormSchema.safeParse({
        revision: draft.revision,
        ...metadata,
        blocks,
      });
      if (!parsed.success) {
        setMessage('입력값을 확인해 주세요.');
        return;
      }
      setMessage(null);
      replace.mutate({ versionId, payload: parsed.data });
    },
    onValidate: (versionId) => validate.mutate(versionId),
    onVisibilityChange: (action) => visibility.mutate(action),
    pending:
      createDraft.isPending ||
      replace.isPending ||
      validate.isPending ||
      publish.isPending ||
      visibility.isPending,
  };
}
