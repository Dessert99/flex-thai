# Local Infrastructure Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로컬 운영 인프라 설정을 Git에서 제외되는 전용 환경 파일에 한 번 저장하고 `pnpm infra:diff:prod`로 안전한 읽기 전용 CDK diff를 실행할 수 있게 한다.

**Architecture:** 순수 TypeScript 모듈이 로컬 환경값을 Zod로 검증하고 기존 `InfrastructureConfig`와 CDK CLI 인수를 생성한다. 얇은 실행기가 전용 환경 파일과 공개 키 파일을 읽고 AWS SSO account를 확인한 뒤 `cdk diff --no-change-set`만 실행한다. GitHub Actions와 실제 CDK Stack 구성은 변경하지 않는다.

**Tech Stack:** TypeScript 7, Node.js 22 `util.parseEnv`, Zod 4, AWS CLI v2, AWS CDK v2, Vitest 4, pnpm 10

## Global Constraints

- 실제 로컬 설정 파일은 `.env.infrastructure.local`이며 Git에 포함하지 않는다.
- 예시 파일은 `.env.infrastructure.example`이며 실제 계정·이메일 값을 포함하지 않는다.
- AWS access key, SSO token, 미디어 private key는 환경 파일에 저장하지 않는다.
- 공개 키는 `MEDIA_PUBLIC_KEY_PATH`가 가리키는 PEM 파일을 실행 시점에 읽는다.
- 환경 변수 조회는 로컬 실행기 최상단에서만 수행하고 Stack과 Construct는 기존 검증된 config 객체를 계속 사용한다.
- 로컬 명령은 `cdk diff --all --no-change-set`만 실행하며 deploy 명령을 추가하지 않는다.
- 새 TypeScript 파일은 `conventions/comment-convention.md`를 따르고 Vitest 설명은 한국어로 작성한다.
- GitHub `production` Variables/Secrets와 `.github/workflows/deploy-production.yml`은 변경하지 않는다.
- 현재 `main`을 유지하고 별도 브랜치·worktree·PR을 만들지 않는다.

---

### Task 1: 로컬 production 설정 검증과 CDK 인수 생성

**Files:**
- Create: `infra/src/local-production-diff.ts`
- Create: `infra/test/local-production-diff.spec.ts`

**Interfaces:**
- Consumes: `readInfrastructureConfig(context: Record<string, unknown>): InfrastructureConfig`
- Produces: `readLocalProductionDiffEnvironment(source: Record<string, string | undefined>): LocalProductionDiffEnvironment`
- Produces: `createProductionInfrastructureConfig(environment: LocalProductionDiffEnvironment, mediaPublicKeyPem: string): InfrastructureConfig`
- Produces: `assertExpectedAwsAccount(actualAccount: string, expectedAccount: string): void`
- Produces: `createProductionDiffArguments(config: InfrastructureConfig, awsProfile: string): readonly string[]`

- [x] **Step 1: 환경값 검증 실패 테스트 작성**

Create `infra/test/local-production-diff.spec.ts`:

```ts
/** 로컬 production diff가 잘못된 설정으로 AWS를 조회하지 않게 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  assertExpectedAwsAccount,
  createProductionDiffArguments,
  createProductionInfrastructureConfig,
  readLocalProductionDiffEnvironment,
} from '../src/local-production-diff.js';

const validEnvironmentSource = {
  AWS_PROFILE: 'flex-thia-admin',
  AWS_ACCOUNT_ID: '123456789012',
  ROOT_DOMAIN: 'example.com',
  HOSTED_ZONE_ID: 'Z0123456789EXAMPLE',
  ALERT_EMAIL: 'owner@example.com',
  ALLOWED_EMAIL_DOMAINS: 'school.ac.kr',
  GITHUB_REPOSITORY_CONTEXT: 'Dessert99/flex-thai',
  MONTHLY_BUDGET_USD: '30',
  MEDIA_PUBLIC_KEY_PATH: 'media-public-key.pem',
};

describe('readLocalProductionDiffEnvironment', () => {
  it('필수 로컬 설정이 빠지면 CDK 실행 전에 실패한다', () => {
    expect(() => readLocalProductionDiffEnvironment({})).toThrow();
  });
});

describe('assertExpectedAwsAccount', () => {
  it('로그인한 AWS 계정이 설정한 계정과 다르면 실패한다', () => {
    expect(() =>
      assertExpectedAwsAccount('999999999999', '123456789012'),
    ).toThrow('AWS 계정이 일치하지 않습니다');
  });
});
```

