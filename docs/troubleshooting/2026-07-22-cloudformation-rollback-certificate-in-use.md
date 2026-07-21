# Application stack rollback이 사용 중인 ACM 인증서를 삭제하지 못함

> 교훈: CloudFormation의 최초 생성 실패와 rollback 중 발생한 정리 실패를 분리하고, 의존 자원이 해제된 뒤 실패 stack만 정리하라.

- 날짜: 2026-07-22 · 영역: infra · 커밋: 없음

## 주요 개념

### ACM 인증서와 API 사용자 도메인

AWS Certificate Manager(ACM)는 HTTPS 연결에 쓰는 인증서를 관리한다. 이
프로젝트의 Application stack은 API Gateway 사용자 도메인에 서울 리전의 ACM
인증서를 연결해 `api` 주소를 HTTPS로 제공한다.

인증서가 API Gateway 같은 다른 자원에 연결된 동안에는 ACM이 삭제를 거부한다.
따라서 CloudFormation은 보통 사용자 도메인 연결을 먼저 없애고 인증서를 삭제해야
한다.

### Rollback과 `ROLLBACK_FAILED`

CloudFormation은 stack 생성 중 한 자원이 실패하면 이미 만든 자원을 가능한 한
되돌린다. 이 과정이 rollback이다. 최초 오류가 해결돼도 rollback 자체가 다른
자원 삭제에서 실패하면 stack은 `ROLLBACK_FAILED`에 머문다.

`ROLLBACK_FAILED` stack은 그대로 다시 배포하기 어려우므로 어떤 자원이 최초
실패를 만들었는지와 어떤 자원이 정리를 막았는지를 각각 확인해야 한다.

## 증상

1. Cognito의 잘못된 `snsRegion` 때문에 `FlexThiaApplicationProd` 생성이 실패해 rollback이 시작됐다.
2. CloudFormation은 API Gateway 사용자 도메인을 삭제한 직후 ACM 인증서 삭제를 시도했지만 인증서가 사용 중이라는 응답을 받았다.
3. Application stack은 아래 오류와 함께 `ROLLBACK_FAILED`에 머물렀다.

    ```text
    Certificate ... is in use.
    Error Code: ResourceInUseException
    ```

    ```text
    The following resource(s) failed to delete: [HttpApiCertificate76060F2A].
    ```

## 원인

1. 직접적인 배포 실패 원인은 Cognito User Pool의 `Invalid snsRegion`이었고, 인증서 오류는 그 뒤 rollback 과정에서 발생했다.
2. ACM은 삭제 시점에 `HttpApiCertificate76060F2A`를 참조하는 사용 관계가 남아 있다고 판단했다.
3. CloudFormation은 이 인증서를 삭제하지 못해 stack 정리를 완료할 수 없었다.
4. 로그만으로는 삭제 시점에 어떤 AWS 내부 참조가 마지막까지 남았는지 별도로 식별하지 못했으므로 그 이상의 원인은 확정하지 않는다.

## 어떻게 찾았나

1. GitHub Actions의 마지막 오류만 보면 인증서가 전체 배포의 최초 원인처럼 보였다.
2. CloudFormation 이벤트를 시간순으로 확인해 Cognito `CREATE_FAILED`가 먼저이고 인증서 `DELETE_FAILED`는 rollback 중 나중에 발생했음을 확인했다.
3. `AWS::ApiGatewayV2::DomainName` 삭제 이벤트와 ACM `ResourceInUseException`을 함께 확인해 stack 정리 의존성 문제로 분리했다.
4. 데이터 stack은 이미 `CREATE_COMPLETE`였으므로 정리 대상에서 제외하고 실패한 Application·Edge 배포 상태만 확인했다.

## 해결

1. Cognito의 `snsRegion` 코드 오류를 먼저 수정해 다음 배포가 같은 최초 실패를 반복하지 않게 했다.
2. API 도메인 관련 자원이 정리된 뒤 실패한 `FlexThiaApplicationProd`와 실행되지 않은 Edge stack 상태를 제거했다.
3. 정상 상태인 `FlexThiaDataProd`는 삭제하지 않고 보존했다.
4. 깨끗한 상태에서 다시 배포해 Application stack과 인증서가 정상 생성되는 것을 확인했다.
