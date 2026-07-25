# Frontend MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Vite React frontend MVP that exposes every active learner and administrator workflow in the completed NestJS MVP without changing the backend.

**Architecture:** Use progressive Feature-Sliced Design with the dependency direction `app -> pages -> features -> shared`. TanStack Router owns URL and access boundaries, TanStack Query owns server state, React Hook Form owns forms, `@flex-thia/contracts` validates every public API payload, and a memory-only auth session coordinates single-flight refresh.

**Tech Stack:** React 19, Vite, TypeScript strict mode, Tailwind CSS latest stable, shadcn/ui CLI, TanStack Router, TanStack Query, React Hook Form, Zod 4 through `@flex-thia/contracts`, Vitest, Testing Library, MSW, Steiger.

## Global Constraints

- Work on the current branch and worktree; do not create another branch, worktree, or PR.
- Do not modify any backend file or backend API contract.
- Preserve unrelated user changes and inspect `git status --short` before every commit.
- Before the first dependency installation or `dlx` command, show the exact
  dependency list and resolved versions and obtain explicit package-install
  approval. Existing read-only/run scripts may be used for contract inspection
  and verification.
- Use the active NestJS controllers, generated Swagger document, and `@flex-thia/contracts` as the API contract; older product documents do not override them.
- Do not generate a second set of OpenAPI TypeScript models. Use
  `@flex-thia/contracts` for runtime/type contracts and Swagger for paths,
  security, headers, status codes, and media types. Map a DTO only when a View
  has a concrete display-model difference.
- Use only the progressive FSD layers `app`, `pages`, `features`, and `shared`; do not create `entities`, `widgets`, or `processes` without a new design approval.
- Use only project-defined semantic design-token classes for value-bearing
  visual styles in authored components: color, typography, spacing, size,
  radius, elevation, and motion. Structural utilities such as display,
  positioning, overflow, and grid composition remain allowed. Raw Tailwind
  scales, palette colors, hex/RGB values, and arbitrary-value classes are
  forbidden outside `theme.css` and reviewed generated shadcn files.
- Before creating any component or invoking shadcn CLI, inspect
  `frontend/web/src/shared/ui` for an existing primitive or wrapper. Reuse it
  first; if it lacks a domain-neutral capability, extend it through a
  project-authored wrapper under the frontend component convention rather than
  duplicating or casually editing vendored output.
- Keep the access token in memory only; never write it to LocalStorage, SessionStorage, or IndexedDB.
- Do not add E2E tests or E2E runner configuration.
- Test `describe`, `it`, and `test` descriptions must be Korean.
- Follow `conventions/comment-convention.md` for every directly authored or modified source file; shadcn CLI output and generated route trees remain generated-code exceptions.
- Use named exports, function declarations for components and named functions,
  and `type` by default. Do not use TypeScript `enum`, `any`, non-null
  assertions, or unchecked type assertions; `as const` and `satisfies` remain
  allowed because they preserve or check inference rather than overriding it.
- Preserve API `null` as an explicit empty value and use `undefined` only for
  absent optional frontend input; do not normalize one into the other without a
  named mapper and test.
- Expose a slice through its root `index.ts` only when another slice consumes
  it. Do not create recursive barrels or import another slice's internal
  segment.
- Keep server state in Query, form state in React Hook Form, URL-shareable
  filters in Router search, and transient interaction state local. Do not mirror
  any of them through `useEffect`; Effects are reserved for external-system
  synchronization such as timers, browser focus, and subscriptions.
- Reusable inputs use one ownership mode per use case; do not add simultaneous
  controlled/uncontrolled APIs speculatively. Use compound components only
  when consumers must compose multiple coordinated parts.
- Extract a custom Hook only when it owns a coherent React lifecycle or has a
  second real consumer. Extract constants for contract-independent repeated or
  named business meaning, not every literal.
- Throw only at transport, runtime-contract, and session-control boundaries.
  Page/Feature mutation handlers translate expected errors into state and do
  not `catch` merely to rethrow.
- Render validation and action-recovery errors inline at the nearest owner. Use
  toast only for confirmed cross-screen/background feedback, never duplicate
  the same error inline and in a toast, and reserve Error Boundaries for
  unexpected render failures.
- Set the document language to Korean, mark Thai fragments with `lang='th'`,
  preserve original Thai strings, and use `lucide-react` as the only authored
  icon source. Every icon-only control requires a Korean accessible name.
- Treat desktop as the primary target, fully support auth and learner flows from 360px, and keep administrator screens usable but desktop-optimized.
- Do not implement dark mode, optimistic updates, snapshot tests, external frontend error monitoring, or speculative shared abstractions.
- A Task is complete only after its focused test, workspace typecheck, relevant architecture check, and reviewer-visible completion criteria pass.

## Approved Dependency Set

The execution agent must resolve and display the exact stable versions before installation. `tailwindcss` and `@tailwindcss/vite` must resolve to the latest stable release available on the execution date.

**Runtime dependencies**

- `react`
- `react-dom`
- `@flex-thia/contracts@workspace:*`
- `@tanstack/react-query`
- `@tanstack/react-router`
- `react-hook-form`
- `@hookform/resolvers`
- `zod`
- `class-variance-authority`
- `clsx`
- `tailwind-merge`
- `lucide-react`
- `sonner`

**Development dependencies**

- `vite`
- `@vitejs/plugin-react`
- `@tanstack/router-plugin`
- `typescript`
- `@types/react`
- `@types/react-dom`
- `tailwindcss`
- `@tailwindcss/vite`
- `vitest`
- `@vitest/coverage-v8`
- `jsdom`
- `@testing-library/react`
- `@testing-library/user-event`
- `@testing-library/jest-dom`
- `msw`
- `steiger`
- `@feature-sliced/steiger-plugin`
- `eslint-plugin-react-hooks`
- `eslint-plugin-jsx-a11y`

**CLI-only dependency**

- `shadcn@latest`, invoked with `pnpm --filter @flex-thia/web dlx shadcn@latest`

The shadcn registry may add direct component dependencies whose package names
change with registry versions. They are not silently pre-approved by this list.
Before the first `init`/`add`, inspect the resolved CLI help/registry output,
show every direct dependency and exact version it will add, and obtain package
approval. Repeat that gate if a later component introduces a new dependency.

---

## Planned Source Map

```text
frontend/web/
├── components.json
├── index.html
├── package.json
├── steiger.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
└── src/
    ├── app/
    │   ├── providers/AppProviders.tsx
    │   ├── routes/
    │   ├── styles/theme.css
    │   └── router.ts
    ├── pages/
    ├── features/
    ├── shared/
    │   ├── api/
    │   ├── config/
    │   ├── lib/
    │   ├── test/
    │   └── ui/
    ├── main.tsx
    ├── routeTree.gen.ts
    └── vite-env.d.ts
```

The detailed Tasks below introduce only the slices and segments that have concrete consumers.

## Contract Baseline and Endpoint Ownership

Before Task 1 changes any file, start the existing local Swagger server:

```bash
pnpm swagger
```

Inspect `http://localhost:3000/api/openapi.json` and compare it with the active
controllers and `@flex-thia/contracts`. Stop and ask the user if any operation,
security requirement, status code, or schema differs from this plan. Do not
change the backend to make it match the plan.

All business endpoints below are relative to the existing `/api/v1` prefix.

| Active operation | Frontend owner |
| --- | --- |
| `POST /auth/login` | Task 7 login Page |
| `POST /auth/mfa/totp/challenge` | Task 7 login-TOTP Page |
| `POST /auth/mfa/totp/setup`, `POST /auth/mfa/totp/setup/verify` | Task 7 enrollment-TOTP Page |
| `POST /auth/refresh`, `GET /me` | Task 5 auth session |
| `POST /auth/logout` | Task 5 session command and Task 7 logout UI |
| `GET /questions`, `GET /questions/:questionId` | Tasks 9-10 learner question Pages |
| `POST /questions/:questionId/attempts`, `GET /me/question-attempts` | Task 10 solving/history |
| `PUT/DELETE /me/saved-questions/:questionId` | Task 10 saved-question Feature |
| `GET /vocabularies`, `GET /vocabularies/:vocabularyId`, `GET /vocabularies/:vocabularyId/questions` | Task 11 vocabulary Pages |
| `GET /me/saved-vocabularies`, `PUT/DELETE /me/saved-vocabularies/:vocabularyId` | Task 11 saved-vocabulary Page/Feature |
| `POST /admin/content-imports`, `GET /admin/content-imports`, `GET /admin/content-imports/:importId` | Task 12 content-import Pages |
| `POST /admin/media-assets/audio-upload-requests`, `POST /admin/media-assets/:mediaAssetId/complete`, `GET /admin/media-assets/:mediaAssetId` | Task 13 audio-upload Feature |
| `GET /admin/questions`, `GET /admin/questions/:questionId` | Task 14 question-management Pages |
| `POST /admin/questions/:questionId/versions`, `PUT /admin/question-versions/:versionId` | Task 15 clone/JSON replacement |
| `POST /admin/question-versions/:versionId/validate`, `POST /admin/question-versions/:versionId/publish`, `POST /admin/question-versions/:versionId/invalidate` | Task 15 question state Feature |
| `POST /admin/questions/:questionId/hide`, `POST /admin/questions/:questionId/restore` | Task 15 question state Feature |
| `GET /admin/vocabularies`, `GET /admin/vocabularies/:vocabularyId`, `PUT /admin/vocabularies/:vocabularyId` | Task 16 vocabulary-management Pages |
| `POST /admin/vocabularies/:vocabularyId/publish`, `POST /admin/vocabularies/:vocabularyId/hide`, `POST /admin/vocabularies/:vocabularyId/restore` | Task 16 vocabulary state Feature |
| `GET /health`, `GET /ready` | Operational probes only; no user-facing screen |

The existing `jobs` and `uploads` controllers are not imported into the active
application module and are explicitly deferred by the backend MVP design. They
must not receive frontend screens or client modules in this MVP.

---

### Task 1: Lock the frontend conventions and scaffold the web workspace

**Files:**

- Modify: `conventions/structure-convention.md`
- Modify: `conventions/frontend/component-convention.md`
- Modify: `scripts/check-project-structure.mjs`
- Modify: `package.json`
- Modify: `tsconfig.base.json`
- Create: `frontend/web/package.json`
- Create: `frontend/web/index.html`
- Create: `frontend/web/tsconfig.json`
- Create: `frontend/web/tsconfig.app.json`
- Create: `frontend/web/tsconfig.node.json`
- Create: `frontend/web/vite.config.ts`
- Create: `frontend/web/src/vite-env.d.ts`
- Create: `frontend/web/src/main.tsx`
- Create: `frontend/web/src/app/styles/theme.css`

