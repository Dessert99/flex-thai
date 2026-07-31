/** local Docker stack의 reset·preserve·stop 명령을 같은 project 범위로 실행한다 */
import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/** 다른 compose project와 container·volume 범위를 분리하는 고정 project 이름 */
export const localRuntimeProjectName = 'flex-thia-local';

/** 사람이 reset 영향과 각 runtime mode를 실행 전에 확인하는 도움말 */
export const localRuntimeHelp = `Usage: pnpm local:<fresh|preserve|stop>

fresh     Reset local database data, seed fixtures, then start the test profile.
preserve  Start the test profile with existing database data.
stop      Stop only the ${localRuntimeProjectName} project and preserve volumes.

Warning: fresh deletes FLEX THIA local database data before it starts.`;

/** Docker CLI 종료 상태를 caller가 실패로 처리하도록 전달한다 */
const runCommand = (argv) =>
  new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(argv[0], argv.slice(1), { stdio: 'inherit' });
    child.once('error', rejectCommand);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolveCommand();
        return;
      }
      rejectCommand(
        new Error(
          `LOCAL_RUNTIME_COMMAND_FAILED: ${argv.join(' ')} (${signal ?? code ?? 'unknown'})`,
        ),
      );
    });
  });

/** mode별 compose argv를 하나의 주입 가능한 runner로 실행한다 */
export const runLocalRuntime = async (mode, run = runCommand) => {
  const compose = [
    'docker',
    'compose',
    '--project-name',
    localRuntimeProjectName,
  ];
  if (mode === 'fresh') {
    await run([
      ...compose,
      '--profile',
      'reset',
      'run',
      '--build',
      '--rm',
      'db-setup',
    ]);
    await run([...compose, '--profile', 'test', 'up', '--build']);
    return;
  }
  if (mode === 'preserve') {
    await run([...compose, '--profile', 'test', 'up', '--build']);
    return;
  }
  if (mode === 'stop') {
    await run([...compose, 'down']);
    return;
  }
  throw new Error('LOCAL_RUNTIME_MODE_INVALID');
};

const isDirectInvocation =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  const mode = process.argv[2];
  if (mode === '--help' || mode === 'help' || mode === undefined) {
    process.stdout.write(`${localRuntimeHelp}\n`);
  } else {
    runLocalRuntime(mode).catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'LOCAL_RUNTIME_COMMAND_FAILED'}\n`,
      );
      process.exitCode = 1;
    });
  }
}
