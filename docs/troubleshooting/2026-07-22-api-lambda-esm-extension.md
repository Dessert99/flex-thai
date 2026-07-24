# API Lambda가 ESM bundle을 CommonJS로 읽어 시작하지 못함

> 교훈: JavaScript module 형식은 빌드 옵션만으로 결정되지 않으므로, 배포 파일의 확장자와 런타임 해석 규칙까지 함께 맞춰라.

- 날짜: 2026-07-22 · 영역: api · 커밋: `eed051f`

## 주요 개념

### ESM과 CommonJS

Node.js에는 대표적으로 ESM과 CommonJS라는 두 module 형식이 있다. ESM은
`import`와 `export`를 사용하고, CommonJS는 `require()`와 `module.exports`를
사용한다.

Node.js가 `.js` 파일을 어느 형식으로 읽을지는 가장 가까운 `package.json`의
`type` 같은 주변 정보에 따라 달라진다. 반면 `.mjs` 확장자는 파일 자체가 ESM임을
명시하므로 배포 압축 안에 `package.json`이 없어도 해석이 모호하지 않다.

### esbuild bundle과 Lambda handler

esbuild bundle은 TypeScript 소스와 의존성을 Lambda가 실행할 JavaScript 파일로
묶은 결과물이다. 이 프로젝트는 NestJS API를 `format: 'esm'`으로 bundle한다.

Lambda handler 설정 `lambda.handler`는 `lambda`라는 파일에서 `handler` export를
찾으라는 뜻이다. 파일을 찾은 뒤에는 Node.js 런타임이 그 파일의 module 형식을
올바르게 해석해야 실제 NestJS 초기화가 시작된다.

### 빌드 성공과 런타임 성공

CI에서 TypeScript 검사와 bundle 생성에 성공했다는 사실은 결과물의 문법이
올바르다는 뜻이다. AWS Lambda가 압축을 풀어 같은 형식으로 해석하고 요청을 처리할
수 있다는 사실까지 보장하지는 않는다.

이번 문제는 CDK 배포까지 성공한 뒤 실제 `/health` 요청에서만 드러난 런타임
패키징 오류였다.

## 증상

1. `FlexThiaApplicationProd`와 API Lambda 배포는 성공했지만 배포 확인용 `/health`와 `/ready` 요청이 HTTP 500을 반환했다.
2. Lambda가 NestJS 애플리케이션을 초기화하기 전에 module 문법 오류로 종료됐다.
3. CloudWatch에는 아래 오류가 기록됐다.

    ```text
    SyntaxError: Cannot use import statement outside a module
    ```

## 원인

1. `backend/api/esbuild.config.mjs`는 `format: 'esm'`으로 `import`가 들어 있는 ESM bundle을 만들었다.
2. 출력 파일명은 `dist/lambda.js`였고 배포 artifact에는 이 `.js`를 ESM으로 지정할 `package.json`의 `type: module`이 없었다.
3. Lambda의 Node.js 런타임은 `lambda.js`를 CommonJS로 해석한 뒤 ESM `import` 문을 만나 구문 오류를 냈다.
4. esbuild의 출력 형식을 ESM으로 설정하면 어떤 배포 환경에서도 `.js`가 자동으로 ESM으로 해석될 것이라는 가정이 깨졌다.

## 어떻게 찾았나

1. CloudFormation stack이 성공했으므로 AWS 자원 생성 문제와 CDK synth 문제를 배제했다.
2. 배포 probe의 HTTP 500을 따라 Lambda CloudWatch log를 확인해 요청 처리 코드보다 앞선 module 구문 오류를 찾았다.
3. esbuild 설정의 `format: 'esm'`, 실제 출력명 `lambda.js`, artifact에 ESM을 선언할 package metadata가 없다는 세 조건을 대조했다.
4. Node.js가 확장자만으로 ESM을 확정하는 `.mjs`로 결과물을 바꿔 해석 경계를 명확히 했다.

## 해결

1. API bundle 출력 파일을 `dist/lambda.js`에서 `dist/lambda.mjs`로 변경했다.
2. build 전에 `dist`를 비워 같은 handler 이름의 오래된 `.js`가 artifact에 남지 않게 했다.
3. ESM 안에서 일부 CommonJS 의존성을 사용할 수 있도록 기존 `createRequire` banner는 유지했다.
4. 새 bundle을 배포한 뒤 `Cannot use import statement outside a module` 오류가 사라진 것을 확인했다.
5. 이 수정은 module 해석 오류만 해결했으며, 그다음 NestJS 의존성 주입 오류 때문에 API의 HTTP 500 상태는 별도 문제로 남았다.

## 재발 방지

1. `backend/api/src/lambda-bundle.spec.ts`에서 `dist/lambda.mjs`가 존재하고 모호한 `dist/lambda.js`가 남지 않는지 검증한다.
2. Lambda bundle 변경은 로컬 build 성공뿐 아니라 실제 런타임 log와 배포 probe까지 구분해 확인한다.
