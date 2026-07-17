# FLEX THIA 기초 백엔드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학교 이메일 인증, 관리자 추가 인증, 안전한 입력 업로드, 비동기 Job 생성·조회까지 이어지는 NestJS 기초 백엔드를 로컬에서 검증하고 AWS Lambda로 번들할 수 있게 만든다.

**Architecture:** pnpm workspace 안에서 AWS와 무관한 규칙을 `packages/domain`, 직렬화 계약을 `packages/contracts`, Drizzle schema와 저장소를 `packages/database`, 외부 시스템 port와 fake를 `packages/providers`, 설정 검증을 `packages/config`에 둔다. `apps/api`는 HTTP 요청을 use case에 연결하고, `apps/worker`는 SQS와 Step Functions가 호출할 얇은 진입점만 가진다.

**Tech Stack:** Node.js 22.x, pnpm 10.33.0, TypeScript 5.9.x, NestJS 11.1.28, Vitest 4.1.10, Zod 4.x, Drizzle ORM 0.45.2, PostgreSQL 16, AWS SDK for JavaScript v3, esbuild

**Source Specs:** [`2026-07-16-thai-flex-learning-service-design.md`](../specs/2026-07-16-thai-flex-learning-service-design.md), [`2026-07-17-aws-serverless-infrastructure-design.md`](../specs/2026-07-17-aws-serverless-infrastructure-design.md)

## Global Constraints

- Node.js는 로컬과 Lambda 모두 `22.x`를 사용하고 `package.json`에서 `>=22 <23`으로 제한한다.
- 패키지 매니저는 `pnpm@10.33.0`으로 고정한다.
- NestJS는 `11.1.28`, Vitest는 `4.1.10`, Drizzle ORM은 `0.45.2`로 고정하고 lockfile을 커밋한다.
- 새 TypeScript 파일에는 한국어 한 줄 파일 헤더 JSDoc을 두고, 모든 export에는 한국어 한 줄 JSDoc을 둔다.
- Vitest의 `describe`, `it`, `test` 설명은 한국어로 작성한다.
- 브라우저·API 통합 E2E 테스트와 E2E 스캐폴딩은 만들지 않는다.
- 실제 이메일, SMS, AI 유료 API는 기본 테스트와 로컬 개발에서 호출하지 않는다.
- Access token은 브라우저 저장소에 저장하지 않고 refresh token은 API host 전용 HttpOnly cookie로만 다룬다.
- `ADMIN`은 이메일이나 `+tag`로 추론하지 않고 Cognito `sub`와 DB role로 판정한다.
- 장시간 작업은 HTTP 요청에서 실행하지 않고 Job row를 만든 뒤 queue port로 전달한다.
- 이번 계획은 계정·인증·업로드·Job 기반까지만 구현하며 어휘·문제·학습 기록의 전체 ERD와 실제 AI/TTS adapter는 후속 계획으로 남긴다.

---

## 파일 구조

```text
.
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ eslint.config.mjs
├─ vitest.config.ts
├─ compose.yaml
├─ .env.example
├─ apps/
│  ├─ api/
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  ├─ nest-cli.json
│  │  └─ src/
│  │     ├─ main.ts
│  │     ├─ lambda.ts
│  │     ├─ app.module.ts
│  │     ├─ common/
│  │     ├─ health/
│  │     ├─ auth/
│  │     ├─ uploads/
│  │     └─ jobs/
│  └─ worker/
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ src/
│        ├─ job-starter.ts
│        └─ foundation-task.ts
└─ packages/
   ├─ config/
   ├─ contracts/
   ├─ domain/
   ├─ database/
   └─ providers/
```

## Task 1: pnpm workspace와 Health API

**학습 포인트:** 런타임, 프레임워크, 모노레포, Controller와 Module의 역할

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Test: `apps/api/src/health/health.controller.spec.ts`

**Interfaces:**
- Produces: `HealthController.getHealth(): { status: "ok"; service: "api" }`
- Produces: root scripts `format`, `lint`, `typecheck`, `test`, `build`, `check`

- [ ] **Step 1: 고정된 workspace 설정을 작성한다**

`package.json`의 핵심 내용:

```json
{
  "name": "flex-thia",
  "private": true,
  "packageManager": "pnpm@10.33.0",
  "engines": {
    "node": ">=22 <23"
  },
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint .",
    "typecheck": "pnpm -r typecheck",
    "test": "vitest run",
    "build": "pnpm -r build",
    "check": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.0",
    "@types/node": "^22.18.0",
    "eslint": "^9.39.0",
    "prettier": "^3.6.2",
    "typescript": "^5.9.3",
    "typescript-eslint": "^8.46.0",
    "vitest": "4.1.10"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
  - infra
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@flex-thia/config": ["packages/config/src/index.ts"],
      "@flex-thia/contracts": ["packages/contracts/src/index.ts"],
      "@flex-thia/database": ["packages/database/src/index.ts"],
      "@flex-thia/domain": ["packages/domain/src/index.ts"],
      "@flex-thia/providers": ["packages/providers/src/index.ts"],
      "@flex-thia/providers/fakes": ["packages/providers/src/fakes/index.ts"],
      "@flex-thia/providers/*": ["packages/providers/src/*"]
    }
  }
}
```

- `eslint.config.mjs`는 `typescript-eslint.config(...)`의 recommended와
  type-checked rule을 사용하고 `dist`, `coverage`, `cdk.out`,
  `packages/database/drizzle`을 ignore한다.
- `vitest.config.ts`는 node environment에서
  `apps/**/src/**/*.spec.ts`, `packages/**/src/**/*.spec.ts`,
  `infra/test/**/*.spec.ts`만 수집한다.
- `.env.example`에는 secret이 아닌 다음 로컬 기본값만 둔다.

```dotenv
NODE_ENV=development
AUTH_MODE=fake
DATABASE_MODE=local
DATABASE_URL=postgres://flex_thia:local_only_password@localhost:5432/flex_thia
AWS_REGION=ap-northeast-2
ALLOWED_ORIGINS=http://localhost:5173
PORT=3000
```

`apps/api/package.json`:

```json
{
  "name": "@flex-thia/api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run src",
    "build": "tsc -p tsconfig.json",
    "build:lambda": "node esbuild.config.mjs"
  },
  "dependencies": {
    "@nestjs/common": "11.1.28",
    "@nestjs/core": "11.1.28",
    "@nestjs/platform-express": "11.1.28",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "tsx": "^4.20.0"
  }
}
```

`apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 2: Health Controller의 실패 테스트를 작성한다**

```ts
/** API 프로세스 생존 응답을 고정하는 단위 테스트 */
import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('API 프로세스가 살아 있으면 고정된 상태를 반환한다', () => {
    const controller = new HealthController();

    expect(controller.getHealth()).toEqual({
      status: 'ok',
      service: 'api',
    });
  });
});
```

- [ ] **Step 3: 테스트가 구현 부재로 실패하는지 확인한다**

Run: `pnpm test apps/api/src/health/health.controller.spec.ts`

Expected: FAIL with `Cannot find module './health.controller.js'`

- [ ] **Step 4: 최소 NestJS 애플리케이션을 구현한다**

`apps/api/src/health/health.controller.ts`:

```ts
/** DB와 무관하게 API 프로세스의 생존 여부를 노출하는 Controller */
import { Controller, Get } from '@nestjs/common';

/** 배포와 알람에서 API 프로세스 생존을 확인한다 */
@Controller('health')
export class HealthController {
  /** 외부 의존성을 호출하지 않는 liveness 응답을 반환한다 */
  @Get()
  getHealth(): { status: 'ok'; service: 'api' } {
    return { status: 'ok', service: 'api' };
  }
}
```

`apps/api/src/app.module.ts`:

```ts
/** HTTP 기능 모듈을 하나의 NestJS 애플리케이션으로 조립한다 */
import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';

/** 기초 API의 root module */
@Module({
  controllers: [HealthController],
})
export class AppModule {}
```

`apps/api/src/main.ts`:

```ts
/** 로컬 개발용 NestJS HTTP 서버를 시작한다 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

/** 로컬에서만 사용하는 HTTP 서버 bootstrap */
export const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule);
  await app.listen(Number(process.env.PORT ?? 3000));
};

