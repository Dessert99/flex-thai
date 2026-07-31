/** local runtime 명령이 reset과 data 보존을 분리하는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { runLocalRuntime } from './local-runtime.mjs';

const createRunner = () => {
  const recorded = [];
  return {
    recorded,
    run: async (argv) => {
      recorded.push(argv);
    },
  };
};

describe('local runtime 명령', () => {
  it('fresh는 schema reset을 완료한 뒤 전체 test profile을 시작한다', async () => {
    const { recorded, run } = createRunner();

    await runLocalRuntime('fresh', run);

    expect(recorded).toEqual([
      [
        'docker',
        'compose',
        '--project-name',
        'flex-thia-local',
        '--profile',
        'reset',
        'run',
        '--build',
        '--rm',
        'db-setup',
      ],
      [
        'docker',
        'compose',
        '--project-name',
        'flex-thia-local',
        '--profile',
        'test',
        'up',
        '--build',
      ],
    ]);
  });

  it('preserve는 db-setup 없이 기존 local data로 전체 test profile을 시작한다', async () => {
    const { recorded, run } = createRunner();

    await runLocalRuntime('preserve', run);

    expect(recorded).toEqual([
      [
        'docker',
        'compose',
        '--project-name',
        'flex-thia-local',
        '--profile',
        'test',
        'up',
        '--build',
      ],
    ]);
    expect(recorded.flat()).not.toContain('db-setup');
  });

  it('stop은 이 project만 volume 삭제 없이 종료한다', async () => {
    const { recorded, run } = createRunner();

    await runLocalRuntime('stop', run);

    expect(recorded).toEqual([
      ['docker', 'compose', '--project-name', 'flex-thia-local', 'down'],
    ]);
    expect(recorded.flat()).not.toContain('-v');
  });
});
