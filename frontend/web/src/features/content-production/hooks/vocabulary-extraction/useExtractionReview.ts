import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  extractionJobKeys,
  getExtractionResults,
  saveExtractionResults,
  getLatestSavedExtraction,
} from '../../apis/vocabulary-extraction/extractionJobApi';

export function useLatestSavedExtraction() {
  return useQuery({
    queryKey: [...extractionJobKeys.all, 'latest-saved'],
    queryFn: getLatestSavedExtraction,
  });
}
export function useExtractionReview(
  jobId: string,
  preview?: Awaited<ReturnType<typeof getExtractionResults>>,
) {
  const client = useQueryClient();
  const [excluded, setExcluded] = useState<string[]>([]);
  const queryKey = preview
    ? ['extraction-review-preview', jobId]
    : [...extractionJobKeys.detail(jobId), 'results'];
  const query = useQuery({
    queryKey,
    queryFn: () =>
      preview ? Promise.resolve(preview) : getExtractionResults(jobId),
    enabled: !preview,
    initialData: preview,
  });
  const save = useMutation({
    mutationFn: (ids: string[]) =>
      preview
        ? Promise.resolve({
            savedAt: new Date().toISOString(),
            selectedIds: ids,
            items: preview.items
              .filter((item) => ids.includes(item.id))
              .map((item) => ({
                vocabularyId: item.vocabularyId ?? crypto.randomUUID(),
                meaningId: crypto.randomUUID(),
                thai: item.thai,
                meaningKo: item.meaningKo,
                classification: item.classification,
              })),
          })
        : saveExtractionResults(jobId, ids),
    onSuccess: (receipt) => {
      client.setQueryData(queryKey, (previous: typeof query.data) =>
        previous ? { ...previous, receipt } : previous,
      );
      if (preview) return;
      void client.invalidateQueries({
        queryKey: [...extractionJobKeys.all, 'latest-saved'],
      });
      // 단어 관리 목록과 상세 캐시를 함께 갱신한다.
      void client.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === 'admin' && q.queryKey[1] === 'vocabularies',
      });
    },
  });
  const receipt = save.data ?? query.data?.receipt;
  const items = (query.data?.items ?? []).filter((item) =>
    receipt
      ? receipt.selectedIds.includes(item.id)
      : !excluded.includes(item.id),
  );
  return {
    query,
    save,
    receipt,
    items,
    excluded,
    remove: (id: string) => {
      if (!save.isPending && !receipt) setExcluded((ids) => [...ids, id]);
    },
    restore: () => {
      if (!save.isPending && !receipt) setExcluded([]);
    },
    submit: () => save.mutate(items.map((item) => item.id)),
  };
}
