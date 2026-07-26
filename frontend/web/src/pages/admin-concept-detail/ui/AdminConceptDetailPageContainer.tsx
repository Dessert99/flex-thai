/** 관리자 개념 query와 mutation을 상세 View에 연결한다 */
import {
  type ConceptBlockInput,
  type ConceptCategory,
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
      setBlocks(draft.blocks);
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
  return (
    <AdminConceptDetailPageView
      blocks={blocks}
      conflict={conflict}
      data={query.data}
      draftMetadata={metadata}
      error={query.isError}
      loading={query.isPending}
      message={message}
      onBlocksChange={setBlocks}
      onCreateDraft={() => createDraft.mutate()}
      onPublish={(versionId) => publish.mutate(versionId)}
      onRetry={() => void query.refetch()}
      onMetadataChange={(patch) =>
        setMetadata((current) => ({ ...current, ...patch }))
      }
      onSave={(versionId) => {
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
      }}
      onValidate={(versionId) => validate.mutate(versionId)}
      onVisibilityChange={(action) => visibility.mutate(action)}
      pending={
        createDraft.isPending ||
        replace.isPending ||
        validate.isPending ||
        publish.isPending ||
        visibility.isPending
      }
    />
  );
}
