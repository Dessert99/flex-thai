# Wave 3 Vocabulary Relations Merge 구현 계획

1. 관계·merge preview·merge command와 학습자 공개 관계 계약 실패 테스트를 작성한다.
2. 자기 관계, 양방향 중복, 상태 전이, 같은 kind·대표 PUBLISHED·merge chain 금지 도메인 테스트를 통과시킨다.
3. relation·merge history와 `MERGED` 상태를 vocabulary schema에 추가한다.
4. preview fingerprint와 SERIALIZABLE merge repository를 구현하고 실제 PostgreSQL에서 모든 live FK 이동과 snapshot 보존을 검증한다.
5. preview 뒤 token, wordbook, practice, target 상태 변경과 동시 역방향 병합이 전체 rollback되는지 검증한다.
6. ADMIN+MFA relation·preview·merge API와 stable 404/409 오류를 구현한다.
7. 기존 관리자 어휘 상세에 관계·비교·병합 UI를, 학습자 상세에 PASSED 관계만 추가한다.
8. 기능 테스트, lint, typecheck, coverage와 build를 통과하고 공통 조립·migration은 통합 담당자에게 남긴다.

병합은 practice text/json snapshot, answer, 신고 snapshot/history, import
결과와 기존 audit을 수정하지 않는다.