void bootstrap();
```

- [ ] **Step 5: 의존성을 설치하고 test·typecheck·build를 확인한다**

Run:

```bash
pnpm install
pnpm test apps/api/src/health/health.controller.spec.ts
pnpm --filter @flex-thia/api typecheck
pnpm --filter @flex-thia/api build
```

Expected: 1 test PASS, typecheck exit 0, `apps/api/dist` 생성

- [ ] **Step 6: 커밋한다**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json eslint.config.mjs vitest.config.ts .env.example apps/api
git commit -m "chore: bootstrap backend workspace"
```

## Task 2: 환경 설정, API 계약, AWS 독립 도메인

**학습 포인트:** 런타임 검증, schema와 type의 차이, 순수 함수와 외부 의존성 분리

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/src/api-env.ts`
- Test: `packages/config/src/api-env.spec.ts`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/src/jobs.ts`
- Create: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/jobs.spec.ts`
- Create: `packages/domain/package.json`
- Create: `packages/domain/src/thai/normalize-thai-search-text.ts`
- Create: `packages/domain/src/jobs/job.ts`
- Create: `packages/domain/src/index.ts`
- Test: `packages/domain/src/thai/normalize-thai-search-text.spec.ts`

**Interfaces:**
- Produces: `readApiEnv(source): ApiEnv`
- Produces: `createJobRequestSchema`, `jobResponseSchema`
- Produces: `normalizeThaiSearchText(value): string`
- Produces: `Job`, `JobStatus`, `JobType`, `InputType`

- [ ] **Step 1: 설정 실패 조건부터 테스트한다**

```ts
/** production에서 개발용 인증 우회를 차단하는 설정 테스트 */
import { describe, expect, it } from 'vitest';
import { readApiEnv } from './api-env.js';

describe('readApiEnv', () => {
  it('production에서 fake 인증 모드를 거부한다', () => {
    expect(() =>
      readApiEnv({
        NODE_ENV: 'production',
        AUTH_MODE: 'fake',
        DATABASE_MODE: 'data-api',
        AWS_REGION: 'ap-northeast-2',
      }),
    ).toThrow('production에서는 AUTH_MODE=fake를 사용할 수 없습니다');
  });
});
```

- [ ] **Step 2: 설정 reader를 구현한다**

```ts
/** API가 시작 전에 환경 설정 오류를 발견하도록 검증한다 */
import { z } from 'zod';

const apiEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    AUTH_MODE: z.enum(['fake', 'cognito']).default('fake'),
    DATABASE_MODE: z.enum(['local', 'data-api']).default('local'),
    AWS_REGION: z.string().default('ap-northeast-2'),
    DATABASE_URL: z.string().optional(),
    RDS_RESOURCE_ARN: z.string().optional(),
    RDS_SECRET_ARN: z.string().optional(),
    COGNITO_USER_POOL_ID: z.string().optional(),
    COGNITO_CLIENT_ID: z.string().optional(),
    INPUT_BUCKET_NAME: z.string().optional(),
    JOB_QUEUE_URL: z.string().optional(),
    ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && value.AUTH_MODE === 'fake') {
      context.addIssue({
        code: 'custom',
        message: 'production에서는 AUTH_MODE=fake를 사용할 수 없습니다',
      });
    }
  });

/** 검증이 끝난 API 환경 설정 */
export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** 환경 변수 문자열을 fail-fast 설정 객체로 변환한다 */
export const readApiEnv = (
  source: Record<string, string | undefined> = process.env,
): ApiEnv => apiEnvSchema.parse(source);
```

- [ ] **Step 3: 태국어 검색 정규화의 실패 테스트를 작성한다**

```ts
/** 원문 보존과 검색용 정규화를 분리하는 순수 함수 테스트 */
import { describe, expect, it } from 'vitest';
import { normalizeThaiSearchText } from './normalize-thai-search-text.js';

describe('normalizeThaiSearchText', () => {
  it('Unicode를 NFC로 맞추고 보이지 않는 문자와 중복 공백을 제거한다', () => {
    expect(normalizeThaiSearchText('  สวัสดี\u200B   ครับ  ')).toBe('สวัสดี ครับ');
  });
});
```

- [ ] **Step 4: 최소 정규화 규칙과 Job 계약을 구현한다**

```ts
/** 태국어 원문을 훼손하지 않고 검색·중복 판정용 문자열만 만든다 */
const INVISIBLE_CHARACTERS = /[\u200B-\u200D\uFEFF]/gu;
const REPEATED_WHITESPACE = /\s+/gu;

/** 검색과 초기 중복 판정에 쓰는 버전 1 정규화 */
export const normalizeThaiSearchText = (value: string): string =>
  value
    .normalize('NFC')
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(REPEATED_WHITESPACE, ' ')
    .trim();
```

```ts
/** HTTP와 queue에서 공유하는 Job payload를 런타임 검증한다 */
import { z } from 'zod';

