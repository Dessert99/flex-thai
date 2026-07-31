/** 관리자 문제 두 버전의 선택과 구조·내용 diff를 표현한다 */
import type { AdminQuestionDetailResponse } from '@flex-thia/contracts';
import { useState } from 'react';
import { compareQuestionVersions } from '../model/questionVersionDiff';

type Version = AdminQuestionDetailResponse['versions'][number];

const selectVersion = (
  versions: Version[],
  selectedId: string,
  fallback: Version,
) => versions.find(({ id }) => id === selectedId) ?? fallback;

/** 버전 두 개를 선택해 본문·보기·정답·해설·상태 차이를 표시한다 */
export function QuestionVersionComparison({
  versions,
}: {
  versions: Version[];
}) {
  const [beforeId, setBeforeId] = useState(
    versions[1]?.id ?? versions[0]?.id ?? '',
  );
  const [afterId, setAfterId] = useState(versions[0]?.id ?? '');
  const first = versions[0];
  const second = versions[1];
  if (first === undefined || second === undefined) return null;
  const before = selectVersion(versions, beforeId, second);
  const after = selectVersion(versions, afterId, first);
  const differences = compareQuestionVersions(before, after);

  return (
    <section className='grid gap-cluster rounded-panel border border-default p-page'>
      <h2 className='text-title text-primary'>버전 비교</h2>
      <div className='grid gap-cluster md:grid-cols-2'>
        <label className='grid gap-cluster'>
          <span className='text-body'>기준 버전</span>
          <select
            className='rounded-control border border-default bg-surface p-cluster'
            onChange={(event) => setBeforeId(event.target.value)}
            value={before.id}
          >
            {versions.map((version) => (
              <option
                key={version.id}
                value={version.id}
              >
                버전 {version.version}
              </option>
            ))}
          </select>
        </label>
        <label className='grid gap-cluster'>
          <span className='text-body'>비교 버전</span>
          <select
            className='rounded-control border border-default bg-surface p-cluster'
            onChange={(event) => setAfterId(event.target.value)}
            value={after.id}
          >
            {versions.map((version) => (
              <option
                key={version.id}
                value={version.id}
              >
                버전 {version.version}
              </option>
            ))}
          </select>
        </label>
      </div>
      {differences.length === 0 ? (
        <p className='text-body text-subtle'>표시할 차이가 없습니다.</p>
      ) : (
        <ul className='grid gap-cluster'>
          {differences.map((difference) => (
            <li
              className='grid gap-cluster rounded-control bg-surface-muted p-cluster'
              key={difference.kind}
            >
              <strong>{difference.label} 변경</strong>
              <span className='whitespace-pre-wrap text-body text-subtle'>
                이전: {difference.before || '없음'}
              </span>
              <span className='whitespace-pre-wrap text-body'>
                이후: {difference.after || '없음'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
