# SDD ledger — plan: docs/superpowers/plans/2026-07-26-multiple-wordbooks.md

Baseline: `21f90f5`; `pnpm typecheck` PASS; shared baseline `pnpm test` PASS (158 files passed, 2 skipped; 881 tests passed, 45 skipped).

Task 1: complete — e06e23e — `pnpm exec vitest run shared/contracts/src/learning/wordbooks.spec.ts` (1 file, 7 tests PASS)
Task 2: complete — 749f3f3 — `pnpm exec vitest run backend/domain/src/learning/wordbook.spec.ts` (1 file, 6 tests PASS)
Task 3: complete — 47692c8 — `pnpm exec vitest run backend/database/src/schema/learning.schema.spec.ts` (1 file, 15 tests PASS)
Task 4: complete — 273962f — `pnpm exec vitest run backend/database/src/repositories/drizzle-wordbook.repository.spec.ts` (1 file, 9 tests PASS; PostgreSQL 3 tests skipped without env)
Task 5: complete — 9942a05 — `pnpm exec vitest run backend/database/src/queries/drizzle-wordbook.query.spec.ts` (1 file, 4 tests PASS)
Task 6: complete — acdf0fc — `pnpm exec vitest run backend/domain/src/learning/saved-content.spec.ts backend/database/src/repositories/drizzle-learning.repository.spec.ts backend/database/src/queries/drizzle-learner-vocabulary.query.spec.ts shared/contracts/src/learning/vocabularies.spec.ts` (4 files, 29 tests PASS; 11 PostgreSQL tests skipped without env)
Task 7: complete — 1ed4ad6 — `pnpm exec vitest run backend/api/src/learning/learner-wordbooks.service.spec.ts backend/api/src/learning/learner-wordbooks.controller.spec.ts` (2 files, 12 tests PASS)
Task 8: complete — 97a0aff — `pnpm --filter @flex-thia/web exec vitest run src/pages/wordbook-list src/features/manage-wordbook` (2 files, 5 tests PASS)
Task 9: complete — 4c68cff — `pnpm --filter @flex-thia/web exec vitest run src/pages/wordbook-detail src/features/manage-wordbook-items` (3 files, 8 tests PASS)
Task 10: complete — 0c3fc65 — `pnpm --filter @flex-thia/web exec vitest run src/features/save-vocabulary-to-wordbooks` (1 file, 3 tests PASS)
Task 11: complete — dc809a8 — contracts 66, domain 185, database 188, API 168, web 222 tests PASS; structure, architecture, lint, typecheck, web build PASS (API test requires `build:lambda` prerequisite)
Final review fix: complete — delayed cutover 유지. Tasks 12–15의 migration·route cutover 전까지 공용 `saved` projection과 기존 저장 목록·쓰기는 `saved_vocabularies`를 단일 기준으로 유지하고, 신규 단어장 화면만 전용 membership query를 사용한다. Tasks 12–15에서 migration과 route cutover를 함께 수행한 뒤 공용 `saved` projection을 wordbooks로 전환하고 legacy boundary를 제거한다. `src/pages/wordbook-list/**`, `src/pages/wordbook-detail/**`의 scoped `fsd/excessive-slicing` 예외도 old saved-vocabularies page를 제거하는 Task 15에서 함께 삭제한다.
