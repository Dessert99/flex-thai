import { ContentProductionPresetForm } from '@/features/content-production/components/manage-content-production-presets/ContentProductionPresetForm';
import type { ContentProductionPresetVersion } from '@flex-thia/contracts/content-production/content-production';
export interface ContentProductionPresetManagementPageViewProps {
  conflict: boolean;
  data?: { items: ContentProductionPresetVersion[] };
  error: boolean;
  loading: boolean;
  pending: boolean;
  selected?: ContentProductionPresetVersion;
  onCreate: Parameters<typeof ContentProductionPresetForm>[0]['onCreate'];
  onCreateVersion: Parameters<
    typeof ContentProductionPresetForm
  >[0]['onCreateVersion'];
  onRetry: () => void;
  onSelect: (preset: ContentProductionPresetVersion) => void;
  onSetEnabled: (preset: ContentProductionPresetVersion) => void;
}
