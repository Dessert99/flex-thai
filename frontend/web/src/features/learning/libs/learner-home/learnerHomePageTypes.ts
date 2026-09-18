import type { RecommendationResponse } from '@flex-thia/contracts/recommendations/recommendations';
export interface LearnerHomePageViewProps {
  error: boolean;
  onRetry: () => void;
  recommendation: RecommendationResponse | null;
  waiting: boolean;
}
