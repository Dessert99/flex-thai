# 서울 Cognito User Pool이 잘못된 SNS 리전으로 생성에 실패함

> 교훈: 한 리전에 만드는 서비스가 다른 서비스도 같은 리전을 쓴다고 가정하지 말고, 서비스 간 리전 대응 규칙을 별도로 확인하라.

- 날짜: 2026-07-22 · 영역: infra · 커밋: `fb5d342`

## 주요 개념

### Cognito User Pool

Amazon Cognito User Pool은 회원 계정, 로그인, 토큰 발급, 비밀번호 정책을 관리하는
AWS 서비스다. 이 프로젝트는 한국외대 이메일을 확인한 뒤 Cognito 계정을 만들고,
이메일과 비밀번호로 인증하도록 사용한다.

User Pool은 서울 `ap-northeast-2`에 생성되지만, 전화번호 확인용 SMS를 직접
전송하지는 않는다. SMS 발송은 별도 서비스인 Amazon SNS와 IAM 역할을 사용한다.

### 서비스 간 리전 대응

AWS 리전은 서비스 자원이 놓이는 지리적 단위지만 모든 서비스 조합이 같은 리전끼리
연결되는 것은 아니다. Cognito는 User Pool 리전에 따라 SMS를 보낼 SNS 리전을
제한한다.

이번 배포에서 서울 Cognito가 허용한 SMS 리전은 도쿄 `ap-northeast-1`이었다.
CDK stack의 리전인 서울을 `snsRegion`에도 그대로 넣자 Cognito가 User Pool 생성
요청을 거부했다.

## 증상

1. Lambda 동시 실행 할당량 문제를 해결한 뒤 `FlexThiaApplicationProd` 배포가 Cognito User Pool 생성에서 다시 실패했다.
2. CloudFormation은 `Identity/UserPool`을 `CREATE_FAILED`로 표시하고 Application stack rollback을 시작했다.
3. Cognito는 아래 오류를 반환했다.

    ```text
    Invalid snsRegion. Allowed SNS region for ap-northeast-2 is ap-northeast-1
    ```

## 원인

1. `infra/src/constructs/identity.ts`는 `snsRegion`에 `Stack.of(this).region`을 사용했다.
2. Application stack이 서울에 있으므로 합성된 `snsRegion`도 서울 `ap-northeast-2`가 됐다.
3. AWS Cognito의 서울 User Pool은 SMS용 SNS 리전으로 도쿄 `ap-northeast-1`만 허용했다.
4. User Pool과 SMS 전달 서비스가 같은 리전을 써야 한다는 가정이 AWS의 서비스 간 리전 규칙과 맞지 않았다.

## 어떻게 찾았나

1. CloudFormation 이벤트에서 여러 rollback 메시지보다 앞선 최초 `CREATE_FAILED` 자원이 `AWS::Cognito::UserPool`임을 확인했다.
2. 오류가 허용 리전과 받은 리전을 모두 명시했으므로 IAM 역할이나 SMS 지출 한도 문제를 배제했다.
3. `identity.ts`의 `snsRegion: Stack.of(this).region`이 실제로 서울 값을 만드는 것을 확인했다.
4. 요구된 도쿄 리전을 설계도에 명시한 뒤 합성된 User Pool 속성으로 확인했다.

## 해결

1. `infra/src/constructs/identity.ts`의 `snsRegion`을 `ap-northeast-1`로 명시했다.
2. 서울 stack 전체를 도쿄로 옮기지 않고 Cognito SMS 전달에 필요한 SNS 리전만 변경했다.
3. 실패 stack을 정리한 뒤 다시 배포해 Cognito User Pool 생성을 통과했다.

## 재발 방지

1. `infra/test/identity.spec.ts`에서 서울 Cognito User Pool의 `SmsConfiguration.SnsRegion`이 `ap-northeast-1`인지 검증한다.
2. 여러 AWS 서비스를 연결하는 리전 설정은 stack 기본 리전을 기계적으로 재사용하지 않고 각 서비스의 대응 규칙을 확인한다.