- [x] **Step 2: 실패 원인이 구현 부재인지 확인**

Run:

```bash
pnpm exec vitest run infra/test/local-production-diff.spec.ts
```

Expected: FAIL because `../src/local-production-diff.js` cannot be resolved.

- [x] **Step 3: 환경값 파서와 계정 안전장치 최소 구현**

Create `infra/src/local-production-diff.ts`:

```ts
/** 로컬 production CDK diff의 설정 검증과 CLI 인수 생성을 담당한다 */
import { z } from 'zod';
import {
  type InfrastructureConfig,
  readInfrastructureConfig,
} from './config.js';

const localProductionDiffEnvironmentSchema = z.object({
  AWS_PROFILE: z.string().trim().min(1),
  AWS_ACCOUNT_ID: z.string().regex(/^\d{12}$/u),
  ROOT_DOMAIN: z.string().trim().min(3),
  HOSTED_ZONE_ID: z.string().trim().min(2),
  ALERT_EMAIL: z.email(),
  ALLOWED_EMAIL_DOMAINS: z.string().trim().min(1),
  GITHUB_REPOSITORY_CONTEXT: z.string().regex(/^[^/]+\/[^/]+$/u),
  MONTHLY_BUDGET_USD: z.coerce.number().positive(),
  MEDIA_PUBLIC_KEY_PATH: z.string().trim().min(1),
});

/** 로컬 실행기가 사용하는 production 설정 */
export type LocalProductionDiffEnvironment = {
  awsProfile: string;
  account: string;
  rootDomain: string;
  hostedZoneId: string;
  alertEmail: string;
  allowedEmailDomains: string;
  githubRepository: string;
  monthlyBudgetUsd: number;
  mediaPublicKeyPath: string;
};

/** 전용 환경 파일의 문자열을 검증된 로컬 production 설정으로 변환한다 */
export const readLocalProductionDiffEnvironment = (
  source: Record<string, string | undefined>,
): LocalProductionDiffEnvironment => {
  const parsed = localProductionDiffEnvironmentSchema.parse(source);

  return {
    awsProfile: parsed.AWS_PROFILE,
    account: parsed.AWS_ACCOUNT_ID,
    rootDomain: parsed.ROOT_DOMAIN,
    hostedZoneId: parsed.HOSTED_ZONE_ID,
    alertEmail: parsed.ALERT_EMAIL,
    allowedEmailDomains: parsed.ALLOWED_EMAIL_DOMAINS,
    githubRepository: parsed.GITHUB_REPOSITORY_CONTEXT,
    monthlyBudgetUsd: parsed.MONTHLY_BUDGET_USD,
    mediaPublicKeyPath: parsed.MEDIA_PUBLIC_KEY_PATH,
  };
};

/** 공개 키를 합쳐 기존 production 인프라 설정 계약을 재사용한다 */
export const createProductionInfrastructureConfig = (
  environment: LocalProductionDiffEnvironment,
  mediaPublicKeyPem: string,
): InfrastructureConfig =>
  readInfrastructureConfig({
    account: environment.account,
    rootDomain: environment.rootDomain,
    hostedZoneId: environment.hostedZoneId,
    alertEmail: environment.alertEmail,
    githubRepository: environment.githubRepository,
    mediaPublicKeyPem,
    allowedEmailDomains: environment.allowedEmailDomains,
    monthlyBudgetUsd: environment.monthlyBudgetUsd,
  });

/** 잘못 로그인한 계정에 대한 diff 실행을 시작 전에 차단한다 */
export const assertExpectedAwsAccount = (
  actualAccount: string,
  expectedAccount: string,
): void => {
  if (actualAccount !== expectedAccount) {
    throw new Error(
      `AWS 계정이 일치하지 않습니다: expected ${expectedAccount}, received ${actualAccount}`,
    );
  }
};

/** 검증된 production 설정을 기존 CDK context 인수로 변환한다 */
export const createProductionDiffArguments = (
  config: InfrastructureConfig,
  awsProfile: string,
): readonly string[] => [
  'diff',
  '--all',
  '--profile',
  awsProfile,
  '--no-change-set',
  '-c',
  `account=${config.account}`,
  '-c',
  `rootDomain=${config.rootDomain}`,
  '-c',
  `hostedZoneId=${config.hostedZoneId}`,
  '-c',
  `alertEmail=${config.alertEmail}`,
  '-c',
  `githubRepository=${config.githubRepository}`,
  '-c',
  `mediaPublicKeyPem=${config.mediaPublicKeyPem}`,
  '-c',
  `allowedEmailDomains=${config.allowedEmailDomains}`,
  '-c',
  `monthlyBudgetUsd=${config.monthlyBudgetUsd}`,
];
```

