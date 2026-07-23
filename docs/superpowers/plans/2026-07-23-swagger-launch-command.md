# Swagger Launch Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 저장소 루트의 `pnpm run swagger`로 로컬 API를 시작하고 준비된 Swagger UI를 기본 브라우저에서 자동으로 연다.

**Architecture:** 일반 개발 서버와 Swagger 실행 명령이 `startLocalApiServer`를 공유해 NestJS 설정 중복을 막는다. Swagger 실행 함수는 서버 시작·브라우저 실행·오류 출력을 주입받아 단위 테스트하고, 얇은 진입점과 workspace script가 이를 호출한다.

**Tech Stack:** Node.js 22, TypeScript ESM, NestJS 11, Vitest 4, pnpm workspace, `open` 11.0.0

## Global Constraints

- 기본 포트는 `3000`이고 `PORT` 환경 변수가 있으면 해당 포트를 사용한다.
- 브라우저는 서버 listen이 성공한 뒤 `http://localhost:<port>/api/docs`를 연다.
- Swagger 명령은 Docker Compose나 PostgreSQL을 시작하지 않는다.
- Swagger 명령은 비운영 환경 설정으로 시작하지만 기존 Lambda의 운영 정책은 바꾸지 않는다.
- 브라우저 실행 실패 시 서버는 유지하고 직접 열 URL을 출력한다.
- hot reload와 브라우저·API E2E 테스트는 추가하지 않는다.
- 새·변경 코드는 `conventions/comment-convention.md`를 따르고 테스트 설명은 한국어로 작성한다.

---

### Task 1: 로컬 API 서버 부트스트랩 공유

**Files:**
- Create: `backend/api/src/local-server.spec.ts`
- Create: `backend/api/src/local-server.ts`
- Modify: `backend/api/src/main.ts`

**Interfaces:**
- Produces: `LocalApiServerOptions` — `nodeEnv?: string`, `port?: number`
- Produces: `startLocalApiServer(options?: LocalApiServerOptions): Promise<void>`

- [ ] **Step 1: 공용 로컬 서버 조립의 실패 테스트를 작성한다**

```ts
/** 로컬 진입점이 같은 NestJS 서버 설정을 사용하는지 검증한다 */
import { NestFactory } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApplicationModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { startLocalApiServer } from './local-server.js';

vi.mock('@nestjs/core', () => ({
  NestFactory: { create: vi.fn() },
}));
vi.mock('./app.module.js', () => ({
  createApplicationModule: vi.fn(() => 'application-module'),
}));
vi.mock('./app.setup.js', () => ({
  configureApp: vi.fn(),
}));

describe('로컬 API 서버', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('선택한 환경과 포트로 공통 애플리케이션을 시작한다', async () => {
    const app = { listen: vi.fn(async () => undefined) };
    vi.mocked(NestFactory.create).mockResolvedValue(app as never);

    await startLocalApiServer({ nodeEnv: 'development', port: 4100 });

    expect(createApplicationModule).toHaveBeenCalledOnce();
    expect(configureApp).toHaveBeenCalledWith(app, undefined, 'development');
    expect(app.listen).toHaveBeenCalledWith(4100);
  });
});
```

- [ ] **Step 2: 구현 파일 부재로 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @flex-thia/api exec vitest run src/local-server.spec.ts`

Expected: FAIL because `local-server.ts` does not exist

- [ ] **Step 3: 공용 로컬 서버 함수를 작성한다**

```ts
/** 로컬 실행 진입점들이 같은 NestJS 서버 설정을 공유하게 한다 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createApplicationModule } from './app.module.js';
import { configureApp } from './app.setup.js';

/** 로컬 서버 진입점이 환경과 포트만 선택하게 한다 */
export interface LocalApiServerOptions {
  nodeEnv?: string;
  port?: number;
}

/** 로컬 NestJS 서버를 공통 설정으로 시작한다 */
export const startLocalApiServer = async ({
  nodeEnv = process.env.NODE_ENV,
  port = Number(process.env.PORT ?? 3000),
}: LocalApiServerOptions = {}): Promise<void> => {
  const app = await NestFactory.create(createApplicationModule());
  configureApp(app, undefined, nodeEnv);
  await app.listen(port);
};
```

- [ ] **Step 4: 기존 개발 진입점이 공용 함수를 호출하게 한다**

```ts
/** 로컬 개발용 NestJS HTTP 서버를 시작한다 */
import { startLocalApiServer } from './local-server.js';

