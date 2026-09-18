/** 템플릿 조회·변경과 선택 상태를 관리한다 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  extractionTemplatesQueryOptions,
  createExtractionTemplate,
  deleteExtractionTemplate,
} from '../../apis/vocabulary-extraction/extractionTemplateApi';
export function useExtractionTemplates() {
  const client = useQueryClient();
  const options = extractionTemplatesQueryOptions();
  const query = useQuery(options);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const selected = query.data?.items.find((item) => item.id === selectedId);
  const create = useMutation({
    mutationFn: createExtractionTemplate,
    onSuccess: (template) => {
      client.setQueryData(options.queryKey, (old) => ({
        items: [template, ...(old?.items ?? [])],
      }));
      setAdding(false);
      setSelectedId(template.id);
      void client.invalidateQueries({ queryKey: options.queryKey });
    },
  });
  const remove = useMutation({
    mutationFn: deleteExtractionTemplate,
    onSuccess: (_, id) => {
      client.setQueryData(
        options.queryKey,
        (old) => old && { items: old.items.filter((item) => item.id !== id) },
      );
      setSelectedId(null);
      void client.invalidateQueries({ queryKey: options.queryKey });
    },
  });
  const pending = create.isPending || remove.isPending;
  const resetErrors = () => {
    create.reset();
    remove.reset();
  };
  return {
    query,
    selectedId,
    setSelectedId,
    adding,
    setAdding,
    selected,
    create,
    remove,
    pending,
    resetErrors,
  };
}