/** 초기 비동기 작업 종류 */
export const jobTypeSchema = z.enum(['VOCAB_IMPORT', 'QUESTION_GENERATION']);
/** 지원 입력 형식 */
export const inputTypeSchema = z.enum(['TEXT', 'PDF', 'IMAGE']);
/** Job 전체 진행 상태 */
export const jobStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'COMPLETED_WITH_FAILURES',
  'FAILED',
  'CANCELLED',
]);
/** 중복 요청을 안전하게 합치는 Job 생성 요청 */
export const createJobRequestSchema = z.object({
  clientRequestId: z.string().uuid(),
  type: jobTypeSchema,
  uploadIds: z.array(z.string().uuid()).min(1),
});
/** API와 worker가 공유하는 Job 응답 */
export const jobResponseSchema = z.object({
  id: z.string().uuid(),
  status: jobStatusSchema,
  attempt: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

/** 검증된 Job 생성 request type */
export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;
/** 직렬화 가능한 Job response type */
export type JobResponse = z.infer<typeof jobResponseSchema>;
```

`jobs.spec.ts`에는 파일 개수 자체를 제한하지 않는 테스트를 둔다. 합계
250MB 검증은 클라이언트 size를 믿지 않고 Task 8에서 완료 검증된 upload
record의 실제 size로 수행한다.

```ts
it('입력 개수 대신 전체 용량으로 작업을 제한한다', () => {
  const result = createJobRequestSchema.safeParse({
    clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
    type: 'VOCAB_IMPORT',
    uploadIds: Array.from(
      { length: 100 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    ),
  });

  expect(result.success).toBe(true);
});
```

`packages/domain/src/jobs/job.ts`:

```ts
/** AWS와 HTTP에 의존하지 않는 비동기 Job aggregate */
/** 지원하는 초기 비동기 작업 */
export type JobType = 'VOCAB_IMPORT' | 'QUESTION_GENERATION';
/** 지원하는 원본 형식 */
export type InputType = 'TEXT' | 'PDF' | 'IMAGE';
/** Job 전체 진행 상태 */
export type JobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'COMPLETED_WITH_FAILURES'
  | 'FAILED'
  | 'CANCELLED';

/** 비동기 작업의 최소 영속 상태 */
export interface Job {
  id: string;
  requestedBy: string;
  clientRequestId: string;
  type: JobType;
  inputs: Array<{
    uploadId: string;
    inputType: InputType;
    inputKey: string;
    sizeBytes: number;
  }>;
  status: JobStatus;
  attempt: number;
  enqueuedAt: Date | null;
  createdAt: Date;
}

/** 같은 관리자의 재시도를 합칠 Job 생성 명령 */
export interface CreateJobCommand {
  requestedBy: string;
  clientRequestId: string;
  type: JobType;
  inputs: Array<{
    uploadId: string;
    inputType: InputType;
    inputKey: string;
    sizeBytes: number;
  }>;
}
```

- [ ] **Step 5: 관련 테스트와 workspace typecheck를 실행한다**

Run:

```bash
pnpm test packages/config packages/contracts packages/domain
pnpm typecheck
```

Expected: 설정·계약·정규화 테스트 PASS, typecheck exit 0

- [ ] **Step 6: 커밋한다**

```bash
git add packages/config packages/contracts packages/domain
git commit -m "feat: add backend contracts and domain foundation"
```

## Task 3: PostgreSQL과 Drizzle 기초 ERD

**학습 포인트:** table, primary key, foreign key, unique constraint, migration의 역할

**Files:**
- Create: `compose.yaml`
- Create: `packages/database/package.json`
- Create: `packages/database/tsconfig.json`
- Create: `packages/database/drizzle.local.config.ts`
- Create: `packages/database/drizzle.data-api.config.ts`
- Create: `packages/database/src/schema/identity.schema.ts`
- Create: `packages/database/src/schema/jobs.schema.ts`
- Create: `packages/database/src/schema/index.ts`
- Create: `packages/database/src/clients/local.ts`
- Create: `packages/database/src/clients/data-api.ts`
- Create: `packages/database/src/index.ts`
- Test: `packages/database/src/schema/schema.spec.ts`
- Generate: `packages/database/drizzle/*`

**Interfaces:**
- Produces: `createLocalDatabase(databaseUrl)`
- Produces: `createDataApiDatabase(config)`
- Produces tables: `users`, `authChallenges`, `stepUpChallenges`, `stepUpGrants`, `auditLogs`, `uploads`, `jobs`, `jobInputs`, `jobItems`, `providerRuns`

- [ ] **Step 1: schema 구조를 검증하는 실패 테스트를 작성한다**

```ts
/** 기초 ERD에서 보안·중복 방지 column이 사라지지 않게 고정한다 */
import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { authChallenges, jobs, users } from './index.js';

describe('기초 데이터베이스 schema', () => {
  it('사용자 신원은 변경 불가능한 cognitoSub를 가진다', () => {
    expect(Object.keys(getTableColumns(users))).toContain('cognitoSub');
  });

  it('인증 challenge는 원문 답 대신 HMAC과 만료를 저장한다', () => {
    expect(Object.keys(getTableColumns(authChallenges))).toEqual(
      expect.arrayContaining(['codeHmac', 'linkHmac', 'expiresAt']),
    );
  });

  it('Job은 clientRequestId와 queue 전달 시각을 저장한다', () => {
    expect(Object.keys(getTableColumns(jobs))).toEqual(
      expect.arrayContaining(['clientRequestId', 'enqueuedAt']),
    );
  });
});
```

- [ ] **Step 2: database package와 migration 설정을 작성한다**

`packages/database/package.json`:

```json
{
  "name": "@flex-thia/database",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run src",
    "build": "tsc -p tsconfig.json",
    "db:generate": "drizzle-kit generate --config drizzle.local.config.ts",
    "db:migrate:local": "drizzle-kit migrate --config drizzle.local.config.ts",
    "db:migrate:data-api": "drizzle-kit migrate --config drizzle.data-api.config.ts"
  },
  "dependencies": {
    "@aws-sdk/client-rds-data": "^3.900.0",
    "drizzle-orm": "0.45.2",
    "pg": "^8.16.0"
  },
  "devDependencies": {
    "@types/pg": "^8.15.0",
    "drizzle-kit": "^0.31.0"
  }
}
```

`drizzle.local.config.ts`는 `dialect: "postgresql"`,
`schema: "./src/schema/index.ts"`, `out: "./drizzle"`과
`DATABASE_URL`을 사용한다. `drizzle.data-api.config.ts`는 같은 schema와
out을 사용하고 `driver: "aws-data-api"`, `DATABASE_NAME`,
`RDS_RESOURCE_ARN`, `RDS_SECRET_ARN`을 fail-fast로 읽는다.

- [ ] **Step 3: identity schema를 구현한다**

`identity.schema.ts`에는 다음 exact column과 constraint를 둔다.

```ts
/** 사용자 신원, passwordless challenge, 관리자 추가 인증을 저장한다 */
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** 애플리케이션 권한 */
export const userRoleEnum = pgEnum('user_role', ['LEARNER', 'ADMIN']);
/** 계정 활성 상태 */
export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'DISABLED']);
/** 일회용 challenge 상태 */
export const challengeStatusEnum = pgEnum('challenge_status', [
  'PENDING',
  'SUCCEEDED',
  'EXPIRED',
  'CANCELLED',
]);

/** Cognito 신원과 애플리케이션 권한의 연결 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cognitoSub: text('cognito_sub').notNull(),
    email: text('email').notNull(),
    role: userRoleEnum('role').default('LEARNER').notNull(),
    status: userStatusEnum('status').default('ACTIVE').notNull(),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('users_cognito_sub_unique').on(table.cognitoSub),
    uniqueIndex('users_email_unique').on(table.email),
  ],
);

/** 서로 다른 브라우저에서도 Cognito custom auth session을 이어 가는 record */
export const authChallenges = pgTable(
  'auth_challenges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    emailHash: text('email_hash').notNull(),
    cognitoSessionCiphertext: text('cognito_session_ciphertext'),
    codeHmac: text('code_hmac').notNull(),
    linkHmac: text('link_hmac').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    status: challengeStatusEnum('status').default('PENDING').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('auth_challenges_email_hash_idx').on(table.emailHash)],
);

