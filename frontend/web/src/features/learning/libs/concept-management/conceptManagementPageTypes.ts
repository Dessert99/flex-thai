import type {
  AdminConceptListQuery,
  AdminConceptListResponse,
  CreateConceptRequest,
} from '@flex-thia/contracts/concepts/concepts';
export interface ConceptManagementPageViewProps {
  createMessage: string | null;
  createPending: boolean;
  data: AdminConceptListResponse | undefined;
  error: boolean;
  loading: boolean;
  onFilterChange: (patch: Partial<AdminConceptListQuery>) => void;
  onCreate: (input: CreateConceptRequest) => void;
  onRetry: () => void;
  search: AdminConceptListQuery;
}
