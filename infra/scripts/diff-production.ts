/** 로컬 설정으로 production CDK 변경 사항만 조회한다 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  assertExpectedAwsAccount,
  createProductionDiffArguments,
  createProductionInfrastructureConfig,
  readLocalProductionDiffEnvironment,
} from '../src/local-production-diff.js';

const infrastructureDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repositoryRoot = resolve(infrastructureDirectory, '..');
const localEnvironmentPath = resolve(
  repositoryRoot,
  '.env.infrastructure.local',
);

const readAwsAccount = (awsProfile: string): string => {
  try {
    return execFileSync(
      'aws',
      [
        'sts',
        'get-caller-identity',
        '--profile',
        awsProfile,
        '--query',
        'Account',
        '--output',
        'text',
      ],
      { encoding: 'utf8' },
    ).trim();
  } catch {
    throw new Error(
      `AWS 계정을 확인할 수 없습니다. aws sso login --profile ${awsProfile} 후 다시 실행하세요.`,
    );
  }
};

const runProductionDiff = (): void => {
  if (!existsSync(localEnvironmentPath)) {
    throw new Error(
      '.env.infrastructure.local이 없습니다. .env.infrastructure.example을 복사해 실제 값을 채워주세요.',
    );
  }

  const environmentSource = parseEnv(
    readFileSync(localEnvironmentPath, 'utf8'),
  );
  const environment = readLocalProductionDiffEnvironment(environmentSource);
  const mediaPublicKeyPath = resolve(
    repositoryRoot,
    environment.mediaPublicKeyPath,
  );

  if (!existsSync(mediaPublicKeyPath)) {
    throw new Error(
      `공개 키 파일을 찾을 수 없습니다: ${environment.mediaPublicKeyPath}`,
    );
  }

  const mediaPublicKeyPem = readFileSync(mediaPublicKeyPath, 'utf8');
  const config = createProductionInfrastructureConfig(
    environment,
    mediaPublicKeyPem,
  );
  const actualAccount = readAwsAccount(environment.awsProfile);

  assertExpectedAwsAccount(actualAccount, environment.account);

  execFileSync(
    'pnpm',
    [
      'exec',
      'cdk',
      ...createProductionDiffArguments(config, environment.awsProfile),
    ],
    {
      cwd: infrastructureDirectory,
      env: { ...process.env, AWS_PROFILE: environment.awsProfile },
      stdio: 'inherit',
    },
  );
};

try {
  runProductionDiff();
} catch (error) {
  const message =
    error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';

  console.error(`운영 인프라 diff를 실행하지 못했습니다: ${message}`);
  process.exitCode = 1;
}