**Interfaces:**

- Consumes: root pnpm workspace patterns `frontend/*` and `@flex-thia/contracts`.
- Produces: package `@flex-thia/web`, alias `@/* -> frontend/web/src/*`, and scripts `dev`, `build`, `typecheck`, `test`, `coverage`, `architecture:check`.

**Existing-decision basis:** Progressive FSD, latest Tailwind CSS, no empty speculative folders, and convention documents as the single structural source.

**Minimum implementation:** One buildable `frontend/web` Vite entry, workspace
scripts, and updated structural rules; no Router, product Page, or unused
folder.

- [ ] **Step 1: Make the structure check fail for the missing approved workspace**

Add `frontend/web/package.json`, `frontend/web/tsconfig.json`, and `frontend/web/src/main.tsx` to `requiredFiles` in `scripts/check-project-structure.mjs`, then run:

```bash
pnpm structure:check
```

Expected: FAIL naming the three missing frontend files.

- [ ] **Step 2: Update the conventions before adding source code**

Replace the frontend `components/hooks/types/utils` layout with `ui/api/model/lib`, document slice-root public APIs, `.test.ts(x)` frontend tests, Page-local ownership, shadcn wrapper extensions, and the `app -> pages -> features -> shared` rule. Keep backend `.spec.ts` rules unchanged.

- [ ] **Step 3: Obtain package approval and install only the approved set**

First run read-only version resolution:

```bash
pnpm view react version
pnpm view vite version
pnpm view tailwindcss version
pnpm view @tanstack/react-query version
pnpm view @tanstack/react-router version
pnpm view steiger version
pnpm view @feature-sliced/steiger-plugin version
```

Show the result to the user and wait for explicit approval. After approval, create `frontend/web/package.json`, then install the Approved Dependency Set with exact versions. Do not use a caret for `steiger` or `@feature-sliced/steiger-plugin`.

- [ ] **Step 4: Create the minimal Vite workspace**

`frontend/web/src/main.tsx` must render only a semantic-token-backed bootstrap placeholder:

```tsx
/** Vite가 React 애플리케이션을 브라우저 root에 연결한다 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app/styles/theme.css';

/** 잘못된 HTML 진입점은 빈 화면 대신 시작 단계에서 드러낸다 */
function requireRootElement() {
  const rootElement = document.getElementById('root');

  if (!(rootElement instanceof HTMLElement)) {
    throw new Error('React root element를 찾을 수 없습니다.');
  }

  return rootElement;
}

/** 프론트엔드 provider와 router가 연결되기 전 최소 진입 화면 */
function BootstrapPlaceholder() {
  return <main className='bg-surface text-primary'>FLEX THIA</main>;
}

createRoot(requireRootElement()).render(
  <StrictMode>
    <BootstrapPlaceholder />
  </StrictMode>,
);
```

- [ ] **Step 5: Verify the workspace**

Run:

```bash
pnpm structure:check
pnpm --filter @flex-thia/web typecheck
pnpm --filter @flex-thia/web build
```

Expected: all PASS and Vite emits `frontend/web/dist`.

**Completion conditions:**

- The workspace participates in pnpm recursive commands.
- No product screen, future layer, or unused UI primitive exists.
- Tailwind is the latest stable version approved by the user.

**Expected commit:**

```bash
git add conventions/structure-convention.md conventions/frontend/component-convention.md scripts/check-project-structure.mjs package.json tsconfig.base.json frontend/web
git commit -m "chore(frontend): scaffold web workspace"
```

---

### Task 2: Enforce FSD, strict linting, and the frontend test harness

**Files:**

- Modify: `eslint.config.mjs`
- Modify: `vitest.config.ts`
- Modify: `package.json`
- Modify: `frontend/web/package.json`
- Create: `frontend/web/steiger.config.ts`
- Create: `frontend/web/vitest.config.ts`
- Create: `frontend/web/src/shared/test/setupTests.ts`
- Create: `frontend/web/src/shared/test/server.ts`
- Create: `frontend/web/src/shared/test/renderWithProviders.tsx`
- Create: `frontend/web/src/shared/test/renderWithProviders.test.tsx`
- Create: `frontend/web/src/shared/test/index.ts`
- Create: `scripts/eslint-rules/semantic-tailwind-tokens.mjs`
- Create: `scripts/eslint-rules/semantic-tailwind-tokens.spec.mjs`

**Interfaces:**

- Produces: `renderWithProviders(ui, options)`, `createTestQueryClient()`, MSW `server`, `pnpm architecture:check`, and browser-like Vitest execution through jsdom.

**Existing-decision basis:** Steiger owns FSD checks, ESLint owns code quality, tests use real libraries and mock only the HTTP boundary.

**Minimum implementation:** The test provider, MSW lifecycle, Steiger boundary,
and agreed ESLint rules only; no product mocks, generic factory framework, or
extra lint package.

- [ ] **Step 1: Write the failing provider-harness test**

```tsx
describe('renderWithProviders', () => {
  it('각 테스트에 독립적인 QueryClient를 제공한다', () => {
    const first = createTestQueryClient();
    const second = createTestQueryClient();

    expect(first).not.toBe(second);
    expect(first.getDefaultOptions().queries?.retry).toBe(false);
  });
});
```

Run:

```bash
pnpm --filter @flex-thia/web test -- renderWithProviders.test.tsx
```

Expected: FAIL because the helper and jsdom configuration do not exist.

- [ ] **Step 2: Configure Vitest and MSW**

Use jsdom for `frontend/web/src/**/*.test.{ts,tsx}`, start the MSW server in `beforeAll`, reset handlers in `afterEach`, close it in `afterAll`, and include `@testing-library/jest-dom/vitest`.

- [ ] **Step 3: Configure Steiger and strict ESLint**

Enable Steiger's recommended FSD rules plus import locality. Configure generated `routeTree.gen.ts`, shadcn-generated files, coverage, and `dist` as explicit exceptions.

Add frontend ESLint rules for:

- React Hooks strict rules
- jsx-a11y recommended rules
- `no-useless-catch`
- `@typescript-eslint/only-throw-error`
- `@typescript-eslint/no-floating-promises`
- `@typescript-eslint/no-misused-promises`
- no default exports in authored frontend source
- no `enum`, `any`, non-null assertions, nested ternaries
- complexity 10, depth 3, max 300 logical lines per source file, max 100 logical lines per function
- a local `semantic-tailwind-tokens` rule that inspects string literals and
  template quasis and rejects non-semantic values for Tailwind color,
  typography, spacing, size, radius, elevation, and motion utilities

First make `semantic-tailwind-tokens.spec.mjs` fail for missing rule behavior.
Then prove that `bg-red-500`, `text-[#fff]`, `p-4`, `text-sm`, `rounded-md`,
`size-4`, `shadow-lg`, and `duration-200` fail while `bg-surface`,
`text-primary`, `p-page`, `text-body`, `rounded-control`, `size-icon`,
`shadow-overlay`, and `duration-feedback` pass. Also prove that structural
classes and keyword sizing such as `grid`, `md:grid-cols-2`, `overflow-auto`,
`sticky`, `w-full`, and `min-h-screen` pass, while numeric visual scales remain
forbidden.
Exclude `theme.css`, generated shadcn files, and `routeTree.gen.ts`; generated
shadcn primitives are reviewed once at ingestion and project-authored wrappers
remain strictly linted.

- [ ] **Step 4: Prove the architecture rule catches a deep import**

Temporarily create `frontend/web/src/pages/architecture-probe/ui/Probe.ts` importing `@/features/example/model/internal`, run:

```bash
pnpm --filter @flex-thia/web architecture:check
```

Expected: FAIL for a public API sidestep or forbidden import. Delete the probe before committing and run the command again; expected PASS.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm exec vitest run scripts/eslint-rules/semantic-tailwind-tokens.spec.mjs
pnpm --filter @flex-thia/web test
pnpm --filter @flex-thia/web coverage
pnpm --filter @flex-thia/web architecture:check
pnpm lint
pnpm typecheck
```

**Completion conditions:**

- Frontend tests use `.test.ts(x)` and backend tests still use `.spec.ts`.
- Library internals are not mocked.
- The root `check` script includes frontend architecture and coverage gates.

**Expected commit:**

```bash
git add eslint.config.mjs vitest.config.ts package.json frontend/web
git commit -m "chore(frontend): enforce architecture and test boundaries"
```

---

### Task 3: Establish semantic tokens and the reusable UI foundation

**Files:**

- Modify: `frontend/web/src/app/styles/theme.css`
- Generate with shadcn CLI: `frontend/web/components.json`
- Create with shadcn CLI: `frontend/web/src/shared/ui/button.tsx`
- Create with shadcn CLI: `frontend/web/src/shared/ui/input.tsx`
- Create with shadcn CLI: `frontend/web/src/shared/ui/label.tsx`
- Create with shadcn CLI: `frontend/web/src/shared/ui/form.tsx`
- Create with shadcn CLI: `frontend/web/src/shared/ui/alert.tsx`
- Create with shadcn CLI: `frontend/web/src/shared/ui/skeleton.tsx`
- Create with shadcn CLI: `frontend/web/src/shared/ui/sonner.tsx`
- Create: `frontend/web/src/shared/lib/cn.ts`
- Create: `frontend/web/src/shared/ui/app-shell/AppShell.tsx`
- Create: `frontend/web/src/shared/ui/app-shell/AppShell.test.tsx`
- Create: `frontend/web/src/shared/ui/app-shell/index.ts`
- Create: `frontend/web/src/shared/ui/page-state/PageState.tsx`
- Create: `frontend/web/src/shared/ui/page-state/PageState.test.tsx`
- Create: `frontend/web/src/shared/ui/page-state/index.ts`

**Interfaces:**

- Produces: `AppShell`, `PageLoading`, `PageEmpty`, `PageError`, and semantic
  tokens such as `bg-surface`, `text-primary`, `text-danger`,
  `border-default`, `ring-focus`, `p-page`, `gap-section`, `text-body`,
  `rounded-control`, `size-icon`, `shadow-overlay`, and `duration-feedback`.

**Existing-decision basis:** shadcn CLI first, generated files remain vendored, components consume semantic tokens only, desktop-primary responsive shell.

**Minimum implementation:** Foundation-to-semantic light tokens, the seven
needed shadcn primitives, one shell, and loading/empty/error primitives; no dark
theme or domain component.

- [ ] **Step 1: Write failing behavior and accessibility tests**

```tsx
describe('AppShell', () => {
  it('모바일에서 내비게이션 이름과 본문 landmark를 제공한다', async () => {
    render(<AppShell navigation={navigation}>본문</AppShell>);

    expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('본문');
  });
});

