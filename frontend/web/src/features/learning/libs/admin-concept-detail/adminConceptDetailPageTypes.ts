import type {
  AdminConceptDetailResponse,
  ConceptBlockInput,
  ConceptCategory,
} from '@flex-thia/contracts/concepts/concepts';
export interface AdminConceptDetailPageViewProps {
  blocks: ConceptBlockInput[];
  conflict: boolean;
  data: AdminConceptDetailResponse | undefined;
  draftMetadata: {
    category: ConceptCategory;
    position: number;
    title: string;
    summary: string;
  };
  error: boolean;
  loading: boolean;
  message: string | null;
  onBlocksChange: (blocks: ConceptBlockInput[]) => void;
  onCreateDraft: () => void;
  onPublish: (versionId: string) => void;
  onRetry: () => void;
  onMetadataChange: (
    patch: Partial<AdminConceptDetailPageViewProps['draftMetadata']>,
  ) => void;
  onSave: (versionId: string) => void;
  onValidate: (versionId: string) => void;
  onVisibilityChange: (action: 'hide' | 'restore') => void;
  pending: boolean;
}
