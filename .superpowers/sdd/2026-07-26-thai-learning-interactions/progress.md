# SDD ledger — plan: docs/superpowers/plans/2026-07-26-thai-learning-interactions.md

Baseline: `21f90f5`; `pnpm typecheck` PASS; shared baseline `pnpm test` PASS (158 files passed, 2 skipped; 881 tests passed, 45 skipped).

Decision: `PublicThaiSentence` keeps the existing `sentenceVersionId` and content/tokens/expressions shape; question wrappers continue to own position/speaker/displayMode.

Task 1: complete — ba6e8ba — 3 files/22 tests PASS; contracts typecheck PASS.

Task 2: complete — 9103c44 — 5 files/91 tests PASS; domain/contracts typecheck PASS.

Task 3: complete — 86e82d0 — 6 files/76 tests PASS, 18 skipped; database typecheck PASS.

Decision: canonical inline span input uses block/sentence positions; domain resolve converts it to the generated sentenceVersionId before persistence and public projection.

Task 4: complete — da261e2 — 4 files/52 tests PASS; domain/contracts typecheck PASS.

Task 5: complete — e5b8346 — 7 files/94 tests PASS, 10 skipped; domain/contracts/database typecheck PASS.

Task 6: complete — d04630d — 3 files/21 tests PASS; API typecheck PASS.

Task 7: complete — pending commit — 2 files/5 tests PASS; contracts typecheck PASS. Web package typecheck is deferred to Task 8 because the expanded nullable sentence audio contract requires its planned question view-model update.

Task 7 commit: 8e6d2ea.

Task 8: complete — pending commit — 2 files/6 tests PASS; web typecheck PASS.

Task 8 commit: 90631a0.

Task 9: complete — pending commit — 2 files/9 tests PASS; web typecheck PASS.

Task 9 commit: 9dbf8bc.

Task 10: complete — focused contracts 23, domain 53, database 37 (14 skipped), API 8, web 16 tests PASS; structure/typecheck PASS; architecture PASS with polling after environmental EMFILE. The new feature follows the existing single-consumer slice exception until Task 11 adds the vocabulary-detail consumer.

Task 10 commit: a5586cb. Final quality follow-up: format/lint PASS; web 16 tests, repository typecheck, architecture with polling PASS; no package/lock/migration/routeTree changes.

Final review fix: complete — standard options now require `sentence` with `span: null`, inline options require `sentence: null` with a question-sentence span across contracts/domain/database/API/UI. Inline persistence creates no option sentence, radios use server-confirmed state and lock while pending, marks use QUESTION sentence coordinates with sibling token feedback, annotation audio uses one coordinator with accessible rejection status, and public coordinates reject fractions. Verification: structure/architecture/format/lint/typecheck PASS; full test 162 files and 913 tests PASS (2 files and 45 tests skipped); no package/lock/migration/routeTree/vocabulary-detail changes.

Re-review fix: complete — overlapping valid inline spans render as independent option rows. Each row preserves the QUESTION sentence exactly once, marks only its own span, keeps token feedback outside the mark, and links its radio to that mark with `aria-describedby`. `[0,2)` and `[1,3)` component regression PASS; related web 14 tests, web typecheck, focused lint/format, and architecture PASS.
