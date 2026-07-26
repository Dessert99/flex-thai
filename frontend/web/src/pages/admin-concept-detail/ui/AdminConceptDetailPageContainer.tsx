/** 관리자 개념 query와 mutation을 상세 View에 연결한다 */
import {
  type ConceptBlockInput,
  type ReplaceConceptVersionRequest,
} from '@flex-thia/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { isApiError } from '@/shared/api';
import { adminConceptDetailQueryOptions } from '../api/adminConceptDetailQueries';
import {
  changeConceptVisibility,
  createNextConceptDraft,
  publishConceptVersion,
  replaceConceptVersion,
  validateConceptVersion,
} from '../api/conceptVersionMutations';
import { conceptDraftFormSchema } from '../model/conceptDraftFormSchema';
import { AdminConceptDetailPageView } from './AdminConceptDetailPageView';

/** revision 충돌 시 최신 상세를 다시 읽고 사용자에게 알린다 */
export function AdminConceptDetailPageContainer({
  conceptId,
}: {
  conceptId: string;
}) {
  const client = useQueryClient();
  const query = useQuery(adminConceptDetailQueryOptions(conceptId));
  const draft = query.data?.versions.find(({ status }) => status === 'DRAFT');
  const [blocks, setBlocks] = useState<ConceptBlockInput[]>([]);
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    if (draft) setBlocks(draft.blocks);
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
      await refresh();
    }
  };
  const createDraft = useMutation({
    mutationFn: () => createNextConceptDraft(conceptId),
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
    onSuccess: refresh,
  });
  const publish = useMutation({
    mutationFn: publishConceptVersion,
    onSuccess: refresh,
  });
  const visibility = useMutation({
    mutationFn: (action: 'hide' | 'restore') =>
      changeConceptVisibility(conceptId, action),
    onSuccess: refresh,
  });
  return (
    <AdminConceptDetailPageView
      blocks={blocks}
      conflict={conflict}
      data={query.data}
      error={query.isError}
      loading={query.isPending}
      onBlocksChange={setBlocks}
      onCreateDraft={() => createDraft.mutate()}
      onPublish={(versionId) => publish.mutate(versionId)}
      onRetry={() => void query.refetch()}
      onSave={(versionId) => {
        if (!draft) return;
        const payload = conceptDraftFormSchema.parse({
          revision: draft.revision,
          category: draft.category,
          position: draft.position,
          title: draft.title,
          summary: draft.summary,
          blocks,
        });
        replace.mutate({ versionId, payload });
      }}
      onValidate={(versionId) => validate.mutate(versionId)}
      onVisibilityChange={(action) => visibility.mutate(action)}
    />
  );
}
