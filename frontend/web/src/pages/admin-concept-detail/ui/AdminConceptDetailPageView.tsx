/** 관리자 개념의 모든 버전과 초안 편집·검증 action을 표현한다 */
import type {
  AdminConceptDetailResponse,
  ConceptBlockInput,
} from '@flex-thia/contracts';
import { Button } from '@/shared/ui/button';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import { ConceptBlockEditor } from './ConceptBlockEditor';

interface AdminConceptDetailPageViewProps {
  blocks: ConceptBlockInput[];
  conflict: boolean;
  data: AdminConceptDetailResponse | undefined;
  error: boolean;
  loading: boolean;
  onBlocksChange: (blocks: ConceptBlockInput[]) => void;
  onCreateDraft: () => void;
  onPublish: (versionId: string) => void;
  onRetry: () => void;
  onSave: (versionId: string) => void;
  onValidate: (versionId: string) => void;
  onVisibilityChange: (action: 'hide' | 'restore') => void;
}

/** 게시 버전은 읽기 전용으로, 유일한 초안만 편집 가능하게 렌더링한다 */
export function AdminConceptDetailPageView(props: AdminConceptDetailPageViewProps) {
  if (props.loading) return <PageLoading message='개념을 불러오고 있습니다.' />;
  if (props.error || !props.data) return <PageError message='개념을 불러오지 못했습니다.' onRetry={props.onRetry} />;
  const draft = props.data.versions.find(({ status }) => status === 'DRAFT');
  return (
    <section className='grid gap-section'>
      <h1 className='text-title text-primary'>개념 상세</h1>
      <p>상태: {props.data.status}</p>
      {props.conflict ? <p role='alert'>다른 관리자가 수정했습니다. 최신 상태를 다시 불러왔습니다.</p> : null}
      {draft ? (
        <article>
          <h2>초안 v{draft.version}</h2>
          <p>검증: {draft.validationStatus}</p>
          {draft.validationIssues.map((issue) => (
            <p key={`${issue.path}-${issue.code}`}>{issue.path} · {issue.code} · {issue.evidenceKo}</p>
          ))}
          <ConceptBlockEditor blocks={props.blocks} onChange={props.onBlocksChange} />
          <Button onClick={() => props.onSave(draft.id)} type='button'>저장</Button>
          <Button onClick={() => props.onValidate(draft.id)} type='button'>검증</Button>
          <Button disabled={draft.validationStatus !== 'PASSED'} onClick={() => props.onPublish(draft.id)} type='button'>게시</Button>
        </article>
      ) : (
        <Button onClick={props.onCreateDraft} type='button'>새 초안 만들기</Button>
      )}
      <Button onClick={() => props.onVisibilityChange(props.data?.status === 'HIDDEN' ? 'restore' : 'hide')} type='button'>
        {props.data.status === 'HIDDEN' ? '복구' : '숨기기'}
      </Button>
      <section>
        <h2>버전 이력</h2>
        {props.data.versions.filter(({ status }) => status !== 'DRAFT').map((version) => (
          <article key={version.id}><h3>v{version.version} · {version.status}</h3><p>{version.title}</p></article>
        ))}
      </section>
    </section>
  );
}
