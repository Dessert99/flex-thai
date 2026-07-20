# 트러블슈팅 기록

문제를 해결한 뒤 나중에 다시 읽고 배울 수 있도록 남긴 기록이다. 증상만이
아니라 왜 그렇게 동작했는지와 처음에 왜 잘못 짚었는지를 함께 남긴다.

아래 표는 증상이 아니라 교훈을 싣는다. 지금 같은 에러를 겪는 중이라면
폴더 전체를 에러 문구로 검색하고, 복습이 목적이라면 이 표만 훑는다.

새 문서는 `/troubleshooting-doc` 스킬로 작성한다. 규칙은
[.agents/skills/troubleshooting-doc/SKILL.md](../../.agents/skills/troubleshooting-doc/SKILL.md)에
있다.

- 파일명: `YYYY-MM-DD-slug.md` (slug는 영어 kebab-case)
- 영역: `infra` `api` `worker` `web` `packages` `tooling`

## 목록

| 날짜 | 영역 | 교훈 | 문서 |
| --- | --- | --- | --- |
| 2026-07-20 | tooling | 워크스페이스 도구는 실제 실행 디렉터리에 직접 선언하고, 번들링 테스트는 깨끗한 설치와 제한된 병렬성에서 검증하라. | [GitHub Actions의 CDK 번들링이 esbuild를 찾지 못함](./2026-07-20-ci-cdk-esbuild-not-found.md) |