/** 관리자 민감 작업 전에 SMS 답을 확인하는 record */
export const stepUpChallenges = pgTable('step_up_challenges', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
    actionCategory: text('action_category').notNull(),
    otpHmac: text('otp_hmac').notNull(),
    attempts: integer('attempts').default(0).notNull(),
  status: challengeStatusEnum('status').default('PENDING').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/** 성공한 관리자 추가 인증을 짧게 재사용하는 grant */
export const stepUpGrants = pgTable('step_up_grants', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  actionCategory: text('action_category').notNull(),
  tokenHmac: text('token_hmac').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/** 관리자 변경을 append-only로 보존한다 */
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorSub: text('actor_sub').notNull(),
  action: text('action').notNull(),
  target: text('target').notNull(),
  summary: jsonb('summary').$type<Record<string, unknown>>().notNull(),
  requestId: text('request_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 4: Job schema를 구현한다**

```ts
/** 비동기 작업과 항목별 부분 실패, Provider 사용량을 저장한다 */
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.schema.js';

/** 지원하는 초기 Job 종류 */
export const jobTypeEnum = pgEnum('job_type', ['VOCAB_IMPORT', 'QUESTION_GENERATION']);
/** 지원하는 원본 형식 */
export const inputTypeEnum = pgEnum('input_type', ['TEXT', 'PDF', 'IMAGE']);
/** Job 전체 상태 */
export const jobStatusEnum = pgEnum('job_status', [
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'COMPLETED_WITH_FAILURES',
  'FAILED',
  'CANCELLED',
]);
/** 항목 단위 처리 상태 */
export const jobItemStatusEnum = pgEnum('job_item_status', [
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'NEEDS_ATTENTION',
  'FAILED',
]);
/** S3 object 완료 검증 상태 */
export const uploadStatusEnum = pgEnum('upload_status', [
  'PENDING',
  'VERIFIED',
  'REJECTED',
]);

/** 사전 서명 정책과 실제 S3 object 검증 결과를 연결한다 */
export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id').references(() => users.id).notNull(),
    inputType: inputTypeEnum('input_type').notNull(),
    objectKey: text('object_key').notNull(),
    declaredContentType: text('declared_content_type').notNull(),
    sizeBytes: integer('size_bytes'),
    status: uploadStatusEnum('status').default('PENDING').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('uploads_object_key_unique').on(table.objectKey)],
);

/** API 요청과 queue 실행을 연결하는 aggregate root */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestedBy: uuid('requested_by').references(() => users.id).notNull(),
    clientRequestId: uuid('client_request_id').notNull(),
    type: jobTypeEnum('type').notNull(),
    status: jobStatusEnum('status').default('QUEUED').notNull(),
    attempt: integer('attempt').default(0).notNull(),
    enqueuedAt: timestamp('enqueued_at', { withTimezone: true }),
    failureCode: text('failure_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('jobs_requester_client_request_unique').on(
      table.requestedBy,
      table.clientRequestId,
    ),
    index('jobs_status_created_at_idx').on(table.status, table.createdAt),
  ],
);

/** 파일 개수를 고정하지 않고 각 원본과 총 용량을 Job에 연결한다 */
export const jobInputs = pgTable('job_inputs', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobId: uuid('job_id').references(() => jobs.id).notNull(),
  uploadId: uuid('upload_id').references(() => uploads.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/** 한 항목 실패가 다른 항목을 막지 않게 상태를 분리한다 */
export const jobItems = pgTable('job_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobId: uuid('job_id').references(() => jobs.id).notNull(),
  status: jobItemStatusEnum('status').default('PENDING').notNull(),
  sourceRef: text('source_ref'),
  result: jsonb('result').$type<Record<string, unknown>>(),
  errorCode: text('error_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/** 외부 Provider의 품질과 비용을 나중에 비교할 실행 기록 */
export const providerRuns = pgTable(
  'provider_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobItemId: uuid('job_item_id').references(() => jobItems.id).notNull(),
    operation: text('operation').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    attempt: integer('attempt').notNull(),
    usage: jsonb('usage').$type<Record<string, number>>().notNull(),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 12, scale: 6 }).notNull(),
    success: boolean('success').notNull(),
    errorCode: text('error_code'),
    providerRequestId: text('provider_request_id'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('provider_runs_item_operation_attempt_unique').on(
      table.jobItemId,
      table.operation,
      table.attempt,
    ),
  ],
);
```

- [ ] **Step 5: local PostgreSQL과 두 DB client factory를 구현한다**

`compose.yaml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: flex_thia
      POSTGRES_USER: flex_thia
      POSTGRES_PASSWORD: local_only_password
    ports:
      - '5432:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U flex_thia -d flex_thia']
      interval: 2s
      timeout: 2s
      retries: 15
```

`clients/local.ts`와 `clients/data-api.ts`:

```ts
/** 로컬 PostgreSQL과 production Data API의 Drizzle client를 만든다 */
import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { drizzle as createDataApiDrizzle } from 'drizzle-orm/aws-data-api/pg';
import { drizzle as createNodePgDrizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../schema/index.js';

/** 로컬 Docker PostgreSQL용 Drizzle client */
export const createLocalDatabase = (databaseUrl: string) => {
  const client = new Pool({ connectionString: databaseUrl });
  return createNodePgDrizzle({ client, schema });
};

/** Aurora Data API 연결 정보 */
export interface DataApiDatabaseConfig {
  region: string;
  database: string;
  resourceArn: string;
  secretArn: string;
}

/** Lambda에서 TCP 연결 없이 Aurora를 호출하는 Drizzle client */
export const createDataApiDatabase = (config: DataApiDatabaseConfig) =>
  createDataApiDrizzle(new RDSDataClient({ region: config.region }), {
    database: config.database,
    resourceArn: config.resourceArn,
    secretArn: config.secretArn,
    schema,
  });
```

- [ ] **Step 6: schema test, migration 생성, local 적용을 확인한다**

Run:

```bash
pnpm test packages/database/src/schema/schema.spec.ts
pnpm --filter @flex-thia/database db:generate
docker compose up -d postgres
pnpm --filter @flex-thia/database db:migrate:local
pnpm typecheck
```

Expected: schema tests PASS, SQL migration 생성, migration exit 0, typecheck exit 0

- [ ] **Step 7: 커밋한다**

```bash
git add compose.yaml packages/database
git commit -m "feat: add foundation database schema"
```

## Task 4: Idempotent Job use case와 저장소 port

**학습 포인트:** use case, port와 adapter, idempotency, DB와 queue의 원자성 한계

**Files:**
- Create: `packages/domain/src/jobs/job.repository.ts`
- Create: `packages/domain/src/jobs/job.queue.ts`
- Create: `packages/domain/src/jobs/create-job.service.ts`
- Create: `packages/domain/src/uploads/upload.repository.ts`
- Create: `packages/providers/src/fakes/fake-job.repository.ts`
- Create: `packages/providers/src/fakes/fake-job.queue.ts`
- Create: `packages/providers/src/fakes/fake-upload.repository.ts`
- Create: `packages/providers/src/fakes/index.ts`
- Test: `packages/domain/src/jobs/create-job.service.spec.ts`

**Interfaces:**
- Produces: `JobRepository.createOrFind(command): Promise<{ job; created }>`
- Produces: `JobRepository.markEnqueued(jobId, enqueuedAt): Promise<Job>`
- Produces: `JobQueue.send({ jobId, attempt }): Promise<void>`
- Produces: `CreateJobService.execute(command): Promise<Job>`
- Produces: `UploadRepository.findVerifiedOwnedByIds(ownerId, uploadIds)`

- [ ] **Step 1: 같은 요청이 Job과 queue 전송을 중복하지 않는 테스트를 작성한다**

```ts
/** DB unique constraint와 queue 재시도를 함께 모델링하는 use case 테스트 */
import { describe, expect, it } from 'vitest';
import { FakeJobQueue, FakeJobRepository } from '@flex-thia/providers/fakes';
import { CreateJobService } from './create-job.service.js';

describe('CreateJobService', () => {
  it('같은 사용자와 clientRequestId 요청은 같은 Job을 반환하고 한 번만 전송한다', async () => {
    const repository = new FakeJobRepository();
    const queue = new FakeJobQueue();
    const service = new CreateJobService(repository, queue, () => new Date('2026-07-17T00:00:00.000Z'));
    const command = {
      requestedBy: '8f47b4d5-97d6-4596-af72-16456be51be8',
      clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
      type: 'VOCAB_IMPORT' as const,
      inputs: [
        {
          uploadId: '77a1e8ff-7c85-4739-9004-647e12e34b65',
          inputType: 'TEXT' as const,
          inputKey: 'inputs/example.txt',
          sizeBytes: 128,
        },
      ],
    };

    const first = await service.execute(command);
    const second = await service.execute(command);

    expect(second.id).toBe(first.id);
    expect(queue.messages).toEqual([{ jobId: first.id, attempt: 0 }]);
  });
});
```

- [ ] **Step 2: port와 최소 use case를 구현한다**

```ts
/** 영속 기술과 무관하게 Job 중복 생성과 queue 전달을 표현한다 */
export interface JobRepository {
  createOrFind(command: CreateJobCommand): Promise<{ job: Job; created: boolean }>;
  markEnqueued(jobId: string, enqueuedAt: Date): Promise<Job>;
  findById(jobId: string): Promise<Job | null>;
}

/** queue 구현체가 받아야 하는 최소 메시지 */
export interface JobQueue {
  send(message: { jobId: string; attempt: number }): Promise<void>;
}

/** 검증된 S3 object만 Job 입력으로 사용할 수 있게 조회한다 */
export interface UploadRepository {
  findVerifiedOwnedByIds(ownerId: string, uploadIds: string[]): Promise<
    Array<{
      uploadId: string;
      inputType: InputType;
      inputKey: string;
      sizeBytes: number;
    }>
  >;
}

/** HTTP 요청을 idempotent Job과 queue message로 바꾼다 */
export class CreateJobService {
  constructor(
    private readonly repository: JobRepository,
    private readonly queue: JobQueue,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** queue 전송 성공 뒤에만 enqueuedAt을 남겨 실패한 요청은 안전하게 재시도한다 */
  async execute(command: CreateJobCommand): Promise<Job> {
    const { job } = await this.repository.createOrFind(command);
    if (job.enqueuedAt) return job;

    await this.queue.send({ jobId: job.id, attempt: job.attempt });
    return this.repository.markEnqueued(job.id, this.now());
  }
}
```

- [ ] **Step 3: fake repository와 queue를 구현한다**

Fake는 `(requestedBy, clientRequestId)` 복합 key로 같은 Job을 돌려주고,
`messages` 배열에 실제 전송만 기록한다. queue가 예외를 던진 경우
`enqueuedAt`은 비어 있어 다음 `execute`가 다시 전송할 수 있어야 한다.

- [ ] **Step 4: 성공·queue 실패 후 재시도 테스트를 실행한다**

Run: `pnpm test packages/domain/src/jobs/create-job.service.spec.ts`

Expected: 중복 요청과 queue 실패 복구 테스트 PASS

- [ ] **Step 5: 커밋한다**

```bash
git add packages/domain packages/providers
git commit -m "feat: add idempotent job creation"
```

## Task 5: Drizzle Job adapter와 NestJS Job API

**학습 포인트:** repository 구현, dependency injection, HTTP status와 domain 오류 분리

**Files:**
- Create: `packages/database/src/repositories/drizzle-job.repository.ts`
- Test: `packages/database/src/repositories/drizzle-job.repository.spec.ts`
- Create: `packages/providers/src/aws/sqs-job.queue.ts`
- Test: `packages/providers/src/aws/sqs-job.queue.spec.ts`
- Create: `apps/api/src/jobs/jobs.controller.ts`
- Create: `apps/api/src/jobs/jobs.service.ts`
- Create: `apps/api/src/jobs/jobs.module.ts`
- Create: `apps/api/src/common/auth/current-user.decorator.ts`
- Test: `apps/api/src/jobs/jobs.controller.spec.ts`
- Test: `apps/api/src/jobs/jobs.service.spec.ts`

**Interfaces:**
- Consumes: `JobRepository`, `JobQueue`, `UploadRepository`, `createJobRequestSchema`
- Produces: `POST /jobs -> 202 JobResponse`
- Produces: `GET /jobs/:id -> JobResponse`

- [ ] **Step 1: Controller가 요청 사용자를 command에 넣는 실패 테스트를 작성한다**

```ts
/** 인증 사용자가 다른 사용자의 Job을 만들 수 없게 Controller 경계를 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import { JobsController } from './jobs.controller.js';

describe('JobsController', () => {
  it('JWT에서 얻은 사용자 id를 Job 생성 command에 넣는다', async () => {
    const execute = vi.fn().mockResolvedValue({
      id: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
      status: 'QUEUED',
      attempt: 0,
      createdAt: new Date('2026-07-17T00:00:00.000Z'),
    });
    const controller = new JobsController({ execute } as never, {} as never);

    await controller.create(
      { userId: '8f47b4d5-97d6-4596-af72-16456be51be8' },
      {
        clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
        type: 'VOCAB_IMPORT',
        uploadIds: ['77a1e8ff-7c85-4739-9004-647e12e34b65'],
      },
    );

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedBy: '8f47b4d5-97d6-4596-af72-16456be51be8',
      }),
    );
  });
});
```

- [ ] **Step 2: JobsService가 검증된 upload만 command로 바꾸게 구현한다**

`JobsService.create`는 요청 사용자의 `uploadIds`를
`UploadRepository.findVerifiedOwnedByIds`로 조회한다. 반환 개수가 요청과
다르면 `UPLOAD_NOT_VERIFIED`, 실제 `sizeBytes` 합계가 250MB를 넘으면
`JOB_INPUT_TOO_LARGE`로 거부한다. 그 뒤에만 `CreateJobService.execute`에
검증된 `inputs`를 전달한다. 다른 사용자의 upload, `PENDING`, `REJECTED`는
모두 같은 `UPLOAD_NOT_VERIFIED`로 처리해 object 존재 여부를 노출하지 않는다.

```ts
it('검증된 upload의 실제 합계가 250MB를 넘으면 Job을 만들지 않는다', async () => {
  const records = Array.from({ length: 11 }, (_, index) => ({
      uploadId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      ownerId: '8f47b4d5-97d6-4596-af72-16456be51be8',
      inputType: 'PDF' as const,
      inputKey: `inputs/owner/${index}.pdf`,
      sizeBytes: 25 * 1024 * 1024,
      status: 'VERIFIED',
  }));
  const uploads = new FakeUploadRepository(records);
  const createJob = { execute: vi.fn() };
  const service = new JobsService(uploads, createJob as never, {} as never);

  await expect(
    service.create({
      requestedBy: '8f47b4d5-97d6-4596-af72-16456be51be8',
      clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
      type: 'VOCAB_IMPORT',
      uploadIds: records.map((record) => record.uploadId),
    }),
  ).rejects.toMatchObject({ code: 'JOB_INPUT_TOO_LARGE' });
  expect(createJob.execute).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Drizzle Job repository를 unique constraint 기준으로 구현한다**

`createOrFind`는 insert에 `onConflictDoNothing`을 사용하고, 삽입 여부와
무관하게 `(requestedBy, clientRequestId)`로 한 번 조회한다. `markEnqueued`는
`enqueued_at is null`인 row만 갱신한다. 구현체는 local과 Data API client가
공통으로 제공하는 `select`, `insert`, `update` method만 받는다. 새 Job과
모든 `job_inputs`는 한 transaction에서 insert하고, 충돌로 기존 Job을 읽은
경우 입력을 다시 추가하지 않는다.

- [ ] **Step 4: SQS adapter를 구현하고 body가 jobId만 갖는지 테스트한다**

```ts
/** 큰 입력을 queue에 복제하지 않고 Job 식별자만 전달한다 */
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { JobQueue } from '@flex-thia/domain';

/** AWS SQS Standard Queue adapter */
export class SqsJobQueue implements JobQueue {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
  ) {}

  /** worker가 DB에서 최신 상태를 읽도록 작은 message만 보낸다 */
  async send(message: { jobId: string; attempt: number }): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
      }),
    );
  }
}
```

- [ ] **Step 5: Controller와 Module을 구현한다**

`apps/api/src/common/auth/current-user.decorator.ts`:

```ts
/** 인증 guard가 request에 넣은 애플리케이션 사용자를 Controller에 전달한다 */
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** API use case가 신뢰하는 최소 사용자 정보 */
export interface AuthenticatedUser {
  userId: string;
  sub: string;
  role: 'LEARNER' | 'ADMIN';
}

