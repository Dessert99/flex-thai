/** 관리자 개념의 모든 버전과 초안 편집·검증 action을 표현한다 */
import type {
  AdminConceptDetailResponse,
  ConceptCategory,
  ConceptBlockInput,
} from '@flex-thia/contracts';
import { Button } from '@/shared/ui/button';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import { ConceptBlockEditor } from './ConceptBlockEditor';

interface AdminConceptDetailPageViewProps {
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
      {props.message ? <p role='alert'>{props.message}</p> : null}
      {draft ? (
        <article>
          <h2>초안 v{draft.version}</h2>
          <p>검증: {draft.validationStatus}</p>
          {draft.validationIssues.map((issue) => (
            <p key={`${issue.path}-${issue.code}`}>{issue.path} · {issue.code} · {issue.evidenceKo}</p>
          ))}
          <label>
            영역
            <select
              disabled={props.pending}
              onChange={(event) => props.onMetadataChange({
                category: event.target.value as ConceptCategory,
              })}
              value={props.draftMetadata.category}
            >
              <option value='THAI_SCRIPT_PRONUNCIATION'>태국 문자·발음</option>
              <option value='GRAMMAR'>문법</option>
            </select>
          </label>
          <label>
            교육 순서
            <input
              disabled={props.pending}
              min={0}
              onChange={(event) => props.onMetadataChange({
                position: Number(event.target.value),
              })}
              type='number'
              value={props.draftMetadata.position}
            />
          </label>
          <label>
            제목
            <input
              disabled={props.pending}
              onChange={(event) => props.onMetadataChange({
                title: event.target.value,
              })}
              value={props.draftMetadata.title}
            />
          </label>
          <label>
            요약
            <input
              disabled={props.pending}
              onChange={(event) => props.onMetadataChange({
                summary: event.target.value,
              })}
              value={props.draftMetadata.summary}
            />
          </label>
          <ConceptBlockEditor
            blocks={props.blocks}
            disabled={props.pending}
            onChange={props.onBlocksChange}
          />
          <Button disabled={props.pending} onClick={() => props.onSave(draft.id)} type='button'>저장</Button>
          <Button disabled={props.pending} onClick={() => props.onValidate(draft.id)} type='button'>검증</Button>
          <Button disabled={props.pending || draft.validationStatus !== 'PASSED'} onClick={() => props.onPublish(draft.id)} type='button'>게시</Button>
        </article>
      ) : (
        <Button disabled={props.pending} onClick={props.onCreateDraft} type='button'>새 초안 만들기</Button>
      )}
      {props.data.status === 'PUBLISHED' ? (
        <Button disabled={props.pending} onClick={() => props.onVisibilityChange('hide')} type='button'>숨기기</Button>
      ) : null}
      {props.data.status === 'HIDDEN' ? (
        <Button disabled={props.pending} onClick={() => props.onVisibilityChange('restore')} type='button'>복구</Button>
      ) : null}
      <section>
        <h2>버전 이력</h2>
        {props.data.versions.filter(({ status }) => status !== 'DRAFT').map((version) => (
          <article key={version.id}><h3>v{version.version} · {version.status}</h3><p>{version.title}</p></article>
        ))}
      </section>
    </section>
  );
}
