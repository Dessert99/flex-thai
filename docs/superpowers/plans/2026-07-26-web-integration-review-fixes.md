# Web Integration Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어휘 상세 번역·membership route 전환·FSD gate의 독립 리뷰 결함을 최소 변경으로 수정한다.

**Architecture:** 재사용 문장 컴포넌트에는 선택적 번역 표시 계약만 추가하고, 어휘별 picker state의 수명은 Page View의 React key로 제한한다. Steiger recommended 규칙은 유지한 채 page layer 진단만 좁게 예외 처리한다.

**Tech Stack:** React 19, TanStack Query, Testing Library, Vitest, Steiger, TypeScript 7

## Global Constraints

- 구현 코드보다 사용자에게 보이는 렌더와 HTTP command를 테스트한다.
- Vitest 설명은 한국어로 작성한다.
- 변경하는 export와 컴포넌트는 주석·프론트엔드 컨벤션을 유지한다.
- E2E 테스트를 추가하지 않는다.
- 세 리뷰 결함과 직접 관련된 파일만 변경한다.

---

### Task 1: 선택적 예문 번역

**Files:**
- Modify: `frontend/web/src/features/explore-thai-content/ui/InteractiveThaiSentence.test.tsx`
- Modify: `frontend/web/src/features/explore-thai-content/ui/InteractiveThaiSentence.tsx`
- Modify: `frontend/web/src/pages/vocabulary-detail/ui/VocabularyDetailPage.test.tsx`
- Modify: `frontend/web/src/pages/vocabulary-detail/ui/VocabularyDetailPageView.tsx`

**Interfaces:**
- Consumes: `PublicThaiSentence.translationKo`
- Produces: `InteractiveThaiSentence({ sentence, showTranslation?: boolean })`

- [ ] **Step 1: 번역 표시 계약의 실패 테스트를 작성한다**

```tsx
const { rerender } = render(
  <InteractiveThaiSentence sentence={sentence} />,
);
expect(screen.queryByText('나는 사랑한다')).not.toBeInTheDocument();
rerender(
  <InteractiveThaiSentence
    sentence={sentence}
    showTranslation
  />,
);
expect(screen.getByText('나는 사랑한다')).toBeVisible();
```

- [ ] **Step 2: RED를 확인한다**

Run: `pnpm --filter @flex-thia/web exec vitest run src/features/explore-thai-content/ui/InteractiveThaiSentence.test.tsx`

Expected: `showTranslation` prop이 없어 typecheck 또는 번역 assertion이 실패한다.

- [ ] **Step 3: 최소 렌더 계약을 구현한다**

```tsx
interface InteractiveThaiSentenceProps {
  sentence: PublicThaiSentence;
  showTranslation?: boolean;
}

{showTranslation ? <p>{sentence.translationKo}</p> : null}
```

어휘 상세의 `InteractiveThaiSentence`에 `showTranslation`을 전달한다.

- [ ] **Step 4: GREEN과 어휘 상세 fixture 번역을 확인한다**

Run: `pnpm --filter @flex-thia/web exec vitest run src/features/explore-thai-content/ui/InteractiveThaiSentence.test.tsx src/pages/vocabulary-detail/ui/VocabularyDetailPage.test.tsx`

Expected: 두 파일 모두 통과하고 `나는 온다` assertion이 통과한다.

### Task 2: 어휘 route 전환 시 picker state 격리

**Files:**
- Modify: `frontend/web/src/pages/vocabulary-detail/ui/VocabularyDetailPage.test.tsx`
- Modify: `frontend/web/src/pages/vocabulary-detail/ui/VocabularyDetailPageView.tsx`

**Interfaces:**
- Consumes: `VocabularyDetailResponse.id`
- Produces: 어휘 ID별로 remount되는 `VocabularyWordbookPicker`

- [ ] **Step 1: A mutation 뒤 B 서버 membership을 검증하는 실패 테스트를 작성한다**