- [x] **Step 4: 첫 테스트가 통과하는지 확인**

Run:

```bash
pnpm exec vitest run infra/test/local-production-diff.spec.ts
```

Expected: 2 tests PASS.

- [x] **Step 5: 정상 변환과 CDK 인수 테스트 추가**

Append to `infra/test/local-production-diff.spec.ts`:

```ts
describe('production diff 설정 변환', () => {
  it('전용 환경값과 공개 키를 기존 인프라 설정으로 변환한다', () => {
    const environment = readLocalProductionDiffEnvironment(
      validEnvironmentSource,
    );
    const config = createProductionInfrastructureConfig(
      environment,
      '-----BEGIN PUBLIC KEY-----\ndGVzdA==\n-----END PUBLIC KEY-----',
    );

    expect(config).toMatchObject({
      account: '123456789012',
      rootDomain: 'example.com',
      hostedZoneId: 'Z0123456789EXAMPLE',
      allowedEmailDomains: 'school.ac.kr',
      monthlyBudgetUsd: 30,
    });
  });

  it('읽기 전용 CDK diff에 필요한 context 인수를 모두 생성한다', () => {
    const environment = readLocalProductionDiffEnvironment(
      validEnvironmentSource,
    );
    const config = createProductionInfrastructureConfig(
      environment,
      '-----BEGIN PUBLIC KEY-----\ndGVzdA==\n-----END PUBLIC KEY-----',
    );
    const arguments_ = createProductionDiffArguments(
      config,
      environment.awsProfile,
    );

    expect(arguments_).toContain('--no-change-set');
    expect(arguments_).toContain('account=123456789012');
    expect(arguments_).toContain('rootDomain=example.com');
    expect(arguments_).toContain('hostedZoneId=Z0123456789EXAMPLE');
    expect(arguments_).toContain('alertEmail=owner@example.com');
    expect(arguments_).toContain('githubRepository=Dessert99/flex-thai');
    expect(arguments_).toContain(
      'mediaPublicKeyPem=-----BEGIN PUBLIC KEY-----\ndGVzdA==\n-----END PUBLIC KEY-----',
    );
    expect(arguments_).toContain('allowedEmailDomains=school.ac.kr');
    expect(arguments_).toContain('monthlyBudgetUsd=30');
  });
});
```

- [x] **Step 6: 전체 새 테스트가 통과하는지 확인**

Run:

```bash
pnpm exec vitest run infra/test/local-production-diff.spec.ts
```

Expected: 4 tests PASS.

- [x] **Step 7: Task 1 커밋**

```bash
git add infra/src/local-production-diff.ts infra/test/local-production-diff.spec.ts
git commit -m "feat: validate local infrastructure settings"
```

### Task 2: 전용 환경 파일과 production diff 실행기