/** HTTP request에서 검증이 끝난 사용자를 꺼낸다 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser =>
    context.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user,
);
```

```ts
/** 인증된 관리자의 Job 생성과 조회를 HTTP 계약으로 제공한다 */
import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { CreateJobRequest } from '@flex-thia/contracts';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { JobsService } from './jobs.service.js';

/** 비동기 콘텐츠 작업 API */
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  /** 긴 작업을 기다리지 않고 queue 접수 결과를 반환한다 */
  @Post()
  @HttpCode(202)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateJobRequest) {
    return this.jobsService.create({ ...body, requestedBy: user.userId });
  }

  /** 관리자 화면 polling용 현재 Job 상태를 반환한다 */
  @Get(':jobId')
  get(@CurrentUser() user: AuthenticatedUser, @Param('jobId') jobId: string) {
    return this.jobsService.getOwnedJob(user.userId, jobId);
  }
}
```

- [ ] **Step 6: Job 관련 단위 테스트와 typecheck를 실행한다**

Run:

```bash
pnpm test packages/database/src/repositories packages/providers/src/aws apps/api/src/jobs
pnpm typecheck
```

Expected: repository query shape, SQS body, Controller 테스트 PASS

- [ ] **Step 7: 커밋한다**

```bash
git add packages/database packages/providers apps/api/src/jobs
git commit -m "feat: add job api and queue adapter"
```

## Task 6: Passwordless 인증과 관리자 step-up domain

**학습 포인트:** passwordless challenge, HMAC, 암호화, 만료·시도 횟수, 추가 인증

**Files:**
- Create: `packages/domain/src/auth/challenge.ts`
- Create: `packages/domain/src/auth/challenge.repository.ts`
- Create: `packages/domain/src/auth/passwordless-auth.service.ts`
- Create: `packages/domain/src/auth/step-up.service.ts`
- Create: `packages/providers/src/crypto/challenge-crypto.ts`
- Create: `packages/providers/src/fakes/fake-identity-provider.ts`
- Create: `packages/providers/src/fakes/fake-challenge.repository.ts`
- Create: `packages/providers/src/fakes/fake-sms-sender.ts`
- Test: `packages/providers/src/crypto/challenge-crypto.spec.ts`
- Test: `packages/domain/src/auth/passwordless-auth.service.spec.ts`
- Test: `packages/domain/src/auth/step-up.service.spec.ts`

**Interfaces:**
- Produces: `ChallengeCrypto.hashAnswer`, `verifyAnswer`, `encryptSession`, `decryptSession`
- Produces: `IdentityProvider.start`, `respond`, `refresh`, `revoke`
- Produces: `PasswordlessAuthService.start`, `verifyCode`, `verifyLink`
- Produces: `VerifyChallengeAnswerService.execute`
- Produces: `StepUpService.request`, `verify`

공통 token 결과는 다음으로 고정한다.

```ts
/** Cognito 구현과 fake가 동일하게 반환하는 token 묶음 */
export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  subject: string;
  email: string;
}
```

- [ ] **Step 1: 원문 답을 저장하지 않는 crypto 테스트를 작성한다**

```ts
/** 짧은 OTP도 secret pepper 없이는 검증할 수 없게 고정한다 */
import { describe, expect, it } from 'vitest';
import { ChallengeCrypto } from './challenge-crypto.js';

