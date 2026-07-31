/** production API subdomain을 주입한 web artifact build를 실행하고 검증한다 */
import { spawn } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { verifyProductionWebArtifact } from './verify-production-web-artifact.mjs';

const distDirectory = 'frontend/web/dist';
const maximumJavaScriptBytes = 500_000;
const forbiddenBuildWarnings = [
  'does not export a Route',
  'Some chunks are larger than 500 kB',
];
const rootDomainPattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;

const runBuild = ({ command, args, env }) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({ exitCode, stderr, stdout });
    });
  });

/** production web을 build하고 같은 dist artifact가 배포 기준을 충족하는지 확인한다 */
export const buildProductionWeb = async ({
  rootDomain,
  run = runBuild,
  verifyArtifact = verifyProductionWebArtifact,
}) => {
  if (!rootDomainPattern.test(rootDomain)) {
    throw new Error('Production web build requires a valid root domain.');
  }

  const apiBaseUrl = `https://api.${rootDomain}/api/v1`;
  const result = await run({
    command: 'pnpm',
    args: ['--filter', '@flex-thia/web', 'build'],
    env: { VITE_API_BASE_URL: apiBaseUrl },
  });
  if (result.exitCode !== 0) {
    throw new Error('Production web build failed.');
  }
  if (
    forbiddenBuildWarnings.some((warning) =>
      `${result.stdout}${result.stderr}`.includes(warning),
    )
  ) {
    throw new Error('Production web build emitted forbidden warnings.');
  }

  await verifyArtifact({
    apiBaseUrl,
    directory: distDirectory,
    maximumJavaScriptBytes,
  });
  return { apiBaseUrl, directory: distDirectory };
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [rootDomain] = process.argv.slice(2);
  await buildProductionWeb({ rootDomain });
}
