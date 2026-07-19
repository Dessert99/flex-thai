# CI esbuild 실행 경로 설계

## 문제

CDK `NodejsFunction`은 루트 `pnpm-lock.yaml`을 기준으로 저장소 루트에서
`pnpm exec esbuild`를 실행한다. 현재 `esbuild`는 하위 workspace에만
선언되어 있어 깨끗한 GitHub Actions 설치에서는 실행 파일을 찾지 못한다.

## 결정

루트 `package.json`의 `devDependencies`에 하위 workspace와 같은
`esbuild` 버전 범위인 `^0.25.0`을 추가한다. CDK 설정과 테스트 구조는
변경하지 않는다.

## 검증

깨끗한 worktree에서 수정 전 루트 `pnpm exec esbuild --version` 실패를
확인하고, 수정 후 같은 명령과 `pnpm check`, `pnpm infra:synth`가 모두
성공하는지 확인한다.
