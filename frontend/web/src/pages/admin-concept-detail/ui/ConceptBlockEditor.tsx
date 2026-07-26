/** 개념 블록 종류별 구조 입력만 제공한다 */
import type { ConceptBlockInput } from '@flex-thia/contracts';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

interface ConceptBlockEditorProps {
  blocks: ConceptBlockInput[];
  onChange: (blocks: ConceptBlockInput[]) => void;
}

/** raw HTML 없이 문단·표·기존 문장 UUID를 편집한다 */
export function ConceptBlockEditor({
  blocks,
  onChange,
}: ConceptBlockEditorProps) {
  const replace = (index: number, block: ConceptBlockInput) =>
    onChange(blocks.map((current, currentIndex) =>
      currentIndex === index ? block : current));
  return (
    <div className='grid gap-cluster'>
      {blocks.map((block, index) => (
        <fieldset className='rounded-panel border p-page' key={`${block.kind}-${block.position}`}>
          <legend>{block.kind}</legend>
          <Input
            aria-label={`블록 ${index + 1} 제목`}
            onChange={(event) => replace(index, { ...block, heading: event.target.value })}
            value={block.heading}
          />
          {block.kind === 'EXPLANATION' ? (
            <Input
              aria-label={`블록 ${index + 1} 첫 문단`}
              onChange={(event) => replace(index, {
                ...block,
                paragraphs: [event.target.value, ...block.paragraphs.slice(1)],
              })}
              value={block.paragraphs[0] ?? ''}
            />
          ) : null}
          {block.kind === 'RULE_TABLE' ? (
            <div>
              <Input aria-label={`블록 ${index + 1} 표 헤더`} readOnly value={block.headers.join(' | ')} />
              <p>{block.rows.map((row) => row.join(' | ')).join('\n')}</p>
            </div>
          ) : null}
          {block.kind === 'THAI_EXAMPLES' ? block.examples.map((example, exampleIndex) => (
            <div key={example.position}>
              <Input
                aria-label={`예시 ${exampleIndex + 1} 문장 버전 UUID`}
                onChange={(event) => replace(index, {
                  ...block,
                  examples: block.examples.map((current, currentIndex) =>
                    currentIndex === exampleIndex
                      ? { ...current, sentenceVersionId: event.target.value }
                      : current),
                })}
                value={example.sentenceVersionId}
              />
              <Input
                aria-label={`예시 ${exampleIndex + 1} 한국어 메모`}
                onChange={(event) => replace(index, {
                  ...block,
                  examples: block.examples.map((current, currentIndex) =>
                    currentIndex === exampleIndex
                      ? { ...current, noteKo: event.target.value || null }
                      : current),
                })}
                value={example.noteKo ?? ''}
              />
            </div>
          )) : null}
          <div className='flex gap-cluster'>
            <Button disabled={index === 0} onClick={() => {
              const next = [...blocks];
              const [current] = next.splice(index, 1);
              if (current) next.splice(index - 1, 0, current);
              onChange(next.map((item, position) => ({ ...item, position })));
            }} type='button'>위로</Button>
            <Button onClick={() => onChange(blocks.filter((_, currentIndex) => currentIndex !== index).map((item, position) => ({ ...item, position })))} type='button' variant='outline'>삭제</Button>
          </div>
        </fieldset>
      ))}
      <Button onClick={() => onChange([...blocks, {
        kind: 'EXPLANATION',
        position: blocks.length,
        heading: '새 설명',
        paragraphs: ['새 문단'],
      }])} type='button'>설명 블록 추가</Button>
    </div>
  );
}