describe('ChallengeCrypto', () => {
  it('같은 답은 검증하지만 저장 문자열에 원문을 포함하지 않는다', () => {
    const crypto = new ChallengeCrypto(Buffer.alloc(32, 1), 'test-pepper');
    const stored = crypto.hashAnswer('123456', Buffer.alloc(16, 2));

    expect(stored).not.toContain('123456');
    expect(crypto.verifyAnswer('123456', stored)).toBe(true);
    expect(crypto.verifyAnswer('654321', stored)).toBe(false);
  });

  it('암호화한 Cognito session을 복호화한다', () => {
    const crypto = new ChallengeCrypto(Buffer.alloc(32, 1), 'test-pepper');
    expect(crypto.decryptSession(crypto.encryptSession('session-value'))).toBe('session-value');
  });
});
```

- [ ] **Step 2: AES-256-GCM과 HMAC-SHA256 구현을 작성한다**

저장 문자열 형식은 `base64(salt).base64(hmac)`과
`base64(iv).base64(tag).base64(ciphertext)`로 고정한다. 비교에는
`timingSafeEqual`을 사용하고, 잘못된 형식은 `false` 또는 domain 오류로
종료한다.

- [ ] **Step 3: 만료와 최대 5회 실패 테스트를 먼저 작성한다**

Passwordless는 10분, step-up은 5분, step-up grant는 10분이다. 다섯 번째
오답 뒤 challenge 상태가 `CANCELLED`가 되고 같은 답을 다시 제출해도
성공하지 않는 `VerifyChallengeAnswerService` 테스트를 작성한다.

- [ ] **Step 4: Passwordless와 step-up use case를 구현한다**

Passwordless `start`는 학교 이메일 allowlist 검사 후 IdentityProvider를
호출한다. Cognito 사용자가 없으면 API adapter가 message 발송을 억제한
`AdminCreateUser`로 먼저 만들고, 반환된 `challengeId`와 Cognito session 중 session만 암호화해
challenge row에 연결한다. `verifyCode`와 `verifyLink`는 저장된 session을
복호화하고 `IdentityProvider.respond`에 challenge ID, answer 종류, answer를
전달한다. Cognito Verify trigger가 `VerifyChallengeAnswerService`를
호출해 HMAC·만료·횟수를 판정하고, 하나가 성공하면 같은 row를
`SUCCEEDED`로 바꿔 다른 답도 즉시 무효화한다. API는 Cognito token 발급
성공 뒤 `sub` 기준 사용자 row를 upsert한다.

Step-up `request`는 `ADMIN`과 검증된 전화번호를 먼저 확인한 뒤 6자리 OTP를
생성해 HMAC만 저장하고 SMS port로 보낸다. `verify` 성공 시 raw token은 한
번만 반환하고 DB에는 token HMAC과 만료만 저장한다.

- [ ] **Step 5: domain과 crypto 테스트를 실행한다**

Run:

```bash
pnpm test packages/domain/src/auth packages/providers/src/crypto
pnpm typecheck
```

Expected: 성공, 만료, 최대 실패, 재사용 방지, 암복호화 테스트 PASS

- [ ] **Step 6: 커밋한다**

```bash
git add packages/domain/src/auth packages/providers/src/crypto packages/providers/src/fakes
git commit -m "feat: add passwordless and step-up domain"
```

## Task 7: Cognito custom challenge와 인증 HTTP 경계

**학습 포인트:** Cognito trigger, access/refresh token, API Gateway authorizer, CSRF

**Files:**
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/auth/define-auth-challenge.ts`
- Create: `apps/worker/src/auth/create-auth-challenge.ts`
- Create: `apps/worker/src/auth/verify-auth-challenge.ts`
- Test: `apps/worker/src/auth/*.spec.ts`
- Create: `packages/providers/src/aws/cognito-identity.provider.ts`
- Create: `packages/providers/src/aws/ses-challenge.sender.ts`
- Create: `packages/providers/src/aws/sns-sms.sender.ts`
- Create: `packages/database/src/repositories/drizzle-user.repository.ts`
- Create: `packages/database/src/repositories/drizzle-auth-challenge.repository.ts`
- Create: `packages/database/src/repositories/drizzle-step-up.repository.ts`
- Test: `packages/database/src/repositories/drizzle-auth.repository.spec.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/cognito-authorizer.guard.ts`
- Create: `apps/api/src/auth/application-role.guard.ts`
- Create: `apps/api/src/auth/require-role.decorator.ts`
- Create: `apps/api/src/auth/csrf.guard.ts`
- Test: `apps/api/src/auth/*.spec.ts`

**Interfaces:**
- Produces: `POST /auth/challenges`
- Produces: `POST /auth/challenges/:id/code`
- Produces: `POST /auth/challenges/:id/link`
- Produces: `POST /auth/refresh`
- Produces: `POST /auth/logout`
- Produces: Cognito trigger handlers `handler(event)`

- [ ] **Step 1: 이메일 링크 GET이 인증을 완료하지 않는 테스트를 작성한다**

Controller에는 링크 확인 화면용 token 검사 GET을 만들지 않는다. GET은
프론트 정적 route가 담당하고, 실제 교환은
`POST /auth/challenges/:id/link`만 제공한다는 Controller metadata 테스트를
작성한다.

- [ ] **Step 2: worker package를 추가한다**

`apps/worker/package.json`은 Node ESM package로 만들고 `typecheck`,
`test`, `build`, `build:lambda` script를 둔다. 초기 의존성은
`@aws-sdk/client-sesv2`, `@types/aws-lambda`, `esbuild`이며 workspace의
domain·database·providers source는 root TypeScript path로 참조한다.

- [ ] **Step 3: 세 Cognito trigger를 순수 handler로 구현한다**

`DefineAuthChallenge`는 첫 custom challenge를 만들고 성공 시 token 발급을
선택한다. `CreateAuthChallenge`는 code·link token을 생성하고 HMAC row를
저장한 뒤 SES를 호출한다. `VerifyAuthChallengeResponse`는 challenge ID로
row를 읽어 `VerifyChallengeAnswerService`로 만료·시도 횟수·HMAC을
검증한다. trigger 테스트는 AWS 호출을 fake port로 대체한다.

- [ ] **Step 4: identity용 Drizzle adapter를 구현한다**

`DrizzleUserRepository`는 Cognito `sub` unique key로 사용자를 upsert하고,
role·status 조회와 phone verification 시각 갱신을 제공한다.
`DrizzleAuthChallengeRepository`는 challenge 생성, encrypted session 연결,
실패 횟수의 조건부 증가, `PENDING → SUCCEEDED|CANCELLED|EXPIRED` 전이만
허용한다. `DrizzleStepUpRepository`는 raw OTP와 grant token을 받지 않고
HMAC·만료·action category만 저장한다. repository 테스트는 동시 update가
이미 terminal인 row를 되돌리지 않는 query 조건을 검증한다.

- [ ] **Step 5: HTTP auth Controller를 구현한다**

```ts
/** passwordless 인증과 cookie 수명주기를 HTTP로 노출한다 */
import { Body, Controller, HttpCode, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  PasswordlessAuthService,
  type TokenSet,
} from '@flex-thia/domain';

/** 공개 인증 endpoint */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: PasswordlessAuthService) {}

  /** 계정 존재 여부를 숨긴 동일 응답으로 이메일 challenge를 시작한다 */
  @Post('challenges')
  @HttpCode(202)
  start(@Body() body: { email: string }) {
    return this.auth.start(body.email);
  }

  /** 숫자 code를 일회용 Cognito challenge에 응답한다 */
  @Post('challenges/:challengeId/code')
  verifyCode(
    @Param('challengeId') challengeId: string,
    @Body() body: { code: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.finish(this.auth.verifyCode(challengeId, body.code), response);
  }

  /** 사용자 POST만 일회용 링크 token을 교환한다 */
  @Post('challenges/:challengeId/link')
  verifyLink(
    @Param('challengeId') challengeId: string,
    @Body() body: { token: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.finish(this.auth.verifyLink(challengeId, body.token), response);
  }

  private async finish(tokensPromise: Promise<TokenSet>, response: Response) {
    const tokens = await tokensPromise;
    response.cookie('refresh_token', tokens.refreshToken, {
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }
}
```