**Files:**
- Create: `.env.infrastructure.example`
- Create: `infra/scripts/diff-production.ts`
- Modify: `.gitignore`
- Modify: `infra/package.json`
- Modify: `infra/tsconfig.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1의 `readLocalProductionDiffEnvironment`, `createProductionInfrastructureConfig`, `assertExpectedAwsAccount`, `createProductionDiffArguments`
- Produces: 루트 명령 `pnpm infra:diff:prod`

- [ ] **Step 1: 전용 환경 파일 예시 작성**

Create `.env.infrastructure.example`:

```dotenv
# 로컬 production CDK diff에만 사용하는 비밀이 아닌 설정입니다.
AWS_PROFILE=flex-thia-admin
AWS_ACCOUNT_ID=123456789012
ROOT_DOMAIN=example.com
HOSTED_ZONE_ID=Z0123456789EXAMPLE
ALERT_EMAIL=owner@example.com
ALLOWED_EMAIL_DOMAINS=school.ac.kr
GITHUB_REPOSITORY_CONTEXT=Dessert99/flex-thai
MONTHLY_BUDGET_USD=30
MEDIA_PUBLIC_KEY_PATH=media-public-key.pem
```

- [ ] **Step 2: 예시 파일만 Git에 포함되도록 예외 추가**

Add the exact example exception under `# env files` in `.gitignore`:

```gitignore
# env files
.env
.env.*
!.env.example
!.env.infrastructure.example
```

- [ ] **Step 3: 얇은 로컬 실행기 작성**

Create `infra/scripts/diff-production.ts`:

```ts
/** 로컬 설정으로 production CDK 변경 사항만 조회한다 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
  const environmentSource = parseEnv(
    readFileSync(localEnvironmentPath, 'utf8'),
  );
  const environment =
    readLocalProductionDiffEnvironment(environmentSource);
  const mediaPublicKeyPem = readFileSync(
    resolve(repositoryRoot, environment.mediaPublicKeyPath),
    'utf8',
  );
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
```

- [ ] **Step 4: TypeScript 검사 범위에 실행기 포함**

Modify `infra/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "exactOptionalPropertyTypes": false,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*.ts", "scripts/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 5: infra와 루트 실행 명령 추가**

Add to `infra/package.json` scripts:

```json
"diff:prod": "tsx scripts/diff-production.ts"
```

Add to root `package.json` scripts:

```json
"infra:diff:prod": "pnpm --filter @flex-thia/infra diff:prod"
```

- [ ] **Step 6: 실행기 정적 검증**

Run:

```bash
pnpm --filter @flex-thia/infra typecheck
pnpm exec eslint infra/src/local-production-diff.ts infra/scripts/diff-production.ts infra/test/local-production-diff.spec.ts
pnpm exec prettier --check .env.infrastructure.example infra/src/local-production-diff.ts infra/scripts/diff-production.ts infra/test/local-production-diff.spec.ts infra/package.json infra/tsconfig.json package.json
```

Expected: all commands exit `0`.

- [ ] **Step 7: 예시와 실제 로컬 파일의 Git 경계를 확인**

Run:

```bash
test -z "$(git check-ignore .env.infrastructure.example || true)"
git check-ignore -v .env.infrastructure.local
git check-ignore -v media-private-key.pem
```

Expected: the example file is not ignored, while both local-only paths are
matched by `.gitignore`.

- [ ] **Step 8: Task 2 커밋**

```bash
git add .env.infrastructure.example .gitignore infra/scripts/diff-production.ts infra/package.json infra/tsconfig.json package.json
git commit -m "feat: add local infrastructure diff command"
```

### Task 3: 사용 문서 갱신과 저장소 검증

**Files:**
- Modify: `.env.example`
- Modify: `docs/development/aws-deployment.md`
- Modify: `docs/superpowers/plans/2026-07-19-production-domain-routing.md`

**Interfaces:**
- Consumes: Task 2의 `.env.infrastructure.example`과 `pnpm infra:diff:prod`
- Produces: 사용자가 한 번 설정하고 반복 실행할 수 있는 로컬 배포 안내

- [ ] **Step 1: 일반 앱 환경 파일에서 인프라 설정 분리 안내**

Replace the production deployment block in `.env.example` with:

```dotenv
## 운영 인프라의 로컬 diff 값은 .env.infrastructure.example을 참고한다.
## 실제 배포 값은 .env가 아니라 GitHub production environment에 등록한다.
```

- [ ] **Step 2: AWS 배포 문서를 전용 명령으로 단순화**

Replace the manual export block under `## 최초 배포 전에 로컬에서 확인` in
`docs/development/aws-deployment.md` with:

````markdown
실제 계정으로 변경 내용만 확인하려면 전용 로컬 환경 파일을 한 번 만든다.

```bash
cp .env.infrastructure.example .env.infrastructure.local
```

