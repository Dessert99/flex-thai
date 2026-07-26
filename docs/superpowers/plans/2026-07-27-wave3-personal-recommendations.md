# Wave 3 Personal Recommendations 구현 계획

1. PERSONALIZED/FALLBACK과 이유 code를 포함한 strict 공개 계약 실패 테스트를 작성한다.
2. 의미 신호 distinct 계산, 문제·어휘 점수, 상태 제외와 결정적 tie-break를 전용 read query로 구현한다.
3. 실제 PostgreSQL fixture로 4개 신호 fallback, 5개 신호 personalized, 재시도 중복과 숨김·무효 제외를 검증한다.
4. learner 전용 Controller·service·module을 구현하고 내부 score를 공개하지 않는다.
5. 학습자 홈을 단일 추천 요청으로 교체해 이유, fallback 안내와 문제·어휘 상세 링크를 표시한다.
6. 계약·DB·API·컴포넌트 테스트, architecture, lint, typecheck, coverage와 build를 통과한다.
7. root module, OpenAPI와 infra route는 통합 담당자에게 남기고 append-only export만 마지막 커밋에 모은다.

추천 결과나 숙련도 테이블을 만들지 않으며 legacy saved vocabulary,
hover, 음성 재생과 무효 문제 기록을 읽지 않는다.