describe('PageError', () => {
  it('오류 설명과 명시적인 재시도 동작을 제공한다', async () => {
    const onRetry = vi.fn();
    render(<PageError message='불러오지 못했습니다.' onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
```

Expected: FAIL because the components do not exist.

- [ ] **Step 2: Generate only the approved shadcn primitives**

After inspecting `shared/ui` and completing the shadcn dependency gate, inspect
the resolved CLI flags and initialize the registry config without accepting a
raw palette as project styling:

```bash
pnpm --filter @flex-thia/web dlx shadcn@latest init --help
pnpm --filter @flex-thia/web dlx shadcn@latest init
pnpm --filter @flex-thia/web dlx shadcn@latest add button input label form alert skeleton sonner
```

Record the exact non-interactive `init` answers in the Task checkpoint before
running it. Review generated dependencies and files, then map the output onto
the project semantic tokens in Step 3. Do not edit generated formatting or add
project JSDoc to generated files.

- [ ] **Step 3: Implement the token system**

Define private foundation values and map them to public semantic CSS variables
for color, typography, spacing, size, radius, elevation, and motion. Add only
light-mode tokens. Add Korean/Thai system font stacks, functional motion
durations, focus ring, and `prefers-reduced-motion` behavior.

- [ ] **Step 4: Implement AppShell and PageState**

`AppShell` accepts navigation data and an optional profile menu slot but knows no role or route. `PageError` exposes retry and optional `requestId`; it never receives raw server `title`.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm --filter @flex-thia/web test -- AppShell.test.tsx PageState.test.tsx
pnpm --filter @flex-thia/web architecture:check
pnpm lint
pnpm --filter @flex-thia/web build
```

**Completion conditions:**

- Authored UI contains no raw visual scale, raw palette, or arbitrary value.
- Mobile navigation is keyboard-operable.
- Generated shadcn files remain distinguishable from project wrappers.

**Expected commit:**

```bash
git add frontend/web/src/app/styles frontend/web/src/shared
git commit -m "feat(frontend): add semantic UI foundation"
```

---

### Task 4: Build the contract-validated API transport and error model

**Files:**

- Create: `frontend/web/src/shared/api/ApiError.ts`
- Create: `frontend/web/src/shared/api/ApiError.test.ts`
- Create: `frontend/web/src/shared/api/apiRequest.ts`
- Create: `frontend/web/src/shared/api/apiRequest.test.ts`
- Create: `frontend/web/src/shared/api/retryPolicy.ts`
- Create: `frontend/web/src/shared/api/retryPolicy.test.ts`
- Create: `frontend/web/src/shared/api/index.ts`
- Create: `frontend/web/src/shared/config/runtime.ts`
- Create: `frontend/web/src/shared/config/runtime.test.ts`
- Create: `frontend/web/src/shared/config/index.ts`

**Interfaces:**

```ts
type ApiErrorDetail =
  | { kind: 'problem'; problem: ProblemDetailsResponse }
  | { kind: 'network' }
  | { kind: 'timeout' }
  | { kind: 'invalid-response' }
  | { kind: 'cancelled' };

class ApiError extends Error {
  readonly detail: ApiErrorDetail;
}

type ResponseContract<T> =
  | { kind: 'json'; schema: z.ZodType<T> }
  | { kind: 'empty' };

function apiRequest<T>(options: ApiRequestOptions<T>): Promise<T>;
function shouldRetryQuery(failureCount: number, error: unknown): boolean;
```

**Existing-decision basis:** Native fetch, runtime contract validation, UI-independent API layer, one retry for transient Query failures only.

**Minimum implementation:** One fetch transport, runtime config, normalized
error, response validation, cancellation/timeout, and query retry classifier;
no endpoint-specific UI or generated client.

- [ ] **Step 1: Write failing transport tests**

Cover these Korean test cases:

- `application/problem+json` becomes `ApiError(detail.kind === 'problem')`.
- Invalid success JSON becomes `invalid-response`.
- Abort caused by timeout becomes `timeout`.
- Caller cancellation becomes `cancelled`.
- Empty `204` returns `undefined`.
- Authorization and credentials are added only when requested.
- `X-CSRF-Protection: 1` is added only to login, login-TOTP, refresh, and logout.

Run:

```bash
pnpm --filter @flex-thia/web test -- apiRequest.test.ts
```

Expected: FAIL because `apiRequest` does not exist.

- [ ] **Step 2: Implement the minimal transport**

Use the validated runtime API base URL, `AbortSignal.any` or an equivalent
cleanup-safe composition, the provided response contract, and
`problemDetailsSchema`. Default the API base to `/api/v1`; allow an explicit
`VITE_API_BASE_URL` for deployments and reject invalid values during bootstrap.
Configure Vite development proxying without hard-coding a production host. Do
not import React, Router, Query, or toast code. Use a 15-second default timeout
for JSON API requests, accept caller cancellation, and allow an explicit
per-request override only for known operations such as the 60-second S3 upload.

- [ ] **Step 3: Write and satisfy retry-classifier tests**

Assert that network, timeout, 502, 503, and 504 retry only while `failureCount < 1`; 4xx, 500, invalid response, cancelled, and every mutation return false.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @flex-thia/web test -- ApiError.test.ts apiRequest.test.ts retryPolicy.test.ts runtime.test.ts
pnpm --filter @flex-thia/web typecheck
pnpm lint
```

**Completion conditions:**

- No unvalidated response reaches a Page or Feature.
- Error messages contain no secrets or raw response body.
- Transport errors have no UI behavior.

**Expected commit:**

```bash
git add frontend/web/src/shared/api
git commit -m "feat(frontend): add validated API transport"
```

---

### Task 5: Implement the memory-only auth session and single-flight refresh

**Files:**

- Create: `frontend/web/src/shared/api/auth/authApi.ts`
- Create: `frontend/web/src/shared/api/auth/authSessionStore.ts`
- Create: `frontend/web/src/shared/api/auth/authSessionStore.test.ts`
- Create: `frontend/web/src/shared/api/auth/sessionRefreshCoordinator.ts`
- Create: `frontend/web/src/shared/api/auth/sessionRefreshCoordinator.test.ts`
- Create: `frontend/web/src/shared/api/auth/authenticatedRequest.ts`
- Create: `frontend/web/src/shared/api/auth/authenticatedRequest.test.ts`
- Create: `frontend/web/src/shared/api/auth/index.ts`
- Modify: `frontend/web/src/shared/api/index.ts`

**Interfaces:**

```ts
type AuthSessionState =
  | { status: 'restoring' }
  | { status: 'anonymous'; reason: 'missing-session' | 'expired' | 'logged-out' }
  | { status: 'authenticated'; user: MeResponse; expiresAt: number }
  | { status: 'blocked'; reason: 'account-disabled'; requestId?: string }
  | { status: 'restore-error'; reason: 'csrf' | 'network' | 'server'; requestId?: string };

type AuthSessionStore = {
  getSnapshot(): AuthSessionState;
  subscribe(listener: () => void): () => void;
};

function restoreSession(): Promise<void>;
function refreshSession(): Promise<void>;
function authenticatedRequest<T>(options: AuthenticatedRequestOptions<T>): Promise<T>;
function logoutSession(): Promise<void>;
```

**Existing-decision basis:** `useSyncExternalStore`, proactive plus reactive refresh, one shared Promise, status-and-code-aware 401/403 handling.

**Minimum implementation:** Auth endpoint adapters, one memory-only store, one
refresh coordinator, authenticated replay once, and logout; no persistent or
general-purpose global state.

- [ ] **Step 1: Write failing store-transition tests**

Test refresh followed by `/me` reconciliation before restoration becomes
authenticated, invalid refresh to anonymous, account disabled to blocked,
refresh `HTTP_403` to restore-error, network/5xx to restore-error, and explicit
logout to logged-out.

- [ ] **Step 2: Implement the store without browser persistence**

Keep the access token in a module-private variable reachable only through
controlled auth request functions. Do not include it in the observable session
snapshot and do not expose a token getter or setter as public API. During
initial restoration, validate refresh and `/me` responses independently and
publish only the reconciled `MeResponse`.

- [ ] **Step 3: Write failing concurrency and replay tests**

```ts
it('동시에 발생한 401 요청은 하나의 refresh Promise를 공유한다', async () => {
  await Promise.all([requestA(), requestB(), requestC()]);
  expect(refreshApi).toHaveBeenCalledOnce();
});

it('replay된 요청의 두 번째 401은 refresh하지 않고 세션을 만료시킨다', async () => {
  await expect(authenticatedRequest(request)).rejects.toBeInstanceOf(ApiError);
  expect(refreshApi).toHaveBeenCalledOnce();
  expect(authSessionStore.getSnapshot()).toMatchObject({
    status: 'anonymous',
    reason: 'expired',
  });
});
```

- [ ] **Step 4: Implement proactive scheduling and reactive replay**

Schedule refresh one minute before expiry, clear timers on every terminal transition, exclude auth endpoints from replay, and preserve one replay maximum.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm --filter @flex-thia/web test -- authSessionStore.test.ts sessionRefreshCoordinator.test.ts authenticatedRequest.test.ts
pnpm --filter @flex-thia/web typecheck
pnpm lint
```

**Completion conditions:**

- No storage API contains an access token.
- Concurrent 401s produce one refresh call.
- 403 never initiates refresh.
- Logout failure leaves the session authenticated.

**Expected commit:**

```bash
git add frontend/web/src/shared/api
git commit -m "feat(frontend): add auth session coordination"
```

---

### Task 6: Bootstrap TanStack Router and enforce pathless access boundaries

**Files:**

- Modify: `frontend/web/vite.config.ts`
- Modify: `frontend/web/src/main.tsx`
- Create: `frontend/web/src/app/providers/AppProviders.tsx`
- Create: `frontend/web/src/app/providers/AppProviders.test.tsx`
- Create: `frontend/web/src/app/router.ts`
- Create: `frontend/web/src/app/routing/routeContext.ts`
- Create: `frontend/web/src/app/routing/guards.ts`
- Create: `frontend/web/src/app/routing/guards.test.ts`
- Create: `frontend/web/src/app/routing/redirectSearch.ts`
- Create: `frontend/web/src/app/routing/redirectSearch.test.ts`
- Create: `frontend/web/src/app/routes/__root.tsx`
- Create: `frontend/web/src/app/routes/index.tsx`
- Create: `frontend/web/src/app/routes/_authenticated.tsx`
- Create: `frontend/web/src/app/routes/_authenticated._learner.tsx`
- Create: `frontend/web/src/app/routes/_authenticated.admin.tsx`
- Create: `frontend/web/src/app/routes/_authenticated.admin._enrollment.tsx`
- Create: `frontend/web/src/app/routes/_authenticated.admin._enrolled.tsx`
- Generate: `frontend/web/src/routeTree.gen.ts`

**Interfaces:**

```ts
type RouterContext = {
  authSessionStore: AuthSessionStore;
  queryClient: QueryClient;
};

function requireAuthenticated(state: AuthSessionState, location: ParsedLocation): AuthenticatedSession;
function requireLearnerPortal(session: AuthenticatedSession): void;
function requireAdminEnrollment(session: AuthenticatedSession): void;
function requireAdminPortal(session: AuthenticatedSession): void;
function parseSafeRedirect(value: unknown): string | undefined;
```

**Existing-decision basis:** Blocking session restoration, parent `beforeLoad`, separated learner/admin-enrollment/admin areas, safe internal redirect.

**Minimum implementation:** Root/provider wiring, the four access boundaries,
safe redirect parsing, and generated route tree; no product Page beyond route
Outlets and recovery shells.

- [ ] **Step 1: Write failing guard tests**

Test anonymous login redirect, learner admin denial, unenrolled admin setup redirect, enrolled admin setup denial, and a parent failure preventing the leaf loader.

- [ ] **Step 2: Write failing redirect sanitizer tests**

Accept a known internal pathname with schema-valid search, reject protocol URLs, `//host`, hash, unknown paths, and unknown search parameters.

- [ ] **Step 3: Configure file-based routing**

Set the TanStack Router Vite plugin `routesDirectory` to `frontend/web/src/app/routes` and generated tree path to `frontend/web/src/routeTree.gen.ts`. Generated code must not be edited or commented manually.

- [ ] **Step 4: Implement blocking bootstrap and parent guards**

`AppProviders` restores the session before exposing RouterProvider, creates one
QueryClient, and renders a full-screen recovery shell for `restoring`,
`blocked`, and `restore-error`. Subscribe at this App boundary and clear
user-scoped Query data when an authenticated subject becomes anonymous,
blocked, or a different subject. Do not clear it after a failed logout that
leaves the session authenticated. The subscription Effect is allowed because
it synchronizes two external stores.

Add provider tests proving protected content does not flash, logout/session
expiry clears cached user data, a subject change clears it, and failed logout
preserves it.

Configure production Query defaults here: 30-second `staleTime`, five-minute
`gcTime`, no refetch merely on window focus, `shouldRetryQuery` for at most one
transient query retry, and `retry: false` for every mutation. Page-owned exact
invalidation, explicit retry controls, and navigation remain the refresh
triggers.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm --filter @flex-thia/web test -- AppProviders.test.tsx guards.test.ts redirectSearch.test.ts
pnpm --filter @flex-thia/web build
pnpm --filter @flex-thia/web architecture:check
```

**Completion conditions:**

- Protected content never flashes before restoration.
- Leaf loaders never run after a parent denial.
- External redirects cannot be preserved.

**Expected commit:**

```bash
git add frontend/web/vite.config.ts frontend/web/src
git commit -m "feat(frontend): add protected router boundaries"
```

---

### Task 7: Deliver login, login TOTP, enrollment TOTP, and logout UI

**Files:**

- Create with shadcn CLI: `frontend/web/src/shared/ui/card.tsx`
- Create: `frontend/web/src/pages/login/model/loginFormSchema.ts`
- Create: `frontend/web/src/pages/login/ui/LoginPageContainer.tsx`
- Create: `frontend/web/src/pages/login/ui/LoginPageView.tsx`
- Create: `frontend/web/src/pages/login/ui/LoginPage.test.tsx`
- Create: `frontend/web/src/pages/login/index.ts`
- Create: `frontend/web/src/pages/login-totp/model/loginTotpFormSchema.ts`
- Create: `frontend/web/src/pages/login-totp/ui/LoginTotpPageContainer.tsx`
- Create: `frontend/web/src/pages/login-totp/ui/LoginTotpPageView.tsx`
- Create: `frontend/web/src/pages/login-totp/ui/LoginTotpPage.test.tsx`
- Create: `frontend/web/src/pages/login-totp/index.ts`
- Create: `frontend/web/src/pages/totp-setup/model/totpSetupFormSchema.ts`
- Create: `frontend/web/src/pages/totp-setup/ui/TotpSetupPageContainer.tsx`
- Create: `frontend/web/src/pages/totp-setup/ui/TotpSetupPageView.tsx`
- Create: `frontend/web/src/pages/totp-setup/ui/TotpSetupPage.test.tsx`
- Create: `frontend/web/src/pages/totp-setup/index.ts`
- Create: `frontend/web/src/features/logout/ui/LogoutButton.tsx`
- Create: `frontend/web/src/features/logout/ui/LogoutButton.test.tsx`
- Create: `frontend/web/src/features/logout/index.ts`
- Create: `frontend/web/src/app/routes/login.tsx`
- Create: `frontend/web/src/app/routes/login.index.tsx`
- Create: `frontend/web/src/app/routes/login.mfa.tsx`
- Create: `frontend/web/src/app/routes/_authenticated.admin._enrollment.totp-setup.tsx`

**Interfaces:**

- Consumes: `loginRequestSchema`, `totpChallengeRequestSchema`, `totpSetupVerifyRequestSchema`, auth session functions.
- Produces: Page Containers through slice public APIs and `LogoutButton`.

**Existing-decision basis:** React Hook Form for forms, field errors inline, generic auth failure copy, server logout success required before local clearing.

**Minimum implementation:** Login, login TOTP, administrator TOTP enrollment,
and logout flows backed only by active auth contracts; no signup, password
reset, QR generation, or account management.

- [ ] **Step 1: Write failing form-flow tests**

Test client validation, authenticated login redirect, MFA_REQUIRED transition
preserving email/challenge only in memory, direct reload at `/login/mfa`
redirecting to `/login` when that challenge is absent, invalid TOTP inline
feedback, successful enrollment redirect, logout pending state, logout failure
keeping the session, and logout success replacing history.

- [ ] **Step 2: Implement forms with RHF lifecycle APIs**

After checking `shared/ui` and the shadcn dependency gate, add the missing
primitive:

```bash
pnpm --filter @flex-thia/web dlx shadcn@latest add card
```

Use Zod resolvers, `defaultValues`, mutation `onError` for `setError`, and mutation `onSuccess` for navigation/reset. `login.tsx` is an Outlet-only route, `login.index.tsx` connects `LoginPageContainer`, and `login.mfa.tsx` connects the challenge Page. Do not synchronize Query or form state through `useEffect`.

- [ ] **Step 3: Implement secure user feedback**

Map known auth codes to Korean copy, show `requestId` for support, and never
reveal account existence, challenge token, or server `title`. The enrollment
screen may display the contract's `secretCode` only while enrollment is active,
with explicit copy and verification input. Do not infer an `otpauth://` URI or
add a QR library because neither is present in the public contract.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @flex-thia/web test -- LoginPage.test.tsx LoginTotpPage.test.tsx TotpSetupPage.test.tsx LogoutButton.test.tsx
pnpm --filter @flex-thia/web typecheck
pnpm lint
```

**Completion conditions:**

- Keyboard-only submission and focus-to-first-error work.
- TOTP inputs expose an accessible name and numeric input mode.
- Logout performs SPA `replace`, not a full reload.

**Expected commit:**

```bash
git add frontend/web/src/pages frontend/web/src/features/logout frontend/web/src/app/routes frontend/web/src/shared/ui/card.tsx
git commit -m "feat(frontend): add authentication screens"
```

---

### Task 8: Add learner/admin shells and API-backed home pages

**Files:**

- Create: `frontend/web/src/app/routing/learnerNavigation.ts`
- Create: `frontend/web/src/app/routing/adminNavigation.ts`
- Create: `frontend/web/src/pages/learner-home/api/learnerHomeQueries.ts`
- Create: `frontend/web/src/pages/learner-home/ui/LearnerHomePageContainer.tsx`
- Create: `frontend/web/src/pages/learner-home/ui/LearnerHomePageView.tsx`
- Create: `frontend/web/src/pages/learner-home/ui/LearnerHomePage.test.tsx`
- Create: `frontend/web/src/pages/learner-home/index.ts`
- Create: `frontend/web/src/pages/admin-home/api/adminHomeQueries.ts`
- Create: `frontend/web/src/pages/admin-home/ui/AdminHomePageContainer.tsx`
- Create: `frontend/web/src/pages/admin-home/ui/AdminHomePageView.tsx`
- Create: `frontend/web/src/pages/admin-home/ui/AdminHomePage.test.tsx`
- Create: `frontend/web/src/pages/admin-home/index.ts`
- Modify: `frontend/web/src/app/routes/_authenticated._learner.tsx`
- Modify: `frontend/web/src/app/routes/_authenticated.admin._enrolled.tsx`
- Create: `frontend/web/src/app/routes/_authenticated._learner.learn.tsx`
- Create: `frontend/web/src/app/routes/_authenticated.admin._enrolled.index.tsx`

**Interfaces:**

- `learnerHomeQueryOptions()` reads only recent question and vocabulary lists.
- `adminHomeQueryOptions()` reads only small filtered admin lists already supported by OpenAPI.

**Existing-decision basis:** No invented analytics or recommendations; role-specific route composition around a domain-neutral AppShell.

**Minimum implementation:** Two role shells and small recent-list home sections
using existing list endpoints; no metric, recommendation, or dashboard API.

- [ ] **Step 1: Write failing home-state tests**

Test recent-content success, independent partial error, complete empty state, navigation landmarks, and no unsupported statistic labels.

- [ ] **Step 2: Implement query option factories and Containers**

Use stable hierarchical keys, one-page small queries, and Page-local `api` ownership. A partial list failure must not erase the other successful list.

- [ ] **Step 3: Implement responsive Views**

Use semantic cards and links, desktop grid, tablet collapse, and mobile single column. Keep Thai content tagged with `lang='th'`.

- [ ] **Step 4: Verify and commit**

Run:

```bash
pnpm --filter @flex-thia/web test -- LearnerHomePage.test.tsx AdminHomePage.test.tsx
pnpm --filter @flex-thia/web architecture:check
pnpm lint
```

**Completion conditions:**

- Every displayed value comes from an active endpoint or static navigation.
- Admin and learner navigation remain separated.

**Expected commit:**

```bash
git add frontend/web/src/app/routes frontend/web/src/pages/learner-home frontend/web/src/pages/admin-home
git commit -m "feat(frontend): add role home pages"
```

---

### Task 9: Implement learner question discovery

**Files:**

- Create with shadcn CLI: `frontend/web/src/shared/ui/select.tsx`
- Create with shadcn CLI: `frontend/web/src/shared/ui/sheet.tsx`
- Create with shadcn CLI: `frontend/web/src/shared/ui/badge.tsx`
- Create: `frontend/web/src/pages/question-list/model/questionListSearch.ts`
- Create: `frontend/web/src/pages/question-list/api/questionListQueries.ts`
- Create: `frontend/web/src/pages/question-list/ui/QuestionListPageContainer.tsx`
- Create: `frontend/web/src/pages/question-list/ui/QuestionListPageView.tsx`
- Create: `frontend/web/src/pages/question-list/ui/QuestionFilters.tsx`
- Create: `frontend/web/src/pages/question-list/ui/QuestionListPage.test.tsx`
- Create: `frontend/web/src/pages/question-list/index.ts`
- Create: `frontend/web/src/app/routes/_authenticated._learner.questions.tsx`
- Create: `frontend/web/src/app/routes/_authenticated._learner.questions.index.tsx`

**Interfaces:**

- Consumes: `questionListQuerySchema`, `questionListResponseSchema`.
- Produces: validated Router search `{ skill, questionTypeId, difficulty, saved, firstResult, page, pageSize }`.

**Existing-decision basis:** URL owns filters and pagination, desktop fixed filters, mobile Sheet, no infinite scroll.

**Minimum implementation:** Contract-supported filters, paginated list, route
search validation, Page states, and detail links; no client-only filter or
infinite loading.

- [ ] **Step 1: Write failing URL and state tests**

Test schema defaults, invalid search rejection, filter change resetting page to 1, loading skeleton, no-content empty state, no-filter-results empty state, error retry, and mobile filter accessible labeling.

- [ ] **Step 2: Implement search and query options**

After checking `shared/ui` and the shadcn dependency gate, add only missing
primitives:

```bash
pnpm --filter @flex-thia/web dlx shadcn@latest add select sheet badge
```

Serialize only API-supported query keys. Keep `page` one-based and clamp `pageSize` to contract limits through the shared schema.

- [ ] **Step 3: Implement Container and View**

Use links to question detail, preserve validated search on back navigation, and render Thai titles with the Thai language attribute.

- [ ] **Step 4: Verify and commit**

Run:

```bash
pnpm --filter @flex-thia/web test -- QuestionListPage.test.tsx
pnpm --filter @flex-thia/web typecheck
pnpm --filter @flex-thia/web build
```

**Completion conditions:**

- Refreshing the browser reproduces filters and page.
- No local state mirrors Router search.

**Expected commit:**

```bash
git add frontend/web/src/pages/question-list frontend/web/src/app/routes frontend/web/src/shared/ui
git commit -m "feat(frontend): add question discovery"
```

---

### Task 10: Implement question solving, attempts, and saved-question actions

**Files:**

- Create with shadcn CLI: `frontend/web/src/shared/ui/radio-group.tsx`
- Create: `frontend/web/src/features/submit-answer/api/submitAnswerMutation.ts`
- Create: `frontend/web/src/features/submit-answer/model/createClientAttemptId.ts`
- Create: `frontend/web/src/features/submit-answer/model/createClientAttemptId.test.ts`
- Create: `frontend/web/src/features/submit-answer/ui/SubmitAnswerForm.tsx`
- Create: `frontend/web/src/features/submit-answer/ui/SubmitAnswerForm.test.tsx`
- Create: `frontend/web/src/features/submit-answer/index.ts`
- Create: `frontend/web/src/features/toggle-saved-question/api/savedQuestionMutation.ts`
- Create: `frontend/web/src/features/toggle-saved-question/ui/SavedQuestionButton.tsx`
- Create: `frontend/web/src/features/toggle-saved-question/ui/SavedQuestionButton.test.tsx`
- Create: `frontend/web/src/features/toggle-saved-question/index.ts`
- Create: `frontend/web/src/pages/question-solving/api/questionDetailQueries.ts`
- Create: `frontend/web/src/pages/question-solving/model/questionViewModel.ts`
- Create: `frontend/web/src/pages/question-solving/ui/QuestionSolvingPageContainer.tsx`
- Create: `frontend/web/src/pages/question-solving/ui/QuestionSolvingPageView.tsx`
- Create: `frontend/web/src/pages/question-solving/ui/QuestionSolvingPage.test.tsx`
- Create: `frontend/web/src/pages/question-solving/index.ts`
- Create: `frontend/web/src/pages/learning-history/api/attemptHistoryQueries.ts`
- Create: `frontend/web/src/pages/learning-history/ui/LearningHistoryPageContainer.tsx`
- Create: `frontend/web/src/pages/learning-history/ui/LearningHistoryPageView.tsx`
- Create: `frontend/web/src/pages/learning-history/ui/LearningHistoryPage.test.tsx`
- Create: `frontend/web/src/pages/learning-history/index.ts`
- Create: `frontend/web/src/app/routes/_authenticated._learner.questions.$questionId.tsx`
- Create: `frontend/web/src/app/routes/_authenticated._learner.history.tsx`

**Interfaces:**

- Consumes: question detail, attempt submission, attempt list, saved question endpoints.
- Produces: `SubmitAnswerForm`, `SavedQuestionButton`, Page Containers, and
  typed confirmation callbacks that let Pages own Query invalidation.

**Existing-decision basis:** One question per page, answer feedback only after submission, no optimistic save, idempotent retry with stable `clientAttemptId`.

**Minimum implementation:** One-question solving, server-confirmed save, raw
attempt history, and post-submit feedback; no session plan, scoring dashboard,
or mutation auto-retry.

- [ ] **Step 1: Write failing idempotency and question-flow tests**

Test one UUID per logical submission, same UUID across network replay, a new UUID for “다시 풀기”, hidden transcript before reveal, answer feedback after success, `QUESTION_UNAVAILABLE` recovery, and save mutation confirmed by the server.

- [ ] **Step 2: Implement the answer Feature**

After checking `shared/ui` and the shadcn dependency gate, add the missing
primitive:

```bash
pnpm --filter @flex-thia/web dlx shadcn@latest add radio-group
```

Use `crypto.randomUUID()`, retain the ID in the submission command until it
resolves, and never auto-retry the mutation through TanStack Query. Saved
question mutation success emits `onConfirmed`; the composing Page invalidates
its own list/detail keys so the Feature does not import a Page.

- [ ] **Step 3: Implement the Page and history**

Map contract blocks into a View model only where display behavior differs. Use
contract ISO timestamps and format them through a focused
`Intl.DateTimeFormat('ko-KR')` helper under `shared/lib/date`, using the
browser's local time zone and a `<time dateTime={originalIso}>` element; do not
add a date package or discard the original UTC value.

- [ ] **Step 4: Verify and commit**

Run:

```bash
pnpm --filter @flex-thia/web test -- createClientAttemptId.test.ts SubmitAnswerForm.test.tsx SavedQuestionButton.test.tsx QuestionSolvingPage.test.tsx LearningHistoryPage.test.tsx
pnpm --filter @flex-thia/web architecture:check
pnpm lint
```

**Completion conditions:**

- The pre-answer response never displays a correct answer.
- Cancelled navigation does not auto-replay a mutation.
- Attempt history uses actual raw records without invented statistics.

**Expected commit:**

```bash
git add frontend/web/src/features frontend/web/src/pages/question-solving frontend/web/src/pages/learning-history frontend/web/src/app/routes frontend/web/src/shared
git commit -m "feat(frontend): add question solving and history"
```

---

### Task 11: Implement vocabulary search, detail, related questions, and saved vocabulary

**Files:**

- Create with shadcn CLI: `frontend/web/src/shared/ui/tabs.tsx`
- Create: `frontend/web/src/features/toggle-saved-vocabulary/api/savedVocabularyMutation.ts`
- Create: `frontend/web/src/features/toggle-saved-vocabulary/ui/SavedVocabularyButton.tsx`
- Create: `frontend/web/src/features/toggle-saved-vocabulary/ui/SavedVocabularyButton.test.tsx`
- Create: `frontend/web/src/features/toggle-saved-vocabulary/index.ts`
- Create: `frontend/web/src/pages/vocabulary-list/model/vocabularyListSearch.ts`
- Create: `frontend/web/src/pages/vocabulary-list/api/vocabularyListQueries.ts`
- Create: `frontend/web/src/pages/vocabulary-list/ui/VocabularyListPageContainer.tsx`
- Create: `frontend/web/src/pages/vocabulary-list/ui/VocabularyListPageView.tsx`
- Create: `frontend/web/src/pages/vocabulary-list/ui/VocabularyListPage.test.tsx`
- Create: `frontend/web/src/pages/vocabulary-list/index.ts`
- Create: `frontend/web/src/pages/vocabulary-detail/api/vocabularyDetailQueries.ts`
- Create: `frontend/web/src/pages/vocabulary-detail/ui/VocabularyDetailPageContainer.tsx`
- Create: `frontend/web/src/pages/vocabulary-detail/ui/VocabularyDetailPageView.tsx`
- Create: `frontend/web/src/pages/vocabulary-detail/ui/VocabularyDetailPage.test.tsx`
- Create: `frontend/web/src/pages/vocabulary-detail/index.ts`
- Create: `frontend/web/src/pages/saved-vocabularies/api/savedVocabularyQueries.ts`
- Create: `frontend/web/src/pages/saved-vocabularies/ui/SavedVocabulariesPageContainer.tsx`
- Create: `frontend/web/src/pages/saved-vocabularies/ui/SavedVocabulariesPageView.tsx`
- Create: `frontend/web/src/pages/saved-vocabularies/ui/SavedVocabulariesPage.test.tsx`
- Create: `frontend/web/src/pages/saved-vocabularies/index.ts`
- Create: `frontend/web/src/app/routes/_authenticated._learner.vocabularies.tsx`
- Create: `frontend/web/src/app/routes/_authenticated._learner.vocabularies.index.tsx`
- Create: `frontend/web/src/app/routes/_authenticated._learner.vocabularies.$vocabularyId.tsx`
- Create: `frontend/web/src/app/routes/_authenticated._learner.saved-vocabularies.tsx`

**Interfaces:**

- Consumes: vocabulary list/detail/related questions and saved vocabulary contracts.
- Produces: URL search, detail Page, and a server-confirmed save action whose
  Page callback owns cache invalidation.

**Existing-decision basis:** One saved vocabulary collection only, no synonym editing, no word-practice UI.

**Minimum implementation:** Search/list, detail, related-question links, one
saved list, and server-confirmed toggle; no wordbook hierarchy or independent
practice mode.

- [ ] **Step 1: Write failing search and language-display tests**

Test Thai/Korean query preservation, contract filters, URL pagination, Thai language attributes, pronunciation/audio rendering, related question links, empty saved list, and save failure inline feedback.

- [ ] **Step 2: Implement query ownership and URL state**

After checking `shared/ui` and the shadcn dependency gate, add the missing
primitive:

```bash
pnpm --filter @flex-thia/web dlx shadcn@latest add tabs
```

Keep each Page's query options in its own `api` segment. The saved-vocabulary
Feature emits `onConfirmed`, and the composing Page invalidates its own exact
keys. Do not introduce an Entity layer solely to share the DTO or import a Page
from a Feature.

- [ ] **Step 3: Implement Views**

Render only fields present in the public contract. Do not render deferred synonyms, antonyms, related terms, multiple wordbooks, or independent AI examples.

- [ ] **Step 4: Verify and commit**

Run:

```bash
pnpm --filter @flex-thia/web test -- SavedVocabularyButton.test.tsx VocabularyListPage.test.tsx VocabularyDetailPage.test.tsx SavedVocabulariesPage.test.tsx
pnpm --filter @flex-thia/web build
pnpm lint
```

**Completion conditions:**

- Thai original strings are not reconstructed from tokens.
- Search and saved list remain separate Page-owned caches.

**Expected commit:**

```bash
git add frontend/web/src/features/toggle-saved-vocabulary frontend/web/src/pages/vocabulary-list frontend/web/src/pages/vocabulary-detail frontend/web/src/pages/saved-vocabularies frontend/web/src/app/routes frontend/web/src/shared/ui/tabs.tsx
git commit -m "feat(frontend): add vocabulary workflows"
```

---

### Task 12: Implement administrator content-import workflows

**Files:**

- Create with shadcn CLI: `frontend/web/src/shared/ui/textarea.tsx`
- Create with shadcn CLI: `frontend/web/src/shared/ui/table.tsx`
- Create: `frontend/web/src/pages/content-import-list/model/contentImportListSearch.ts`
- Create: `frontend/web/src/pages/content-import-list/api/contentImportQueries.ts`
- Create: `frontend/web/src/pages/content-import-list/ui/ContentImportListPageContainer.tsx`
- Create: `frontend/web/src/pages/content-import-list/ui/ContentImportListPageView.tsx`
- Create: `frontend/web/src/pages/content-import-list/ui/ContentImportForm.tsx`
- Create: `frontend/web/src/pages/content-import-list/ui/ContentImportListPage.test.tsx`
- Create: `frontend/web/src/pages/content-import-list/index.ts`
- Create: `frontend/web/src/pages/content-import-detail/api/contentImportDetailQueries.ts`
- Create: `frontend/web/src/pages/content-import-detail/ui/ContentImportDetailPageContainer.tsx`
- Create: `frontend/web/src/pages/content-import-detail/ui/ContentImportDetailPageView.tsx`
- Create: `frontend/web/src/pages/content-import-detail/ui/ContentImportDetailPage.test.tsx`
- Create: `frontend/web/src/pages/content-import-detail/index.ts`
- Create: `frontend/web/src/app/routes/_authenticated.admin._enrolled.content-imports.tsx`
- Create: `frontend/web/src/app/routes/_authenticated.admin._enrolled.content-imports.index.tsx`
- Create: `frontend/web/src/app/routes/_authenticated.admin._enrolled.content-imports.$importId.tsx`

**Interfaces:**

- Consumes: `contentImportRequestSchema`, `idempotencyKeyHeaderSchema`, list/detail schemas.
- Produces: client-validated JSON import form and item-result detail.

**Existing-decision basis:** Human-authored normalized JSON only, per-item failures, one idempotency key per logical import, no PDF/AI workflow.

**Minimum implementation:** JSON file/text validation, one create command,
paginated history, and item-result detail; no PDF parser, AI job, or background
upload pipeline.

- [ ] **Step 1: Write failing import tests**

Test invalid JSON syntax, schema field errors, more than 100 combined items, stable `Idempotency-Key` across a replay, a new key for a new submit, 413 feedback, 429 wait guidance, and mixed imported/rejected detail rendering.

- [ ] **Step 2: Implement client parsing and contract validation**

After checking `shared/ui` and the shadcn dependency gate, add only missing
primitives:

```bash
pnpm --filter @flex-thia/web dlx shadcn@latest add textarea table
```

Read `.json` files as text, parse once, validate with `contentImportRequestSchema`, and show field paths without transmitting invalid content.

- [ ] **Step 3: Implement mutation and list/detail Queries**

Generate the key with `crypto.randomUUID()`, send it in the exact `Idempotency-Key` header, and invalidate only content-import list/detail keys after success.

- [ ] **Step 4: Verify and commit**

Run:

```bash
pnpm --filter @flex-thia/web test -- ContentImportListPage.test.tsx ContentImportDetailPage.test.tsx
pnpm --filter @flex-thia/web typecheck
pnpm lint
```

**Completion conditions:**

- Original full JSON is not logged.
- Partial failures are visible without being treated as a failed HTTP request.

**Expected commit:**

```bash
git add frontend/web/src/pages/content-import-list frontend/web/src/pages/content-import-detail frontend/web/src/app/routes frontend/web/src/shared/ui
git commit -m "feat(frontend): add content import operations"
```

---

### Task 13: Add the reusable administrator audio-upload feature

**Files:**

- Create: `frontend/web/src/features/upload-audio/api/mediaAssetApi.ts`
- Create: `frontend/web/src/features/upload-audio/lib/computeSha256.ts`
- Create: `frontend/web/src/features/upload-audio/lib/computeSha256.test.ts`
- Create: `frontend/web/src/features/upload-audio/model/uploadAudio.ts`
- Create: `frontend/web/src/features/upload-audio/model/uploadAudio.test.ts`
- Create: `frontend/web/src/features/upload-audio/ui/AudioUploadField.tsx`
- Create: `frontend/web/src/features/upload-audio/ui/AudioUploadField.test.tsx`
- Create: `frontend/web/src/features/upload-audio/index.ts`
- Modify: `frontend/web/src/pages/content-import-list/ui/ContentImportForm.tsx`

**Interfaces:**

```ts
type AudioUploadProgress =
  | { status: 'idle' }
  | { status: 'hashing' }
  | { status: 'uploading'; percent: number }
  | { status: 'completing' }
  | { status: 'ready'; mediaAssetId: string }
  | { status: 'error'; message: string; requestId?: string };

function computeSha256(file: File): Promise<string>;
type ReadyAudioAsset = { mediaAssetId: string; status: 'READY' };
function uploadAudio(file: File, signal: AbortSignal): Promise<ReadyAudioAsset>;
```

**Existing-decision basis:** Presigned audio upload is an independent reusable action; no standalone media-asset list page.

**Minimum implementation:** Hash, request, exact S3 form POST, complete,
single-status lookup, cancellation, and one reusable field; no asset library,
continuous polling, or transcoding UI.

- [ ] **Step 1: Write failing hash and upload-state tests**

Test deterministic SHA-256, unsupported MIME/size rejection through the request
schema, request -> presigned form POST -> complete ordering, the
`uploadRequired: false` READY reuse branch, cancellation, S3 failure, complete
409, media-status lookup for an existing asset, and ready media ID delivery.

- [ ] **Step 2: Implement the upload pipeline**

Use Web Crypto for hashing, the backend request contract for metadata, and a 60-second upload timeout. When `uploadRequired` is true, append every returned `upload.fields` entry and the file to `FormData`, then POST it to `upload.url`; when it is false, return the reused READY asset without uploading. Never attach the access token or CSRF header to the presigned S3 form request.

Keep the authenticated `GET /admin/media-assets/:mediaAssetId` query in this
Feature for status recovery and existing-value display. Do not poll
continuously: query once on mount or an explicit retry, because the public
contract does not promise a client-visible processing progression.

- [ ] **Step 3: Implement the accessible field**

Expose file restrictions, progress text through `aria-live`, a cancel button during upload, and retry after failure. Return only a ready `mediaAssetId` to the owning form.

- [ ] **Step 4: Verify and commit**

Run:

```bash
pnpm --filter @flex-thia/web test -- computeSha256.test.ts uploadAudio.test.ts AudioUploadField.test.tsx
pnpm --filter @flex-thia/web architecture:check
pnpm lint
```

**Completion conditions:**

- S3 receives the exact returned form fields and no auth or CSRF header.
- A failed completion never reports the asset as ready.

**Expected commit:**

```bash
git add frontend/web/src/features/upload-audio frontend/web/src/pages/content-import-list/ui/ContentImportForm.tsx
git commit -m "feat(frontend): add audio asset upload"
```

---

### Task 14: Implement administrator question list and detail inspection

**Files:**

- Create: `frontend/web/src/pages/question-management/model/adminQuestionSearch.ts`
- Create: `frontend/web/src/pages/question-management/api/adminQuestionQueries.ts`
- Create: `frontend/web/src/pages/question-management/ui/QuestionManagementPageContainer.tsx`
- Create: `frontend/web/src/pages/question-management/ui/QuestionManagementPageView.tsx`
- Create: `frontend/web/src/pages/question-management/ui/AdminQuestionFilters.tsx`
- Create: `frontend/web/src/pages/question-management/ui/QuestionManagementPage.test.tsx`
- Create: `frontend/web/src/pages/question-management/index.ts`
- Create: `frontend/web/src/pages/admin-question-detail/api/adminQuestionDetailQueries.ts`
- Create: `frontend/web/src/pages/admin-question-detail/ui/AdminQuestionDetailPageContainer.tsx`
- Create: `frontend/web/src/pages/admin-question-detail/ui/AdminQuestionDetailPageView.tsx`
- Create: `frontend/web/src/pages/admin-question-detail/ui/AdminQuestionDetailPage.test.tsx`
- Create: `frontend/web/src/pages/admin-question-detail/index.ts`
- Create: `frontend/web/src/app/routes/_authenticated.admin._enrolled.questions.tsx`
- Create: `frontend/web/src/app/routes/_authenticated.admin._enrolled.questions.index.tsx`
- Create: `frontend/web/src/app/routes/_authenticated.admin._enrolled.questions.$questionId.tsx`
- Create: `frontend/web/src/app/routes/_authenticated.admin._enrolled.questions.$questionId.index.tsx`

**Interfaces:**

- Consumes: admin question list/detail schemas and all supported list filters.
- Produces: filterable management list and immutable version inspection links.

**Existing-decision basis:** URL-owned administration filters, no frontend-invented validation status, desktop-primary dense data.

**Minimum implementation:** Contract-filtered administrator list, structural
detail, responsive record rendering, clone entry, and replacement link; no
mutation behavior in the list or inferred content text.

- [ ] **Step 1: Write failing management-state tests**

Test every supported OpenAPI filter, invalid URL values, state badges using semantic status tokens, empty/filter-empty distinction, detail 404, validation report rendering, and mobile table fallback.

- [ ] **Step 2: Implement Page-owned Queries**

Keep list and detail keys hierarchical under `['admin', 'questions']`; prefetch the list/detail from the route and cancel GETs through Query signals.

- [ ] **Step 3: Implement Views**

Use a desktop table and mobile stacked records without duplicating data logic.
Make the `$questionId` route an Outlet-only parent and render inspection from its
index child, so the version-replacement child replaces rather than duplicates
the detail UI. Provide an explicit clone-DRAFT action and replacement link on the
detail screen; do not embed mutation behavior in the list.

- [ ] **Step 4: Verify and commit**

Run:

```bash
pnpm --filter @flex-thia/web test -- QuestionManagementPage.test.tsx AdminQuestionDetailPage.test.tsx
pnpm --filter @flex-thia/web build
pnpm lint
```

**Completion conditions:**

- All filters match Swagger names exactly.
- Published content is not presented as directly editable.

**Expected commit:**

```bash
git add frontend/web/src/pages/question-management frontend/web/src/pages/admin-question-detail frontend/web/src/app/routes
git commit -m "feat(frontend): add admin question inspection"
```

---

### Task 15: Implement administrator question version replacement and state actions

**Files:**

- Create with shadcn CLI: `frontend/web/src/shared/ui/dialog.tsx`
- Create: `frontend/web/src/pages/admin-question-detail/model/questionVersionJsonFormSchema.ts`
- Create: `frontend/web/src/pages/admin-question-detail/model/parseQuestionVersionPayload.ts`
- Create: `frontend/web/src/pages/admin-question-detail/model/parseQuestionVersionPayload.test.ts`
- Create: `frontend/web/src/pages/admin-question-detail/api/questionVersionMutations.ts`
- Create: `frontend/web/src/pages/admin-question-detail/ui/CloneQuestionVersionButton.tsx`
- Create: `frontend/web/src/pages/admin-question-detail/ui/QuestionVersionReplacePageContainer.tsx`
- Create: `frontend/web/src/pages/admin-question-detail/ui/QuestionVersionReplacePageView.tsx`
- Create: `frontend/web/src/pages/admin-question-detail/ui/QuestionVersionJsonForm.tsx`
- Create: `frontend/web/src/pages/admin-question-detail/ui/QuestionVersionReplacePage.test.tsx`
- Modify: `frontend/web/src/pages/admin-question-detail/index.ts`
- Create: `frontend/web/src/features/change-question-state/api/questionStateMutations.ts`
- Create: `frontend/web/src/features/change-question-state/ui/QuestionStateAction.tsx`
- Create: `frontend/web/src/features/change-question-state/ui/QuestionStateAction.test.tsx`
- Create: `frontend/web/src/features/change-question-state/index.ts`
- Create: `frontend/web/src/app/routes/_authenticated.admin._enrolled.questions.$questionId.versions.$versionId.replace.tsx`

**Interfaces:**

- Consumes: clone-version, replace-version, validate, publish, invalidate, hide,
  and restore contracts.
- Produces: a clone command, canonical JSON replacement payload exactly matching
  `AdminQuestionVersionPayload`, a refresh-safe replacement route carrying
  `questionId`, and reusable confirmed state actions.

```ts
type ParseQuestionVersionPayloadResult =
  | { ok: true; payload: AdminQuestionVersionPayload }
  | { ok: false; message: string; path?: string };

function parseQuestionVersionPayload(
  payloadJson: string,
): ParseQuestionVersionPayloadResult;
```

**Existing-decision basis:** RHF, no Effect synchronization, immutable published
versions, validation FAILED is a successful HTTP response, destructive state
changes require confirmation, and no UI model may claim data absent from the
public response contract.

**Minimum implementation:** DRAFT clone, blank canonical JSON replacement,
validate/publish/invalidate, and question hide/restore actions; no rich editor,
payload reconstruction, or published-version mutation.

- [ ] **Step 1: Write failing parser, clone, and replacement tests**

Test JSON syntax errors, contract field paths, an exact valid canonical payload,
clone POST with no body, redirect to the returned DRAFT ID, direct loading of
the replacement URL, a mismatched `versionId` not contained in the fetched
`questionId` detail, immutable 409, validation FAILED rendering, and no request
when client validation fails.

- [ ] **Step 2: Implement the contract-honest replacement lifecycle**

After checking `shared/ui` and the shadcn dependency gate, add the missing
confirmation primitive:

```bash
pnpm --filter @flex-thia/web dlx shadcn@latest add dialog
```

Reuse the `admin-question-detail` slice's query and key factory instead of
creating a second cross-Page copy. After clone succeeds, navigate to the
replacement route returned by the server. That route fetches question detail by
`questionId` and verifies that it contains `versionId`, because the backend
exposes no version-detail GET.

The public detail response does not expose the sentence text, translation,
pronunciation, token, expression, or option payload needed to reconstruct
`AdminQuestionVersionPayload`. Therefore render an explicitly labeled,
desktop-oriented canonical JSON textarea initialized empty, validate it with
`adminQuestionVersionPayloadSchema`, and replace the whole DRAFT only after
confirmation. Do not fabricate a prefilled rich editor or reverse-map IDs into
missing content. Use RHF `defaultValues` and never mirror Query data through
`useEffect`.

- [ ] **Step 3: Implement state-action confirmations**

Publish, hide, and invalidate require an accessible confirmation Dialog.
Restore uses an explicit labeled action. Feature actions wait for server
success and emit a typed `onConfirmed` event; the composing
`admin-question-detail` Page owns exact Query invalidation so the Feature never
imports a Page. Display 409 inline.

- [ ] **Step 4: Verify and commit**

Run:

```bash
pnpm --filter @flex-thia/web test -- parseQuestionVersionPayload.test.ts QuestionVersionReplacePage.test.tsx QuestionStateAction.test.tsx
pnpm --filter @flex-thia/web typecheck
pnpm lint
```

**Completion conditions:**

- A validation report with `FAILED` is not converted into `ApiError`.
- No mutation retries automatically.
- Published versions cannot enter the replacement form.
- The UI never claims it can reconstruct an existing canonical payload.

**Expected commit:**

```bash
git add frontend/web/src/pages/admin-question-detail frontend/web/src/features/change-question-state frontend/web/src/app/routes frontend/web/src/shared/ui/dialog.tsx
git commit -m "feat(frontend): add question version operations"
```

---

### Task 16: Implement administrator vocabulary management

**Files:**

- Create: `frontend/web/src/pages/vocabulary-management/model/adminVocabularySearch.ts`
- Create: `frontend/web/src/pages/vocabulary-management/api/adminVocabularyQueries.ts`
- Create: `frontend/web/src/pages/vocabulary-management/ui/VocabularyManagementPageContainer.tsx`
- Create: `frontend/web/src/pages/vocabulary-management/ui/VocabularyManagementPageView.tsx`
- Create: `frontend/web/src/pages/vocabulary-management/ui/VocabularyManagementPage.test.tsx`
- Create: `frontend/web/src/pages/vocabulary-management/index.ts`
- Create: `frontend/web/src/pages/admin-vocabulary-detail/model/vocabularyFormSchema.ts`
- Create: `frontend/web/src/pages/admin-vocabulary-detail/model/mapVocabularyForm.ts`
- Create: `frontend/web/src/pages/admin-vocabulary-detail/model/mapVocabularyForm.test.ts`
- Create: `frontend/web/src/pages/admin-vocabulary-detail/api/adminVocabularyMutations.ts`
- Create: `frontend/web/src/pages/admin-vocabulary-detail/ui/AdminVocabularyDetailPageContainer.tsx`
- Create: `frontend/web/src/pages/admin-vocabulary-detail/ui/AdminVocabularyDetailPageView.tsx`
- Create: `frontend/web/src/pages/admin-vocabulary-detail/ui/VocabularyForm.tsx`
- Create: `frontend/web/src/pages/admin-vocabulary-detail/ui/VocabularyMeaningFields.tsx`
- Create: `frontend/web/src/pages/admin-vocabulary-detail/ui/VocabularyPronunciationFields.tsx`
- Create: `frontend/web/src/pages/admin-vocabulary-detail/ui/VocabularyMeaningPronunciationFields.tsx`
- Create: `frontend/web/src/pages/admin-vocabulary-detail/ui/AdminVocabularyDetailPage.test.tsx`
- Create: `frontend/web/src/pages/admin-vocabulary-detail/index.ts`
- Create: `frontend/web/src/features/change-vocabulary-state/api/vocabularyStateMutations.ts`
- Create: `frontend/web/src/features/change-vocabulary-state/ui/VocabularyStateAction.tsx`
- Create: `frontend/web/src/features/change-vocabulary-state/ui/VocabularyStateAction.test.tsx`
- Create: `frontend/web/src/features/change-vocabulary-state/index.ts`
- Create: `frontend/web/src/app/routes/_authenticated.admin._enrolled.vocabularies.tsx`
- Create: `frontend/web/src/app/routes/_authenticated.admin._enrolled.vocabularies.index.tsx`
- Create: `frontend/web/src/app/routes/_authenticated.admin._enrolled.vocabularies.$vocabularyId.tsx`

**Interfaces:**

- Consumes: admin vocabulary list/detail/replace/publish/hide/restore contracts.
- Produces: exact `AdminVocabularyReplaceRequest` payload and confirmed state actions.

**Existing-decision basis:** No vocabulary merge, synonym/antonym editor, or optimistic state changes.

**Minimum implementation:** Contract-filtered list, full DRAFT replacement,
publish/hide/restore, and usage/readiness display; no merge or relationship
editor.

- [ ] **Step 1: Write failing list, mapper, and action tests**

Test all supported filters, nested meaning/pronunciation mapping, audio readiness presentation, schema field errors, publish prerequisites from server responses, 409 conflict, and server-confirmed publish/hide/restore.

- [ ] **Step 2: Implement Page Queries and form mapping**

Use Page-owned keys under `['admin', 'vocabularies']`. Preserve contract order
and nullable fields. The replace request accepts request-local `clientRef`
strings rather than response IDs, so use returned meaning/pronunciation IDs
only as stable form keys and request-local refs; never send them as undocumented
ID fields or assume the replacement preserves database IDs. Cover this mapping
explicitly in `mapVocabularyForm.test.ts`. Do not create a separate frontend
Entity model.

- [ ] **Step 3: Implement state actions**

Use the same confirmation and feedback policy as question state actions without
importing one Feature from another Feature. Each successful action emits
`onConfirmed`, and the composing vocabulary Page invalidates its exact
list/detail keys. Share only domain-neutral Dialog primitives.

- [ ] **Step 4: Verify and commit**

Run:

```bash
pnpm --filter @flex-thia/web test -- VocabularyManagementPage.test.tsx mapVocabularyForm.test.ts AdminVocabularyDetailPage.test.tsx VocabularyStateAction.test.tsx
pnpm --filter @flex-thia/web architecture:check
pnpm lint
```

**Completion conditions:**

- Feature-to-Feature imports do not exist.
- Deferred merge and relationship functionality does not appear.

**Expected commit:**

```bash
git add frontend/web/src/pages/vocabulary-management frontend/web/src/pages/admin-vocabulary-detail frontend/web/src/features/change-vocabulary-state frontend/web/src/app/routes
git commit -m "feat(frontend): add admin vocabulary operations"
```

---

### Task 17: Add global error boundaries, forbidden/not-found views, and recovery polish

**Files:**

- Modify: `frontend/web/src/app/routes/__root.tsx`
- Create: `frontend/web/src/pages/forbidden/ui/ForbiddenPage.tsx`
- Create: `frontend/web/src/pages/forbidden/ui/ForbiddenPage.test.tsx`
- Create: `frontend/web/src/pages/forbidden/index.ts`
- Create: `frontend/web/src/pages/not-found/ui/NotFoundPage.tsx`
- Create: `frontend/web/src/pages/not-found/ui/NotFoundPage.test.tsx`
- Create: `frontend/web/src/pages/not-found/index.ts`
- Create: `frontend/web/src/shared/lib/error/toUserMessage.ts`
- Create: `frontend/web/src/shared/lib/error/toUserMessage.test.ts`
- Create: `frontend/web/src/shared/lib/error/index.ts`
- Create: `frontend/web/src/app/routes/forbidden.tsx`

**Interfaces:**

- Produces: common fallback messages for unknown errors, root not-found component, route error component, and session-preserving forbidden flow.

**Existing-decision basis:** Context-nearest errors, no duplicate toast, server title hidden, request ID safe, render failures handled at route boundaries.

**Minimum implementation:** Generic safe-message mapper, forbidden Page,
not-found Page, and root route recovery; domain-specific error copy remains in
its owning slice.

- [ ] **Step 1: Write failing recovery tests**

Test 403 preserving authenticated state, unknown Problem code fallback, request ID display, cancelled request silence, route render exception recovery, and not-found navigation.

- [ ] **Step 2: Implement the message boundary**

Keep auth code mapping in auth, business code mapping in owning slices, and only generic technical fallbacks in `shared/lib/error`.

- [ ] **Step 3: Implement root boundaries**

Use TanStack Router error and not-found components. Provide reset/retry actions without a full reload unless the Router itself cannot recover.

- [ ] **Step 4: Verify and commit**

Run:

```bash
pnpm --filter @flex-thia/web test -- ForbiddenPage.test.tsx NotFoundPage.test.tsx toUserMessage.test.ts
pnpm --filter @flex-thia/web build
pnpm lint
```

**Completion conditions:**

- No expected API error reaches a render Error Boundary.
- Error and retry controls are keyboard accessible.

**Expected commit:**

```bash
git add frontend/web/src/app/routes frontend/web/src/pages/forbidden frontend/web/src/pages/not-found frontend/web/src/shared/lib/error
git commit -m "feat(frontend): add recovery boundaries"
```

---

### Task 18: Run final responsive, accessibility, contract, and quality verification

**Files:**

- Modify: `frontend/web/src/app/routes/__root.tsx`
- Modify: `frontend/web/src/app/providers/AppProviders.tsx`
- Modify: `docs/development/project-structure.md`
- Create: `frontend/web/src/app/routing/RouteAnnouncer.tsx`
- Create: `frontend/web/src/app/routing/RouteAnnouncer.test.tsx`
- Create: `frontend/web/src/app/routing/routeReachability.test.ts`

**Interfaces:**

- Produces: a documented `@flex-thia/web` development workflow and a passing repository quality gate.

**Existing-decision basis:** Desktop-primary/mobile-secondary support, WCAG 2.2 AA target, no E2E, full static and component verification.

**Minimum implementation:** Route announcement/focus recovery, reachability
regression, workflow documentation, and the complete agreed static/component
gate; no new feature discovered during hardening.

- [ ] **Step 1: Write the failing route-announcement test**

```tsx
describe('RouteAnnouncer', () => {
  it('화면 이동 뒤 제목을 알리고 main landmark로 초점을 옮긴다', async () => {
    render(
      <>
        <main id='app-main' tabIndex={-1}>
          문제 목록 본문
        </main>
        <RouteAnnouncer title='문제 목록' mainId='app-main' />
      </>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('문제 목록');
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
    expect(document.title).toBe('문제 목록 | FLEX THIA');
  });
});
```

Run:

```bash
pnpm --filter @flex-thia/web test -- RouteAnnouncer.test.tsx
```

Expected: FAIL because `RouteAnnouncer` does not exist.

- [ ] **Step 2: Implement route announcement and focus recovery**

Use the Router location boundary to update the Korean page title, announce it through a visually hidden `aria-live='polite'` region, and focus the main landmark after navigation. This Effect is allowed because it synchronizes with browser DOM focus, and it must not fetch data or copy React state.

- [ ] **Step 3: Add the route-reachability regression test**

Create `routeReachability.test.ts` with a table of every approved navigation target and assert that the generated router can build each location:

```ts
const approvedTargets = [
  '/',
  '/login',
  '/login/mfa',
  '/learn',
  '/questions',
  '/history',
  '/vocabularies',
  '/saved-vocabularies',
  '/admin',
  '/admin/totp-setup',
  '/admin/content-imports',
  '/admin/questions',
  '/admin/vocabularies',
] as const;

it.each(approvedTargets)('%s 경로를 route tree에서 찾을 수 있다', (to) => {
  expect(() => router.buildLocation({ to })).not.toThrow();
});
```

Add a second typed table with representative UUID params for learner question
detail, vocabulary detail, content-import detail, administrator question detail,
question-version replacement, and administrator vocabulary detail. This catches
missing dynamic route ownership without calling a backend.

Expected: PASS. A failure returns the defect to the Task that owns the exact route; do not create a new product screen from this hardening Task.

- [ ] **Step 4: Run component tests at responsive viewport contracts**

Use 360px, 768px, and 1280px contracts to verify navigation state, mobile
Sheets, table alternatives, Dialog focus restoration, and absence of duplicate
landmarks. Do not claim that jsdom validates CSS layout: assert shared data and
the required responsive semantic classes for CSS-only behavior, and stub
`matchMedia` only where a component intentionally changes JavaScript behavior.
Do not add Playwright or browser E2E.

- [ ] **Step 5: Run the complete quality gate**

Run:

```bash
pnpm structure:check
pnpm format:check
pnpm lint
pnpm --filter @flex-thia/web architecture:check
pnpm typecheck
pnpm test
pnpm --filter @flex-thia/web coverage
pnpm build
```

Expected: all commands PASS, frontend lines/statements/functions coverage is at least 80%, and branches are at least 75%.

- [ ] **Step 6: Inspect the production bundle and repository diff**

Run:

```bash
pnpm --filter @flex-thia/web build
git status --short
git diff --check
git diff --stat
```

Confirm:

- no backend source changed;
- no raw color, access-token storage, E2E configuration, dark-mode branch, speculative layer, or generated-file manual edit exists;
- no route or large UI chunk is duplicated accidentally;
- unrelated user changes remain untouched.

- [ ] **Step 7: Commit documentation and verification fixes**

Inspect the staged set one last time, then use the Expected commit below.

**Completion conditions:**

- Every active business API operation has an owning frontend module or an explicit non-screen exclusion.
- All agreed loading, empty, error, forbidden, and session states have component coverage.
- The production build and complete repository check pass.
- No E2E artifact exists.

**Expected commit:**

```bash
git add frontend/web docs/development/project-structure.md package.json pnpm-lock.yaml
git commit -m "docs(frontend): document MVP development workflow"
```

---

## Implementation Order and Review Gates

1. Tasks 1–3: foundation gate — approve dependencies, conventions, FSD enforcement, and semantic UI before product work.
2. Tasks 4–7: API/auth gate — verify memory-only auth, single-flight refresh, and protected routing before learner data.
3. Tasks 8–11: learner gate — verify complete learner MVP and responsive behavior.
4. Tasks 12–16: administrator gate — verify import, audio, question, and vocabulary operations.
5. Tasks 17–18: hardening gate — verify recovery, contract coverage, accessibility, coverage, and production build.

Do not continue past a gate when:

- a new shared abstraction, package, FSD layer, public API, or backend requirement appears;
- Swagger and the UI requirement disagree;
- a component's state owner or responsibility is unclear;
- an agreed Task needs a larger scope.

In those cases, stop and present the exact conflict, options, trade-offs, and recommendation to the user.

## Final Acceptance Checklist

- [ ] Current branch/worktree only; no PR or branch created.
- [ ] Backend source and contracts unchanged.
- [ ] All active auth, learner, and administrator workflows are reachable.
- [ ] Access token is memory-only and refresh is single-flight.
- [ ] 401/403 code-aware state transitions match the approved decision table.
- [ ] Every component uses semantic tokens only.
- [ ] Progressive FSD and public APIs pass Steiger.
- [ ] Tests avoid library reimplementation and use Korean descriptions.
- [ ] No E2E, dark mode, optimistic update, external monitoring, or deferred product feature exists.
- [ ] Lint, architecture check, typecheck, tests, coverage, and build all pass.