- [ ] **Step 6: authorizer claim, DB role, CSRF guard를 구현한다**

Authorizer guard는 API Gateway request context의 `sub`, `token_use`,
`client_id`를 읽고 `token_use !== "access"` 또는 client ID 불일치면
거부한다. 검증된 `sub`로 DB 사용자를 읽어 `DISABLED`를 거부하고
`AuthenticatedUser`를 request에 붙인다. `@RequireRole('ADMIN')` route는
DB role이 `ADMIN`일 때만 통과한다. `AUTH_MODE=fake`는 development와
test에서만 `x-dev-user-sub`를 허용한다.

CSRF guard는 refresh·logout에서 `Origin`이 exact allowlist에 있고
`x-csrf-protection: 1` header가 있어야 통과시킨다. 두 endpoint는 POST만
제공하고 `credentials` CORS는 allowlist origin에만 연다.

- [ ] **Step 7: 인증·보안 단위 테스트를 실행한다**

Run:

```bash
pnpm test apps/worker/src/auth apps/api/src/auth packages/providers/src/aws packages/database/src/repositories/drizzle-auth.repository.spec.ts
pnpm typecheck
```

Expected: link GET 부재, access token claim, production fake 거부, CSRF, cookie
속성, trigger 상태 전이 테스트 PASS

- [ ] **Step 8: 커밋한다**

```bash
git add apps/worker/src/auth apps/api/src/auth packages/providers/src/aws packages/database/src/repositories
git commit -m "feat: add cognito passwordless authentication"
```

## Task 8: 입력 업로드와 관리자 step-up API

**학습 포인트:** presigned POST, MIME과 file signature 차이, 최소 권한, 민감 작업 재인증

**Files:**
- Create: `packages/domain/src/uploads/upload-policy.service.ts`
- Create: `packages/providers/src/aws/s3-upload.provider.ts`
- Create: `packages/providers/src/fakes/fake-upload.provider.ts`
- Create: `packages/database/src/repositories/drizzle-upload.repository.ts`
- Test: `packages/database/src/repositories/drizzle-upload.repository.spec.ts`
- Create: `apps/api/src/uploads/uploads.controller.ts`
- Create: `apps/api/src/uploads/uploads.module.ts`
- Create: `apps/api/src/auth/step-up.controller.ts`
- Create: `apps/api/src/auth/phone-verification.controller.ts`
- Create: `apps/api/src/auth/require-step-up.guard.ts`
- Create: `apps/api/src/commands/bootstrap-admin.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/jobs/jobs.controller.ts`
- Test: corresponding `*.spec.ts`

**Interfaces:**
- Produces: `POST /uploads/policies`
- Produces: `POST /uploads/:uploadId/complete`
- Produces: `POST /auth/step-up/challenges`
- Produces: `POST /auth/step-up/challenges/:id/verify`
- Produces: `POST /auth/phone/challenges`
- Produces: `POST /auth/phone/challenges/:id/verify`
- Produces: `pnpm --filter @flex-thia/api bootstrap-admin --sub=<cognito-sub>`

- [ ] **Step 1: 25MB를 넘는 요청이 S3 호출 전에 실패하는 테스트를 작성한다**

허용 형식은 `TEXT`, `PDF`, `IMAGE`, 파일당 25MB, PDF 30페이지, Job 합계
250MB다. 테스트는 25MB+1 byte에서 `UPLOAD_TOO_LARGE`, 암호화 PDF에서
`ENCRYPTED_PDF_NOT_ALLOWED`를 기대한다.

- [ ] **Step 2: S3 POST policy adapter를 구현한다**

`UploadPolicyService`는 UUID upload row를 `PENDING`으로 먼저 만들고 object
key를 `inputs/{ownerId}/{uploadId}`로 고정한 뒤 S3 adapter를 호출한다.
`DrizzleUploadRepository`는 PENDING 생성, owner·ID 조회, 실제 metadata를
사용한 `PENDING → VERIFIED|REJECTED` 조건부 전이,
`findVerifiedOwnedByIds`를 구현한다.

```ts
/** 브라우저가 private Input S3에 제한된 object만 올리게 서명한다 */
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

/** S3 upload policy 생성 결과 */
export interface UploadPolicy {
  uploadId: string;
  url: string;
  fields: Record<string, string>;
  expiresAt: string;
}

/** content-length-range와 key를 S3가 직접 강제하는 adapter */
export class S3UploadProvider {
  constructor(
    private readonly client: S3Client,
    private readonly bucketName: string,
  ) {}

  /** 10분 동안 한 key와 최대 25MB만 허용한다 */
  async createPolicy(input: {
    uploadId: string;
    objectKey: string;
    contentType: string;
  }): Promise<UploadPolicy> {
    const expiresIn = 600;
    const result = await createPresignedPost(this.client, {
      Bucket: this.bucketName,
      Key: input.objectKey,
      Expires: expiresIn,
      Fields: { 'Content-Type': input.contentType },
      Conditions: [
        ['content-length-range', 1, 25 * 1024 * 1024],
        ['eq', '$key', input.objectKey],
        ['eq', '$Content-Type', input.contentType],
      ],
    });
    return {
      uploadId: input.uploadId,
      ...result,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }
}
```

- [ ] **Step 3: 완료 검증을 별도로 구현한다**

완료 요청은 `HeadObject`의 실제 size와 content type을 다시 검사한다.
worker 검증은 첫 bytes의 file signature, PDF 암호화 여부, page count를
검사한다. 업로드 정책 검증과 완료 검증 중 하나라도 실패하면 Job을 만들지
않는다. 검증 성공 시에만 S3에서 읽은 실제 `sizeBytes`를 upload row에
저장하고 `VERIFIED`로 바꾼다. 클라이언트가 보낸 size와 object key를 Job
합계 계산에 사용하지 않는다.

- [ ] **Step 4: step-up Controller와 guard를 구현한다**

민감 action category는 `AI_BULK_CREATE`, `CONTENT_PUBLISH`,
`CONTENT_VISIBILITY`, `ROLE_CHANGE`, `PROVIDER_CONFIG`로 고정한다. 검증
성공 시 raw grant token을 한 번 반환하고, 이후 민감 API는
`x-step-up-token` HMAC과 사용자·action·10분 만료를 확인한다.
`POST /jobs`에는 `@RequireRole('ADMIN')`과
`@RequireStepUp('AI_BULK_CREATE')`를 함께 적용한다. 업로드 정책 생성과 완료
확인은 `ADMIN` role을 요구하지만 실제 AI Job 시작 전까지 step-up grant를
소비하지 않는다.

- [ ] **Step 5: 관리자 전화번호 검증과 bootstrap command를 구현한다**

전화번호 등록은 E.164 입력만 받고 Cognito의 phone attribute verification
code 흐름을 사용한다. Cognito가 code를 성공 처리한 뒤에만 DB의
`phoneVerifiedAt`을 갱신한다. 이후 step-up SMS 수신 번호는 API body나
DB의 평문 번호가 아니라 Cognito의 verified `phone_number`에서 읽는다.

`bootstrap-admin`은 이미 존재하는 정확한 Cognito `sub` 하나만 `ADMIN`으로
바꾸고 `audit_logs`에 actor `SYSTEM_BOOTSTRAP`, action
`ROLE_BOOTSTRAPPED`, 대상 user ID와 request ID를 기록한다. 이메일과
`+tag` 입력은 받지 않는다. 없는 사용자, 이미 다른 대상에 사용한 bootstrap,
audit 저장 실패는 role 변경을 확정하지 않는 테스트를 작성한다.

`apps/api/package.json`에는 다음 script를 추가한다.

```json
{
  "scripts": {
    "bootstrap-admin": "tsx src/commands/bootstrap-admin.ts"
  }
}
```

