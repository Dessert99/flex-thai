import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createExtractionJob,
  extractionJobKeys,
  listExtractionJobs,
} from '@/features/vocabulary-extraction/apis/vocabulary-extraction/extractionJobApi';
import { uploadExtractionInput } from '@/features/vocabulary-extraction/libs/vocabulary-extraction/uploadExtractionInput';
import type { ExtractionCreateInput } from '@flex-thia/contracts/vocabulary-extraction/vocabulary-extraction';
export type ExtractionSourceInput =
  { kind: 'file'; file: File | null } | { kind: 'url'; url: string };
export function useCreateExtraction(onStarted?: (id: string) => void) {
  const client = useQueryClient();
  const request = useRef<{ signature: string; id: string } | null>(null);
  const uploaded = useRef<{ file: File; uploadId: string } | null>(null);
  const history = useQuery({
    queryKey: extractionJobKeys.all,
    queryFn: listExtractionJobs,
  });
  const mutation = useMutation({
    mutationFn: async (input: {
      source: ExtractionSourceInput;
      prompt: string;
    }) => {
      const prompt = input.prompt.trim();
      if (!prompt) throw new Error('추출 지시문을 입력하세요.');
      let source: ExtractionCreateInput['source'];
      let sourceName: string;
      if (input.source.kind === 'file') {
        const file = input.source.file;
        if (!file) throw new Error('PDF 또는 이미지 파일을 선택하세요.');
        if (uploaded.current?.file !== file) {
          const result = await uploadExtractionInput(
            file,
            new AbortController().signal,
          );
          uploaded.current = { file, uploadId: result.uploadId };
        }
        source = {
          kind: file.type === 'application/pdf' ? 'pdf' : 'image',
          uploadId: uploaded.current.uploadId,
        };
        sourceName = file.name;
      } else {
        const url = new URL(input.source.url);
        if (url.protocol !== 'https:')
          throw new Error('보안 연결 주소를 입력하세요.');
        source = { kind: 'url', url: url.href };
        sourceName = url.hostname;
      }
      const signature = JSON.stringify({ source, prompt });
      if (request.current?.signature !== signature)
        request.current = { signature, id: crypto.randomUUID() };
      return createExtractionJob({
        requestId: request.current.id,
        sourceName,
        source,
        prompt,
      });
    },
    onSuccess: async (job) => {
      await client.invalidateQueries({ queryKey: extractionJobKeys.all });
      onStarted?.(job.id);
    },
  });
  return { history, mutation };
}
