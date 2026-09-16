/** 구조화 문제 편집의 모든 Zod issue를 접근 가능한 요약으로 표시한다 */

/** 직접 field가 없는 관계 오류도 한 목록에서 읽히게 한다 */
export function QuestionVersionFormErrorSummary({
  issues,
}: {
  issues: Array<{ message: string; path: string }>;
}) {
  return (
    <section
      aria-label='입력 오류 요약'
      className='grid gap-cluster rounded-control bg-danger-surface p-cluster text-danger'
      role='alert'
    >
      <p className='text-body'>입력 내용을 확인해 주세요.</p>
      <ul className='grid gap-cluster text-caption'>
        {issues.map((issue, index) => (
          <li key={`${issue.path}-${issue.message}-${index}`}>
            {issue.path}: {issue.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