`.env.infrastructure.local`에서 예시 값을 실제 GitHub production Variables와
같게 채운다. `MEDIA_PUBLIC_KEY_PATH`에는 private key가 아니라 공개 키 파일
경로를 적는다.

AWS SSO 로그인 후 전용 명령을 실행한다.

```bash
aws sso login --profile flex-thia-admin
pnpm infra:diff:prod
```

이 명령은 환경 파일과 공개 키를 검증하고, 로그인한 AWS account가 설정값과
같은지 확인한 뒤 `cdk diff --all --no-change-set`을 실행한다.
````

- [ ] **Step 3: 기존 도메인 구현 계획의 남은 실행 명령 갱신**

Update Task 4 Steps 5 and 6 in
`docs/superpowers/plans/2026-07-19-production-domain-routing.md`:

````markdown
- [ ] **Step 5: production 로컬 설정과 AWS SSO를 확인**

```bash
test -f .env.infrastructure.local
test -f media-public-key.pem
aws sso login --profile flex-thia-admin
```

Expected: 앞의 두 명령은 출력 없이 성공하고 AWS SSO 로그인이 완료된다.

- [ ] **Step 6: read-only production diff 실행**

```bash
pnpm infra:diff:prod
```

Expected:

- 실행기가 `AWS_ACCOUNT_ID`와 현재 SSO account가 같은지 확인한다.
- 세 stack의 생성 예정 자원이 표시된다.
- `--no-change-set` 때문에 임시 CloudFormation change set도 만들지 않는다.
- `cdk deploy`는 실행되지 않고 AWS 자원도 생성되지 않는다.
````

- [ ] **Step 4: 문서와 전체 저장소 검사**

Run:

```bash
pnpm exec prettier --check .env.example .env.infrastructure.example docs/development/aws-deployment.md docs/superpowers/plans/2026-07-19-production-domain-routing.md
pnpm infra:test
pnpm --filter @flex-thia/infra typecheck
pnpm format:check
pnpm lint
```

Expected:

- infra tests include 8 files and 26 tests, all PASS.
- typecheck, format, lint all exit `0`.

- [ ] **Step 5: 실제 AWS를 호출하지 않은 상태 확인**

Run:

```bash
git diff --check
git status --short
```

Expected: only the planned documentation changes are uncommitted; no
`cdk-outputs.json`, CloudFormation output, or local environment file is tracked.

- [ ] **Step 6: Task 3 커밋**

```bash
git add .env.example docs/development/aws-deployment.md docs/superpowers/plans/2026-07-19-production-domain-routing.md
git commit -m "docs: simplify local infrastructure diff"
```

### Task 4: 사용자의 로컬 production 값 등록과 실제 diff

**Files:**
- Create locally, never commit: `.env.infrastructure.local`

**Interfaces:**
- Consumes: `.env.infrastructure.example`, GitHub production Variables, `media-public-key.pem`, AWS SSO profile `flex-thia-admin`
- Produces: 사용자 검토용 세 production Stack의 read-only CDK diff

- [ ] **Step 1: 사용자에게 로컬 전용 파일 생성 안내**

Run manually:

```bash
cp .env.infrastructure.example .env.infrastructure.local
```

Replace the example values with the already registered GitHub production
Variables. Do not paste the private key into this file.

- [ ] **Step 2: 사용자가 AWS SSO 로그인과 diff 실행**

Run manually:

```bash
aws sso login --profile flex-thia-admin
pnpm infra:diff:prod
```

Expected:

- AWS account `330422589765`가 확인된다.
- `FlexThiaDataProd`, `FlexThiaApplicationProd`, `FlexThiaEdgeProd`의 변경만 표시된다.
- 이 단계에서는 AWS resource를 생성·수정·삭제하지 않는다.

- [ ] **Step 3: diff를 사용자와 검토하고 배포 전 중단**

Do not proceed if the diff contains:

- Aurora, S3, Cognito, or CloudFront replacement/deletion
- a hosted zone other than `pleasegraduate.me`
- `app.pleasegraduate.me`
- unexpected broad IAM permissions

Even if the diff is clean, do not run `cdk deploy` or the GitHub production
workflow without a separate user approval.
