import { ContentProductionForm } from '@/features/content-production/components/run-content-production/ContentProductionForm';
import type {
  ContentProductionJobListResponse,
  ContentProductionPresetListResponse,
  PromptPreviewResponse,
} from '@flex-thia/contracts/content-production/content-production';
export interface ContentProductionConsolePageViewProps {
  createError: boolean;
  jobs?: ContentProductionJobListResponse;
  jobsError: boolean;
  jobsLoading: boolean;
  presets?: ContentProductionPresetListResponse;
  presetsError: boolean;
  presetsLoading: boolean;
  preview?: PromptPreviewResponse;
  previewError: boolean;
  mutationPending: boolean;
  onConfigurationChange: () => void;
  onFile: Parameters<typeof ContentProductionForm>[0]['onFile'];
  onPreview: Parameters<typeof ContentProductionForm>[0]['onPreview'];
  onSubmit: Parameters<typeof ContentProductionForm>[0]['onSubmit'];
  onRetryJobs: () => void;
  onRetryPresets: () => void;
}
