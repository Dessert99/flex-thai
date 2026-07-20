# CI esbuild 실행 경로 설계

## 문제

CDK `NodejsFunction`은 루트 `pnpm-lock.yaml`을 기준으로 저장소 루트에서
`pnpm exec esbuild`를 실행한다. 현재 `esbuild`는 하위 workspace에만
선언되어 있어 깨끗한 GitHub Actions 설치에서는 실행 파일을 찾지 못한다.
실행 파일을 추가한 뒤에도 여러 CDK 테스트가 동시에 Lambda를 번들링하면
CPU 경합으로 Vitest 기본 제한인 5초를 간헐적으로 넘긴다.

## 결정

루트 `package.json`의 `devDependencies`에 Vitest/Vite의 peer 범위와
호환되는 `esbuild` `^0.28.0`을 추가한다. CDK 설정, 하위 workspace,
테스트 구조는 변경하지 않는다. 공통 Vitest 설정에서는 테스트 파일을
직렬 실행해 CDK 번들링의 CPU 경합을 제거한다.

## 검증

깨끗한 worktree에서 수정 전 루트 `pnpm exec esbuild --version` 실패를
확인한다. 병렬 실행의 시간 초과와 단일 worker 실행의 성공을 비교한 뒤
수정 후 `pnpm check`, `pnpm infra:synth`가 모두 성공하는지 확인한다.