```tsx
const { rerender } = renderWithProviders(
  <VocabularyDetailPageView detail={detailA} onWordbookMembershipConfirmed={vi.fn()} relatedQuestions={[]} />,
);
// A에 PUT해 local confirmedIds를 만든 뒤 detailB로 rerender한다.
rerender(
  <VocabularyDetailPageView detail={detailB} onWordbookMembershipConfirmed={vi.fn()} relatedQuestions={[]} />,
);
expect(await screen.findByRole('button', { name: 'FLEX 핵심' })).toHaveAttribute('aria-pressed', 'false');
```

B 버튼 클릭 뒤 `/items/${detailB.id}`에 `PUT`이 전달되는지도 검증한다.

- [ ] **Step 2: RED를 확인한다**

Run: `pnpm --filter @flex-thia/web exec vitest run src/pages/vocabulary-detail/ui/VocabularyDetailPage.test.tsx`

Expected: B picker가 A의 `confirmedIds`를 유지해 pressed가 `true`이거나 DELETE를 보낸다.

- [ ] **Step 3: picker 수명을 detail ID에 묶는다**

```tsx
<VocabularyWordbookPicker
  key={detail.id}
  onConfirmed={onWordbookMembershipConfirmed}
  vocabularyId={detail.id}
/>
```

- [ ] **Step 4: GREEN을 확인한다**

Run: `pnpm --filter @flex-thia/web exec vitest run src/pages/vocabulary-detail/ui/VocabularyDetailPage.test.tsx`

Expected: B의 pressed 상태가 false이고 B ID 대상 PUT이 발생한다.

### Task 3: FSD excessive-slicing 예외 축소

**Files:**
- Modify: `frontend/web/steiger.config.mjs`

**Interfaces:**
- Consumes: Steiger `fsd/excessive-slicing` 진단 위치
- Produces: `src/pages/**`에만 적용되는 rule override

- [ ] **Step 1: 전역 예외의 원인을 확인한다**

현재 page slice는 24개로 threshold 20을 넘고 features는 11개다. 전역 `off`는 모든 layer 진단을 제거한다.

- [ ] **Step 2: page layer override로 제한한다**

```js
{
  files: ['src/pages/**'],
  rules: {
    'fsd/excessive-slicing': 'off',
  },
},
```

기본 rules object에서는 `fsd/excessive-slicing`을 제거한다.

- [ ] **Step 3: architecture gate를 확인한다**

Run: `CHOKIDAR_USEPOLLING=1 pnpm --filter @flex-thia/web architecture:check`

Expected: exit 0.

### Task 4: 전체 회귀 검증과 커밋

**Files:**
- Verify only

**Interfaces:**
- Consumes: Tasks 1–3의 변경
- Produces: 검증된 웹 통합 수정 commit

- [ ] **Step 1: 전체 gate를 실행한다**

```bash
pnpm --filter @flex-thia/web test
pnpm --filter @flex-thia/web typecheck
CHOKIDAR_USEPOLLING=1 pnpm --filter @flex-thia/web architecture:check
pnpm --filter @flex-thia/web build
pnpm lint
pnpm format:check
```

- [ ] **Step 2: 변경 범위와 diff를 확인한다**

Run: `git diff --check && git status --short && git diff --stat`

Expected: 승인된 웹 파일·설계·계획만 변경되고 whitespace error가 없다.

- [ ] **Step 3: 변경을 커밋한다**

```bash
git add docs/superpowers/specs/2026-07-26-web-integration-review-fixes-design.md docs/superpowers/plans/2026-07-26-web-integration-review-fixes.md frontend/web/src/features/explore-thai-content/ui/InteractiveThaiSentence.tsx frontend/web/src/features/explore-thai-content/ui/InteractiveThaiSentence.test.tsx frontend/web/src/pages/vocabulary-detail/ui/VocabularyDetailPageView.tsx frontend/web/src/pages/vocabulary-detail/ui/VocabularyDetailPage.test.tsx frontend/web/steiger.config.mjs
git commit -m "fix(web): address integration review findings"
```
