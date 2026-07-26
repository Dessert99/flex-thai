/** 개념 블록 종류별 최소 CRUD 입력을 제공한다 */
/* eslint-disable max-lines, max-lines-per-function */
import type { ConceptBlockInput } from '@flex-thia/contracts';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

interface ConceptBlockEditorProps {
  blocks: ConceptBlockInput[];
  disabled: boolean;
  onChange: (blocks: ConceptBlockInput[]) => void;
}

const normalize = (blocks: ConceptBlockInput[]) =>
  blocks.map((block, position) => ({ ...block, position }));

/** raw HTML 없이 문단·표·기존 문장 UUID를 추가·수정·삭제한다 */
export function ConceptBlockEditor({
  blocks,
  disabled,
  onChange,
}: ConceptBlockEditorProps) {
  const replace = (index: number, block: ConceptBlockInput) =>
    onChange(
      blocks.map((current, currentIndex) =>
        currentIndex === index ? block : current,
      ),
    );
  return (
    <div className='grid gap-cluster'>
      {blocks.map((block, index) => (
        <fieldset
          className='rounded-panel border p-page'
          disabled={disabled}
          key={`${block.kind}-${block.position}`}
        >
          <legend>{block.kind}</legend>
          <Input
            aria-label={`블록 ${index + 1} 제목`}
            onChange={(event) =>
              replace(index, { ...block, heading: event.target.value })
            }
            value={block.heading}
          />
          {block.kind === 'EXPLANATION' ? (
            <div>
              {block.paragraphs.map((paragraph, paragraphIndex) => (
                <div key={`${index}-paragraph-${paragraphIndex}`}>
                  <Input
                    aria-label={`블록 ${index + 1} 문단 ${paragraphIndex + 1}`}
                    onChange={(event) =>
                      replace(index, {
                        ...block,
                        paragraphs: block.paragraphs.map(
                          (current, currentIndex) =>
                            currentIndex === paragraphIndex
                              ? event.target.value
                              : current,
                        ),
                      })
                    }
                    value={paragraph}
                  />
                  <Button
                    disabled={block.paragraphs.length === 1}
                    onClick={() =>
                      replace(index, {
                        ...block,
                        paragraphs: block.paragraphs.filter(
                          (_, currentIndex) => currentIndex !== paragraphIndex,
                        ),
                      })
                    }
                    type='button'
                    variant='outline'
                  >
                    문단 삭제
                  </Button>
                </div>
              ))}
              <Button
                onClick={() =>
                  replace(index, {
                    ...block,
                    paragraphs: [...block.paragraphs, '새 문단'],
                  })
                }
                type='button'
              >
                문단 추가
              </Button>
            </div>
          ) : null}
          {block.kind === 'RULE_TABLE' ? (
            <div>
              <div>
                {block.headers.map((header, columnIndex) => (
                  <Input
                    aria-label={`블록 ${index + 1} 열 ${columnIndex + 1} 제목`}
                    key={`${index}-header-${columnIndex}`}
                    onChange={(event) =>
                      replace(index, {
                        ...block,
                        headers: block.headers.map((current, currentIndex) =>
                          currentIndex === columnIndex
                            ? event.target.value
                            : current,
                        ),
                        rows: block.rows,
                      })
                    }
                    value={header}
                  />
                ))}
                <Button
                  onClick={() =>
                    replace(index, {
                      ...block,
                      headers: [...block.headers, '새 열'],
                      rows: block.rows.map((row) => [...row, '값']),
                    })
                  }
                  type='button'
                >
                  열 추가
                </Button>
                <Button
                  disabled={block.headers.length === 1}
                  onClick={() =>
                    replace(index, {
                      ...block,
                      headers: block.headers.slice(0, -1),
                      rows: block.rows.map((row) => row.slice(0, -1)),
                    })
                  }
                  type='button'
                  variant='outline'
                >
                  마지막 열 삭제
                </Button>
              </div>
              {block.rows.map((row, rowIndex) => (
                <div key={`${index}-row-${rowIndex}`}>
                  {row.map((cell, columnIndex) => (
                    <Input
                      aria-label={`블록 ${index + 1} 행 ${rowIndex + 1} 열 ${columnIndex + 1}`}
                      key={`${index}-${rowIndex}-${columnIndex}`}
                      onChange={(event) =>
                        replace(index, {
                          ...block,
                          rows: block.rows.map((currentRow, currentRowIndex) =>
                            currentRowIndex === rowIndex
                              ? currentRow.map((current, currentColumnIndex) =>
                                  currentColumnIndex === columnIndex
                                    ? event.target.value
                                    : current,
                                )
                              : currentRow,
                          ),
                        })
                      }
                      value={cell}
                    />
                  ))}
                  <Button
                    disabled={block.rows.length === 1}
                    onClick={() =>
                      replace(index, {
                        ...block,
                        rows: block.rows.filter(
                          (_, currentIndex) => currentIndex !== rowIndex,
                        ),
                      })
                    }
                    type='button'
                    variant='outline'
                  >
                    행 삭제
                  </Button>
                </div>
              ))}
              <Button
                onClick={() =>
                  replace(index, {
                    ...block,
                    rows: [...block.rows, block.headers.map(() => '값')],
                  })
                }
                type='button'
              >
                행 추가
              </Button>
            </div>
          ) : null}
          {block.kind === 'THAI_EXAMPLES' ? (
            <div>
              {block.examples.map((example, exampleIndex) => (
                <div key={`${index}-example-${exampleIndex}`}>
                  <Input
                    aria-label={`예시 ${exampleIndex + 1} 문장 버전 UUID`}
                    onChange={(event) =>
                      replace(index, {
                        ...block,
                        examples: block.examples.map((current, currentIndex) =>
                          currentIndex === exampleIndex
                            ? {
                                ...current,
                                sentenceVersionId: event.target.value,
                              }
                            : current,
                        ),
                      })
                    }
                    value={example.sentenceVersionId}
                  />
                  <Input
                    aria-label={`예시 ${exampleIndex + 1} 한국어 메모`}
                    onChange={(event) =>
                      replace(index, {
                        ...block,
                        examples: block.examples.map((current, currentIndex) =>
                          currentIndex === exampleIndex
                            ? {
                                ...current,
                                noteKo: event.target.value || null,
                              }
                            : current,
                        ),
                      })
                    }
                    value={example.noteKo ?? ''}
                  />
                  <Button
                    disabled={block.examples.length === 1}
                    onClick={() =>
                      replace(index, {
                        ...block,
                        examples: block.examples
                          .filter(
                            (_, currentIndex) => currentIndex !== exampleIndex,
                          )
                          .map((current, position) => ({
                            ...current,
                            position,
                          })),
                      })
                    }
                    type='button'
                    variant='outline'
                  >
                    예시 삭제
                  </Button>
                </div>
              ))}
              <Button
                onClick={() =>
                  replace(index, {
                    ...block,
                    examples: [
                      ...block.examples,
                      {
                        position: block.examples.length,
                        sentenceVersionId: '',
                        noteKo: null,
                      },
                    ],
                  })
                }
                type='button'
              >
                예시 추가
              </Button>
            </div>
          ) : null}
          <div className='flex gap-cluster'>
            <Button
              disabled={index === 0}
              onClick={() => {
                const next = [...blocks];
                const [current] = next.splice(index, 1);
                if (current) next.splice(index - 1, 0, current);
                onChange(normalize(next));
              }}
              type='button'
            >
              위로
            </Button>
            <Button
              disabled={blocks.length === 1}
              onClick={() =>
                onChange(
                  normalize(
                    blocks.filter((_, currentIndex) => currentIndex !== index),
                  ),
                )
              }
              type='button'
              variant='outline'
            >
              블록 삭제
            </Button>
          </div>
        </fieldset>
      ))}
      <Button
        disabled={disabled}
        onClick={() =>
          onChange([
            ...blocks,
            {
              kind: 'EXPLANATION',
              position: blocks.length,
              heading: '새 설명',
              paragraphs: ['새 문단'],
            },
          ])
        }
        type='button'
      >
        설명 블록 추가
      </Button>
      <Button
        disabled={disabled}
        onClick={() =>
          onChange([
            ...blocks,
            {
              kind: 'RULE_TABLE',
              position: blocks.length,
              heading: '새 규칙 표',
              headers: ['항목'],
              rows: [['값']],
            },
          ])
        }
        type='button'
      >
        규칙 표 블록 추가
      </Button>
      <Button
        disabled={disabled}
        onClick={() =>
          onChange([
            ...blocks,
            {
              kind: 'THAI_EXAMPLES',
              position: blocks.length,
              heading: '새 태국어 예시',
              examples: [
                {
                  position: 0,
                  sentenceVersionId: '',
                  noteKo: null,
                },
              ],
            },
          ])
        }
        type='button'
      >
        태국어 예시 블록 추가
      </Button>
    </div>
  );
}