void startLocalApiServer();
```

- [ ] **Step 5: 새 단위 테스트와 typecheck를 통과시킨다**

Run: `pnpm --filter @flex-thia/api exec vitest run src/local-server.spec.ts src/app.setup.spec.ts`

Expected: 두 테스트 파일 PASS

Run: `pnpm --filter @flex-thia/api typecheck`

Expected: exit code 0

- [ ] **Step 6: 공용 부트스트랩 변경을 커밋한다**

```bash
git add backend/api/src/local-server.spec.ts backend/api/src/local-server.ts backend/api/src/main.ts
git commit -m "refactor: share local api bootstrap"
```

### Task 2: Swagger 실행 함수와 단위 테스트

**Files:**
- Create: `backend/api/src/swagger-launcher.spec.ts`
- Create: `backend/api/src/swagger-launcher.ts`
- Create: `backend/api/src/swagger.ts`
- Modify: `backend/api/src/openapi/openapi.ts`
- Modify: `backend/api/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `startLocalApiServer(options?: LocalApiServerOptions): Promise<void>`
- Produces: `SWAGGER_UI_PATH = 'api/docs'`
- Produces: `SwaggerLauncherOptions` — `port?`, `startServer?`, `openPage?`, `reportError?`
- Produces: `createSwaggerUrl(port: number): string`
- Produces: `launchSwagger(options?: SwaggerLauncherOptions): Promise<void>`

- [ ] **Step 1: `open`을 API 개발 의존성으로 추가한다**

Run: `pnpm --filter @flex-thia/api add -D open@11.0.0`

Expected: `backend/api/package.json`에 `"open": "11.0.0"`이 추가되고 lockfile이 갱신됨

- [ ] **Step 2: URL 생성의 실패 테스트를 작성한다**

```ts
/** Swagger 편의 명령의 서버·브라우저 실행 순서를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { createSwaggerUrl } from './swagger-launcher.js';

describe('Swagger 실행 명령', () => {
  it('기본 포트와 사용자 지정 포트로 문서 URL을 만든다', () => {
    expect(createSwaggerUrl(3000)).toBe('http://localhost:3000/api/docs');
    expect(createSwaggerUrl(4100)).toBe('http://localhost:4100/api/docs');
  });
});
```

- [ ] **Step 3: URL 실행기 부재로 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @flex-thia/api exec vitest run src/swagger-launcher.spec.ts`

Expected: FAIL because `swagger-launcher.ts` does not exist

- [ ] **Step 4: OpenAPI 경로 상수와 최소 URL 생성기를 작성한다**

`backend/api/src/openapi/openapi.ts`에서 다음 상수를 추가하고
`OpenApiPaths.ui`와 `resolveOpenApiPaths`가 이를 사용하게 한다.

```ts
/** Swagger 실행기와 route 설정이 같은 UI 경로를 사용하게 한다 */
export const SWAGGER_UI_PATH = 'api/docs' as const;
```

`backend/api/src/swagger-launcher.ts`:

```ts
/** 로컬 API 준비 후 Swagger UI를 기본 브라우저로 연다 */
import { SWAGGER_UI_PATH } from './openapi/openapi.js';

/** 지정 포트의 Swagger UI 절대 URL을 만든다 */
export const createSwaggerUrl = (port: number): string =>
  `http://localhost:${port}/${SWAGGER_UI_PATH}`;
```

- [ ] **Step 5: URL 생성 테스트를 통과시킨다**

Run: `pnpm --filter @flex-thia/api exec vitest run src/swagger-launcher.spec.ts`

Expected: 1 test PASS

- [ ] **Step 6: 서버와 브라우저 순서·서버 실패 테스트를 추가한다**

`swagger-launcher.spec.ts`의 import에 `launchSwagger`를 추가하고 다음
테스트를 같은 `describe`에 추가한다.

```ts
  it('서버가 준비된 뒤 브라우저를 연다', async () => {
    const events: string[] = [];

    await launchSwagger({
      port: 4100,
      startServer: vi.fn(async () => {
        events.push('server');
      }),
      openPage: vi.fn(async () => {
        events.push('browser');
      }),
    });

    expect(events).toEqual(['server', 'browser']);
  });

  it('서버 시작이 실패하면 브라우저를 열지 않는다', async () => {
    const openPage = vi.fn(async () => undefined);

    await expect(
      launchSwagger({
        startServer: vi.fn(async () => {
          throw new Error('listen failed');
        }),
        openPage,
      }),
    ).rejects.toThrow('listen failed');
    expect(openPage).not.toHaveBeenCalled();
  });
```

- [ ] **Step 7: 실행 함수 부재로 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @flex-thia/api exec vitest run src/swagger-launcher.spec.ts`

Expected: FAIL because `launchSwagger` is not exported

- [ ] **Step 8: 성공 흐름과 서버 실패 전파를 구현한다**

`swagger-launcher.ts`에 `open`, 로컬 서버 import와 다음 interface·함수를
추가한다.