- [ ] **Step 6: 업로드·step-up·bootstrap 테스트를 실행한다**

Run:

```bash
pnpm test packages/domain/src/uploads packages/providers/src/aws/s3-upload.provider.spec.ts apps/api/src/uploads apps/api/src/auth apps/api/src/commands
pnpm typecheck
```

Expected: 크기·형식·재검증, grant 사용자/action binding 테스트 PASS

- [ ] **Step 7: 커밋한다**

```bash
git add packages/domain/src/uploads packages/providers apps/api/src/uploads apps/api/src/auth apps/api/src/commands
git commit -m "feat: add secure uploads and admin step-up"
```

## Task 9: Lambda 진입점과 기초 worker 수직 흐름

**학습 포인트:** Lambda handler, SQS at-least-once, deterministic Step Functions execution

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/lambda.ts`
- Create: `apps/api/esbuild.config.mjs`
- Modify: `apps/worker/package.json`
- Create: `apps/worker/src/job-starter.ts`
- Create: `apps/worker/src/foundation-task.ts`
- Create: `apps/worker/esbuild.config.mjs`
- Test: `apps/api/src/lambda.spec.ts`
- Test: `apps/worker/src/job-starter.spec.ts`
- Test: `apps/worker/src/foundation-task.spec.ts`

**Interfaces:**
- Produces: API `handler(event, context)`
- Produces: SQS `jobStarterHandler(event)`
- Produces: Step Functions `foundationTaskHandler({ jobId, attempt })`

- [ ] **Step 1: duplicate SQS delivery 테스트를 작성한다**

같은 `{ jobId, attempt }` 두 메시지가 들어와도 state machine execution name은
`${jobId}-${attempt}`로 같아야 한다. AWS SDK가
`ExecutionAlreadyExists`를 반환하면 handler는 성공으로 처리하고 다른 오류는
throw하는 테스트를 작성한다.

- [ ] **Step 2: Job Starter handler를 구현한다**

```ts
/** SQS의 at-least-once 전달을 deterministic workflow 실행으로 바꾼다 */
import {
  SFNClient,
  StartExecutionCommand,
} from '@aws-sdk/client-sfn';
import type { SQSEvent } from 'aws-lambda';

/** 같은 Job attempt는 Step Functions에서 한 번만 시작한다 */
export const createJobStarterHandler =
  (client: SFNClient, stateMachineArn: string) =>
  async (event: SQSEvent): Promise<void> => {
    for (const record of event.Records) {
      const message = JSON.parse(record.body) as { jobId: string; attempt: number };
      try {
        await client.send(
          new StartExecutionCommand({
            stateMachineArn,
            name: `${message.jobId}-${message.attempt}`,
            input: JSON.stringify(message),
          }),
        );
      } catch (error) {
        if ((error as { name?: string }).name !== 'ExecutionAlreadyExists') throw error;
      }
    }
  };
```

- [ ] **Step 3: NestJS Lambda adapter와 esbuild를 구현한다**

`lambda.ts`는 `@codegenie/serverless-express` server instance를 module
전역에 cache하고 첫 요청에만 Nest app을 초기화한다. `main.ts`의 local
bootstrap과 `lambda.ts`의 serverless bootstrap은 같은 `AppModule`과
global validation/error filter 설정 함수를 사용한다.

`apps/api/package.json`에는 `@codegenie/serverless-express`,
`@types/aws-lambda`, `esbuild`를 추가한다. `apps/worker/package.json`은
다음 script와 의존성을 사용한다.

```json
{
  "name": "@flex-thia/worker",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run src",
    "build": "tsc -p tsconfig.json",
    "build:lambda": "node esbuild.config.mjs"
  },
  "dependencies": {
    "@aws-sdk/client-sfn": "^3.900.0",
    "@aws-sdk/client-sqs": "^3.900.0"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.0",
    "esbuild": "^0.25.0"
  }
}
```

- [ ] **Step 4: foundation worker가 Job 상태를 바꾸게 구현한다**

foundation task는 `QUEUED → RUNNING → COMPLETED`만 검증한다. 실제 OCR,
generation, verification, TTS는 호출하지 않는다. 이미 terminal 상태면
no-op하고, 허용되지 않은 상태 전이는 domain 오류로 실패한다.

- [ ] **Step 5: handler 테스트와 bundle 생성을 확인한다**

Run:

```bash
pnpm test apps/api/src/lambda.spec.ts apps/worker/src
pnpm --filter @flex-thia/api build:lambda
pnpm --filter @flex-thia/worker build:lambda
```

Expected: duplicate delivery 테스트 PASS,
`apps/api/dist/lambda.js`, `apps/worker/dist/*.js` 생성

- [ ] **Step 6: 커밋한다**

```bash
git add apps/api apps/worker
git commit -m "feat: add lambda and worker entrypoints"
```

## Task 10: 운영 기본값, 개발 문서, 전체 검증

**학습 포인트:** 구조화 로그, 민감 정보 마스킹, readiness와 liveness 차이, 검증 게이트

**Files:**
- Create: `apps/api/src/common/errors/domain-exception.filter.ts`
- Create: `apps/api/src/common/logging/structured-logger.ts`
- Create: `apps/api/src/health/readiness.service.ts`
- Test: corresponding `*.spec.ts`
- Create: `docs/development/backend-foundation.md`
- Modify: `package.json`

**Interfaces:**
- Produces: domain error `{ code, message, requestId }`
- Produces: JSON log fields `service`, `requestId`, `userSubHash`, `jobId`, `errorCode`
- Produces: `GET /ready` with DB readiness

- [ ] **Step 1: token과 개인정보가 로그에서 빠지는 테스트를 작성한다**

입력에 `authorization`, `cookie`, `email`, `phoneNumber`, `otp`, `token`이
있어도 logger 결과에는 key 자체가 없고 request ID와 error code만 남는지
테스트한다.

- [ ] **Step 2: error filter, logger, readiness를 구현한다**

`GET /health`는 외부 의존성을 호출하지 않는다. `GET /ready`만 DB에
`select 1`을 실행하고 Data API가 25초 안에 깨어나지 않으면
`503 DB_RESUMING`과 `Retry-After: 3`을 반환한다. error filter는 stack을
production 응답에 포함하지 않는다.

- [ ] **Step 3: 초보자용 로컬 실행 문서를 작성한다**

문서에는 다음 실제 명령과 각 프로세스의 정체를 설명한다.

```bash
corepack enable
pnpm install
docker compose up -d postgres
pnpm --filter @flex-thia/database db:migrate:local
pnpm --filter @flex-thia/api dev
curl http://localhost:3000/health
```

`NestJS=HTTP 프로그램`, `PostgreSQL=데이터를 디스크에 보존하는 별도
프로그램`, `Docker=로컬 PostgreSQL 실행 환경`, `Lambda build=AWS가
호출할 JavaScript 묶음`으로 설명한다.

- [ ] **Step 4: 전체 검증을 fresh run한다**

Run:

```bash
pnpm format
pnpm check
git diff --check
```

Expected: format, lint, typecheck, unit tests, build 모두 exit 0; whitespace error 0

- [ ] **Step 5: 최종 커밋한다**

```bash
git add package.json apps packages docs/development/backend-foundation.md
git commit -m "docs: add backend foundation guide"
```

## 완료 기준

- `pnpm check`가 통과한다.
- `GET /health`는 DB 없이 응답하고 `GET /ready`는 DB 상태를 구분한다.
- production에서 fake 인증과 fake Provider가 시작되지 않는다.
- 학교 이메일 challenge는 code와 link 중 하나만 한 번 성공한다.
- refresh와 logout은 exact Origin과 CSRF header 없이는 cookie를 사용하지 않는다.
- 관리자 민감 action은 최근 step-up grant를 요구한다.
- 25MB 초과 업로드는 S3 POST policy와 완료 검증 양쪽에서 거부된다.
- 같은 `clientRequestId`는 같은 Job을 반환하고 queue 중복 전송을 확정하지 않는다.
- duplicate SQS message는 같은 Step Functions execution name을 사용한다.
- API와 worker Lambda bundle이 생성된다.
- 실제 AI·TTS 유료 호출과 E2E 스캐폴딩이 없다.
