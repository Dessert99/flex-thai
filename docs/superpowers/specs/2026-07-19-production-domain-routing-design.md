# 운영 도메인 라우팅 설계

## 목적

FLEX THIA의 운영 주소를 다음 세 주소로 고정한다.

- `https://www.pleasegraduate.me`: 사용자가 접속하는 정식 웹 주소
- `https://pleasegraduate.me`: 정식 웹 주소로 이동시키는 보조 주소
- `https://api.pleasegraduate.me`: 프론트엔드가 호출하는 API 주소

현재 인프라 코드의 `app.pleasegraduate.me`와 API Gateway 기본 주소는
운영 주소로 사용하지 않는다.

## 설계 원칙

`www.pleasegraduate.me`를 유일한 정식 웹 주소로 사용한다. 루트 도메인으로
들어온 요청은 경로와 쿼리 문자열을 유지한 채 `www` 주소로 영구
리다이렉트한다. 이렇게 하면 사용자에게 보이는 주소와 프론트엔드의 origin을
하나로 유지할 수 있다.

API는 웹과 분리된 `api.pleasegraduate.me`를 사용한다. API Gateway가
제공하는 임의의 기본 주소는 내부 배포 결과로만 남기고, 프론트엔드 설정과
운영 문서에서는 사용자 지정 도메인을 사용한다.

## 구성 요소

### CloudFront와 웹 DNS

버지니아 북부(`us-east-1`)의 `EdgeStack`이 다음 자원을 소유한다.

- `pleasegraduate.me`와 `www.pleasegraduate.me`를 포함하는 ACM 인증서
- 두 주소를 alternate domain name으로 등록한 기존 CloudFront 배포
- `pleasegraduate.me` 요청을 `www.pleasegraduate.me`로 바꾸는
  viewer-request CloudFront Function
- 루트 도메인과 `www`가 CloudFront를 가리키는 Route 53 A·AAAA alias

CloudFront 배포는 하나만 사용한다. 리다이렉트 전용 S3 웹 사이트나 별도
CloudFront 배포는 만들지 않는다.

CloudFront Function은 요청의 `Host`가 루트 도메인일 때만 HTTPS `308`
응답을 반환한다. 리다이렉트 URL에는 원래 path와 query string을 보존한다.
`www` 요청은 기존 S3 웹 origin과 `/media/*` 동작으로 계속 전달한다.

### API 사용자 지정 도메인

서울(`ap-northeast-2`)의 `ApplicationStack`이 다음 자원을 소유한다.

- `api.pleasegraduate.me` ACM 인증서
- API Gateway HTTP API의 Regional 사용자 지정 도메인
- 사용자 지정 도메인의 빈 경로를 HTTP API 기본 stage에 연결하는 API mapping
- `api.pleasegraduate.me`가 API Gateway를 가리키는 Route 53 A alias

API 경로는 변경하지 않는다. 예를 들어 상태 확인 주소는
`https://api.pleasegraduate.me/health`가 된다.

### 애플리케이션 설정

운영 웹 origin은 `https://www.pleasegraduate.me`로 통일한다.

- API Gateway CORS 허용 origin
- Lambda의 `ALLOWED_ORIGINS`
- Cognito passwordless 인증 링크의 `appUrl`
- CloudFormation의 웹·API URL output
- 배포 및 계정 설정 문서

로컬 개발 origin인 `http://localhost:5173`은 그대로 유지한다.

## 요청 흐름

### 웹 요청

1. 사용자가 `pleasegraduate.me/lessons?level=1`에 접속한다.
2. Route 53이 요청을 기존 CloudFront 배포로 보낸다.
3. CloudFront Function이 루트 도메인을 확인한다.
4. 브라우저는 `https://www.pleasegraduate.me/lessons?level=1`로 이동한다.
5. CloudFront가 S3의 프론트엔드 파일을 전달한다.

사용자가 처음부터 `www.pleasegraduate.me`로 접속하면 리다이렉트 없이
5단계로 진행한다.

### API 요청

1. 프론트엔드가 `https://api.pleasegraduate.me/...`를 호출한다.
2. Route 53 alias가 요청을 서울 리전 API Gateway로 보낸다.
3. API mapping이 요청을 기존 HTTP API 기본 stage에 전달한다.
4. API Gateway가 기존 route·JWT authorizer·Lambda 통합을 적용한다.

### 비공개 미디어 요청

서명된 미디어 URL은 정식 웹 호스트인
`https://www.pleasegraduate.me/media/...`를 사용한다. 기존 CloudFront
key group과 `/media/*` 동작은 변경하지 않는다.

## 오류와 안전장치

- 루트 도메인이 아닌 요청에는 리다이렉트 함수를 적용하지 않는다.
- 리다이렉트 시 path와 query string을 잃지 않는다.
- API 인증서와 API Gateway 사용자 지정 도메인은 같은 서울 리전에 둔다.
- CloudFront 인증서는 CloudFront 요구사항에 맞게 버지니아 북부에 둔다.
- 기존 S3 bucket, CloudFront 배포, API route, 인증 정책, 미디어 서명 정책은
  교체하거나 완화하지 않는다.
- CDK가 Route 53 레코드를 소유하므로 가비아에는 별도 A·CNAME 레코드를
  만들지 않는다.
- 첫 배포 전에 CDK template에서 기존 `app` 레코드가 사라졌는지 확인한다.

## 테스트와 검증

단위 테스트에서 합성된 CloudFormation template을 기준으로 다음을 확인한다.

- CloudFront 인증서와 alternate domain name에 루트·`www`가 포함된다.
- CloudFront Function과 viewer-request 연결이 생성된다.
- 루트·`www`용 Route 53 A·AAAA alias가 생성된다.
- API 인증서, 사용자 지정 도메인, API mapping, Route 53 A alias가 생성된다.
- CORS와 Cognito `appUrl`이 `https://www.pleasegraduate.me`를 사용한다.
- 출력값이 `https://www.pleasegraduate.me`와
  `https://api.pleasegraduate.me`를 사용한다.

구현 후 다음 순서로 검증한다.

1. 관련 인프라 단위 테스트
2. 인프라 전체 테스트와 typecheck
3. 테스트용 context를 사용한 `cdk synth`
4. 실제 production context와 SSO profile을 사용한 `cdk diff`

`cdk diff`까지 확인한 뒤에만 GitHub `deploy-production` workflow를
수동 실행한다.

## 범위 밖

이번 변경에는 다음 작업을 포함하지 않는다.

- 프론트엔드 애플리케이션 구현
- API route 또는 데이터베이스 schema 변경
- 이메일 발신 주소 변경
- 별도 staging 도메인 도입
- WAF 또는 다중 리전 장애 조치
- 실제 AWS 배포 실행
