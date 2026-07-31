/** local runtime 명령이 reset과 data 보존을 분리하는지 검증한다 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runLocalRuntime } from './local-runtime.mjs';

const runtimeScript = fileURLToPath(
  new URL('./local-runtime.mjs', import.meta.url),
);

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

  it('도움말은 실행 mode와 reset 영향 및 project 범위를 안내한다', () => {
    const result = spawnSync(process.execPath, [runtimeScript, '--help'], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('fresh');
    expect(result.stdout).toContain('preserve');
    expect(result.stdout).toContain('stop');
    expect(result.stdout).toContain('Reset local database data');
    expect(result.stdout).toContain('flex-thia-local');
  });
});
