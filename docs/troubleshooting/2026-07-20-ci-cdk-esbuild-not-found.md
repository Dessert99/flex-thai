# GitHub Actions의 CDK 번들링이 esbuild를 찾지 못함

> 교훈: 워크스페이스 도구는 실제 실행 디렉터리에 직접 선언하고, 번들링 테스트는 깨끗한 설치와 제한된 병렬성에서 검증하라.

- 날짜: 2026-07-20 · 영역: tooling · 커밋: `68d09d1`, `9289d23`

## 주요 개념

### pnpm workspace와 의존성 범위

[pnpm workspace](https://pnpm.io/workspaces)는 하나의 저장소 안에 여러
JavaScript 프로젝트를 함께 두고 관리하는 구조다. 이 저장소도 루트와
`backend/api`, `backend/worker`, `infra` 등이 각각 자기 `package.json`을 가진다.

lockfile과 설치 공간을 공유하더라도 각 프로젝트가 사용할 수 있다고
보장되는 패키지는 자기 `package.json`에 선언한 항목이다. `pnpm exec`는
명령을 실행한 프로젝트에서 설치된 패키지의 명령을 모아 둔
`node_modules/.bin`을 검색하므로, 저장소 루트에서 실행할 도구는 루트
의존성으로 선언해야 한다.

### CDK `NodejsFunction`과 번들링

AWS CDK는 TypeScript 코드로 AWS 리소스 구성을 작성하게 해 주는 도구다.
CDK에서 stack은 함께 배포하고 관리할 AWS 리소스의 묶음을 뜻하며, AWS
Lambda는 서버를 직접 관리하지 않고 함수 코드를 실행하는 서비스다.

[`NodejsFunction`](https://docs.aws.amazon.com/cdk/api/v2/python/aws_cdk.aws_lambda_nodejs/README.html)은
Node.js Lambda 함수와 배포용 코드를 함께 만드는 CDK 구성 요소다.

번들링은 여러 소스 파일과 필요한 패키지를 Lambda가 실행할 수 있는 작은
결과물로 묶는 과정이다. 이 저장소의 `NodejsFunction`은 루트
`pnpm-lock.yaml`을 기준으로 번들링 작업 위치를 정했기 때문에 저장소
루트에서 `esbuild`를 실행했다. lockfile은 설치할 패키지의 정확한 버전을
기록하는 파일이다.

### `esbuild`

[`esbuild`](https://esbuild.github.io/getting-started/)는 TypeScript와
JavaScript 파일을 실행 환경에 맞는 JavaScript 결과물로 빠르게 변환하고
묶는 빌드 도구다. 터미널에서 실행하는 `esbuild` 명령은 이 도구의
CLI(command-line interface), 즉 명령줄 실행 파일이다.

CDK는 Lambda 코드를 번들링할 때 이 CLI를 호출한다. 따라서 애플리케이션
코드가 올바르더라도 CDK가 명령을 실행하는 위치에서 `esbuild`를 찾지
못하면 stack 생성과 그 stack을 사용하는 테스트가 먼저 실패한다.

### 깨끗한 CI 설치

CI(Continuous Integration)는 push된 코드를 자동으로 설치하고 검사하는
환경이다. GitHub-hosted runner는 각 job을
[새 가상 머신에서 시작](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners)하므로,
개발자 컴퓨터에 남아 있던 이전 설치 결과를 사용할 수 없다.

이 프로젝트의 CI는 lockfile과 정확히 일치하도록
`pnpm install --frozen-lockfile`을 실행한다. 그래서 로컬 `node_modules`에
우연히 노출된 실행 파일은 로컬에서는 동작해도 CI에서는 사라지며, 선언하지
않은 의존성을 발견하기에 깨끗한 설치가 중요하다.

### Vitest 병렬 실행과 자원 경합

[Vitest](https://vitest.dev/guide/parallelism.html)는 기본적으로 여러 테스트
파일을 서로 다른 worker에서 동시에 실행한다. 여기서 worker는 테스트를
나눠 실행하는 별도 프로세스나 스레드다. 보통은 검사 시간이 줄어들지만,
여러 작업이 CPU나 메모리 같은 한정된 자원을 동시에 많이 쓰면 각 작업이
느려지는 자원 경합이 생길 수 있다.

이 저장소의 인프라 테스트는 CDK stack을 만들 때마다 여러 Lambda 번들링
프로세스를 시작한다. 여러 테스트 파일이 이를 동시에 수행하자 일부 테스트가
5초 제한을 넘겼고, `fileParallelism: false`로 파일을 하나씩 실행하자 같은
테스트가 안정적으로 통과했다.

## 증상

1. `main` push로 실행된 GitHub Actions의 `pnpm check`에서 인프라 테스트 5개 파일과 테스트 15개가 실패했다.
2. 실패한 테스트는 CDK stack 생성 중 `NodejsFunction`의 Lambda 번들링을 시작한 테스트들이었다.
3. GitHub Actions 로그에는 아래 오류와 실패 집계가 반복해서 출력됐다.

    ```text
    undefined
     ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "esbuild" not found

    Did you mean "pnpm exec eslint"?

     Test Files  5 failed | 40 passed (45)
          Tests  15 failed | 69 passed (84)
    Error: Process completed with exit code 1.
    ```

## 원인

1. CDK `NodejsFunction`은 루트 `pnpm-lock.yaml`을 기준으로 저장소 루트에서 `pnpm exec esbuild`를 실행했다.
2. `esbuild`는 `backend/api`, `backend/worker`, `infra` 같은 하위 workspace에만 선언되어 있었고 루트 `package.json`에는 직접 선언되어 있지 않았다.
3. 로컬 설치 상태에서는 루트 실행 파일이 우연히 노출될 수 있다는 가정이 깨끗한 GitHub Actions 설치에서 깨져 CDK가 번들러를 찾지 못했다.

## 어떻게 찾았나

1. 처음에는 편집기에서 오류가 표시된 `infra/test/config.spec.ts`를 의심했다.
2. 같은 GitHub Actions 로그에서 `infra/test/config.spec.ts`의 테스트 5개가 모두 통과한 것을 확인해 이 가설을 배제했다.
3. 실패 stack마다 저장소 루트에서 실행된 `pnpm exec -- esbuild`가 상태 코드 254로 종료된 것을 확인해 CLI 해석 경로로 범위를 좁혔다.
4. 깨끗한 설치 환경에서 `pnpm exec esbuild --version`을 실행해 `Command "esbuild" not found`를 재현했고 루트 의존성 누락을 확정했다.
5. 루트에 `esbuild`를 추가한 뒤 전체 검사를 반복하자 여러 CDK 테스트가 Vitest 기본 제한인 5초를 간헐적으로 넘기는 별도 문제가 드러났다.
6. `pnpm exec vitest run infra/test --maxWorkers=1`에서 인프라 테스트 8개 파일과 테스트 28개가 모두 통과해 동시 Lambda 번들링의 CPU 경합을 확인했다.

## 해결

1. 루트 `package.json`의 `devDependencies`에 `esbuild` `^0.28.0`을 직접 선언하고 `pnpm-lock.yaml`에 해석된 `0.28.1`을 기록했다.
2. 처음 검토한 `esbuild` `^0.25.0`은 Vite 8 peer 경고를 만들었으므로 Vite와 CDK 양쪽에 호환되는 `^0.28.0`을 선택했다.
3. `vitest.config.ts`에 `fileParallelism: false`를 설정해 여러 테스트 파일이 CDK Lambda 번들링을 동시에 실행하지 않게 했다.
4. 시간 제한만 늘리지 않고 CLI 누락과 CPU 경합을 각각 제거했으며 `pnpm check`, `pnpm infra:synth`, GitHub Actions `check #4`의 성공으로 확인했다.
