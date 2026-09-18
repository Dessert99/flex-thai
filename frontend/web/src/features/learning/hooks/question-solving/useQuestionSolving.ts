import { questionDetailQueryOptions } from '@/features/learning/apis/question-solving/questionDetailQueries';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface QuestionSolvingPageContainerProps {
  questionId: string;
}
export function useQuestionSolving({
  questionId,
}: QuestionSolvingPageContainerProps) {
  const queryClient = useQueryClient();

  const question = useQuery(questionDetailQueryOptions(questionId));
  return { questionId, queryClient, question };
}