```ts
type StartServer = (options?: LocalApiServerOptions) => Promise<void>;
type OpenPage = (url: string) => Promise<unknown>;
type ReportError = (message: string) => void;

/** 테스트가 실행 부수효과를 대신 주입할 수 있게 한다 */
export interface SwaggerLauncherOptions {
  port?: number;
  startServer?: StartServer;
  openPage?: OpenPage;
  reportError?: ReportError;
}

/** 로컬 API를 준비한 뒤 Swagger UI를 연다 */
export const launchSwagger = async ({
  port = Number(process.env.PORT ?? 3000),
  startServer = startLocalApiServer,
  openPage = open,
}: SwaggerLauncherOptions = {}): Promise<void> => {
  await startServer({ nodeEnv: 'development', port });
  await openPage(createSwaggerUrl(port));
};
```

- [ ] **Step 9: 성공 흐름과 서버 실패 테스트를 통과시킨다**

Run: `pnpm --filter @flex-thia/api exec vitest run src/swagger-launcher.spec.ts`

Expected: 3 tests PASS

- [ ] **Step 10: 브라우저 실패 복구 테스트를 추가한다**

```ts
  it('브라우저 실행이 실패하면 URL을 안내하고 서버를 유지한다', async () => {
    const reportError = vi.fn();

    await expect(
      launchSwagger({
        startServer: vi.fn(async () => undefined),
        openPage: vi.fn(async () => {
          throw new Error('open failed');
        }),
        reportError,
      }),
    ).resolves.toBeUndefined();
    expect(reportError).toHaveBeenCalledWith(
      '브라우저를 열지 못했습니다. 직접 접속하세요: http://localhost:3000/api/docs',
    );
  });
});
```

- [ ] **Step 11: 브라우저 오류가 전파되어 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @flex-thia/api exec vitest run src/swagger-launcher.spec.ts`

Expected: FAIL with `open failed`

- [ ] **Step 12: 브라우저 오류만 복구하도록 최소 구현한다**

```ts
/** 로컬 API를 준비한 뒤 Swagger UI를 열고 브라우저 실패만 복구한다 */
export const launchSwagger = async ({
  port = Number(process.env.PORT ?? 3000),
  startServer = startLocalApiServer,
  openPage = open,
  reportError = console.error,
}: SwaggerLauncherOptions = {}): Promise<void> => {
  await startServer({ nodeEnv: 'development', port });
  const url = createSwaggerUrl(port);

  try {
    await openPage(url);
  } catch {
    reportError(`브라우저를 열지 못했습니다. 직접 접속하세요: ${url}`);
  }
};
```

- [ ] **Step 13: 얇은 Swagger 진입점을 작성한다**

```ts
/** 로컬 Swagger 확인용 API 서버와 브라우저를 시작한다 */
import { launchSwagger } from './swagger-launcher.js';

void launchSwagger();
```

- [ ] **Step 14: Swagger 실행 단위 테스트를 통과시킨다**

Run: `pnpm --filter @flex-thia/api exec vitest run src/swagger-launcher.spec.ts src/openapi/openapi.spec.ts`

Expected: 두 테스트 파일 PASS

- [ ] **Step 15: Swagger 실행기를 커밋한다**

```bash
git add backend/api/src/swagger-launcher.spec.ts backend/api/src/swagger-launcher.ts backend/api/src/swagger.ts backend/api/src/openapi/openapi.ts backend/api/package.json pnpm-lock.yaml
git commit -m "feat: add swagger browser launcher"
```

### Task 3: Workspace 명령 연결과 전체 검증

**Files:**
- Modify: `backend/api/package.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `backend/api/src/swagger.ts`
- Produces: root `pnpm run swagger`

- [ ] **Step 1: API와 루트 script를 추가한다**

`backend/api/package.json`:

```json
"swagger": "tsx src/swagger.ts"
```

루트 `package.json`:

```json
"swagger": "pnpm --filter @flex-thia/api run swagger"
```

- [ ] **Step 2: 정적 검증을 실행한다**

Run: `pnpm structure:check`

Expected: exit code 0

Run: `pnpm lint`

Expected: exit code 0

Run: `pnpm typecheck`

Expected: exit code 0

Run: `pnpm --filter @flex-thia/api test`

Expected: 모든 API 단위 테스트 PASS

Run: `pnpm --filter @flex-thia/api build`

Expected: exit code 0

- [ ] **Step 3: 실제 명령으로 Swagger 응답을 확인한다**

Run: `PORT=3100 pnpm run swagger`

Expected: API가 3100 포트에서 시작되고 기본 브라우저가
`http://localhost:3100/api/docs`를 연다.

다른 터미널에서 Run:
`curl --fail --silent --output /dev/null http://localhost:3100/api/docs`

Expected: exit code 0

검증 후 실행 중인 명령에 `Ctrl+C`를 입력한다.

- [ ] **Step 4: script 연결을 커밋한다**

```bash
git add backend/api/package.json package.json
git commit -m "chore: add swagger workspace command"
```
