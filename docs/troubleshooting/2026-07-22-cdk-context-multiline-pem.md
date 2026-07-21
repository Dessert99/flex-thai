# CloudFront 공개 키의 개행이 CDK 설정 경계에 그대로 남음

> 교훈: 여러 줄 파일 내용은 CLI의 key-value 인수로 운반하지 말고, 입력 경계에서 정규화한 뒤 다중행을 보존하는 별도 전달 수단을 사용하라.

- 날짜: 2026-07-22 · 영역: infra · 커밋: `417f73d`, `ad4eb18`

## 주요 개념

### PEM 파일

PEM은 공개 키와 인증서 같은 이진 데이터를 Base64 문자와 `BEGIN`·`END` 경계로
표현하는 여러 줄 텍스트 형식이다. 일반적인 PEM 파일은 마지막 `END` 줄 뒤에
개행 하나를 포함한다.

이 프로젝트는 비공개 S3 미디어를 CloudFront signed URL로 제공하기 위해 공개 키
PEM을 인프라 설정으로 받는다. 키 내용은 정확히 보존해야 하지만 파일 끝의 관례적인
공백과 개행은 설정값의 일부로 사용할 필요가 없다.

### CDK context와 환경 변수

CDK context는 `-c key=value` 형태로 계정 ID나 도메인처럼 짧은 설정값을 CLI에서
전달하고 CDK 앱이 읽는 기능이다. 값이 shell 명령줄을 통과하므로 따옴표, 공백,
개행 같은 문자 경계를 함께 고려해야 한다.

환경 변수는 실행 프로세스에 별도 값으로 전달되므로 다중행 문자열을 명령 인수
목록에 섞지 않을 수 있다. 이 프로젝트는 일반 설정은 CDK context로 유지하되,
여러 줄 공개 키만 `MEDIA_PUBLIC_KEY_PEM` 환경 변수로 전달한다.

### 검증과 정규화

검증은 값이 PEM 모양인지 판단하는 작업이고, 정규화는 같은 의미의 여러 표현을
하나로 맞추는 작업이다. Zod의 `.regex()`는 형식을 검사하지만 입력 문자열의 마지막
개행을 제거하지 않는다.

이번 설정은 `.trim()`을 먼저 적용해 파일 경계의 공백을 제거한 값을 검증하고,
그 정규화된 값을 CDK 자원에 사용한다.

## 증상

1. 운영 CloudFront 공개 키를 일반적인 PEM 파일에서 읽자 `END PUBLIC KEY` 뒤의 마지막 개행까지 설정값에 남았다.
2. GitHub Actions와 로컬 diff 명령은 이 여러 줄 값을 `-c mediaPublicKeyPem=...` CDK context 인수로 함께 전달했다.
3. AWS 배포 실패가 발생한 뒤 발견한 문제는 아니며, production 사전 검증 과정에서 값의 정규화와 전달 경계가 불안정함을 코드와 테스트로 확인했다.

## 원인

1. `infra/src/config.ts`의 schema는 PEM 정규식으로 모양만 검사하고 입력 문자열을 그대로 반환했다.
2. workflow와 로컬 diff script는 그 다중행 문자열을 단일 CDK CLI context 인수로 만들었다.
3. 파일 형식의 마지막 개행과 shell·CLI 인수의 개행을 application 설정 경계에서 분리하지 않았다.
4. 형식 검증에 통과한 문자열은 추가 정규화 없이 명령줄 인수로 안전하게 운반할 수 있다는 가정이 깨졌다.

## 어떻게 찾았나

1. 표준 PEM 파일처럼 마지막 개행이 있는 입력을 `readInfrastructureConfig`에 넣어 반환값을 확인했다.
2. schema가 형식은 허용해도 반환값의 마지막 개행을 제거하지 않는 것을 확인했다.
3. `.github/workflows/deploy-production.yml`과 `infra/src/local-production-diff.ts`를 따라가 공개 키 전체가 `mediaPublicKeyPem` context 인수로 들어가는 것을 확인했다.
4. 짧은 scalar 설정과 여러 줄 파일 내용을 같은 CLI 전달 방식으로 취급한 것이 공통 경계 문제라고 판단했다.

## 해결

1. PEM schema에 `.trim()`을 추가해 검증 전에 파일 시작과 끝의 관례적인 공백·개행을 제거했다.
2. CDK 앱이 context에 공개 키가 없으면 `MEDIA_PUBLIC_KEY_PEM` 환경 변수에서 읽도록 `readInfrastructureConfigFromSources`를 추가했다.
3. GitHub 배포와 로컬 production diff의 `-c mediaPublicKeyPem=...` 인수를 제거했다.
4. 나머지 계정·도메인·예산 같은 짧은 설정은 기존 CDK context 전달 방식을 유지했다.

## 재발 방지

1. `infra/test/config.spec.ts`에서 마지막 개행이 있는 PEM 입력이 개행 없는 정규화된 값으로 반환되는지 검증한다.
2. 같은 테스트에서 CDK context에 키가 없을 때 환경 변수의 공개 키를 사용하는지 검증한다.
3. `infra/test/local-production-diff.spec.ts`에서 생성된 CDK 인수에 다중행 `mediaPublicKeyPem`이 포함되지 않는지 검증한다.
