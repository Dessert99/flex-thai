# AWS production 배포와 복구 가이드

이 문서는 계정 준비가 끝난 뒤 FLEX THIA 인프라를 처음 배포하고, 실패한
경우 안전하게 멈추거나 복구하는 절차다. 현재 production 배포는 자동으로
실행되지 않는다.

## 배포 버튼을 누르면 일어나는 일

`.github/workflows/deploy-production.yml`은 다음 순서로 실행된다.

```text
GitHub production 승인
  → 설정 누락 검사
  → format·lint·type·unit test·build·CDK synth
  → API subdomain Vite build·artifact verifier
  → OIDC로 AWS 임시 권한 획득
  → cdk diff
  → DataStack 배포
  → Aurora migration
  → production TTS 음성 preset bootstrap
  → ApplicationStack 배포
  → EdgeStack 배포
```

각 단계의 뜻은 다음과 같다.

| 단계 | 하는 일 | 실패하면 |
| --- | --- | --- |
| GitHub environment 승인 | 사람이 이번 운영 변경을 허용한다. | AWS에는 아무 변화가 없다. |
| `pnpm check`, `infra:synth` | 코드와 CloudFormation 설계도가 유효한지 검사한다. | AWS에는 아무 변화가 없다. |
| `node scripts/build-production-web.mjs "$ROOT_DOMAIN"` | `https://api.<ROOT_DOMAIN>/api/v1`을 주입한 Vite dist를 build하고 probe·API URL·chunk 크기를 검증한다. | AWS에는 아무 변화가 없다. |
| OIDC | 장기 access key 없이 이번 실행용 권한을 받는다. | role trust와 GitHub 설정을 고친다. |
| `cdk diff` | 현재 AWS와 새 설계도의 차이를 출력한다. | 권한·bootstrap·context를 확인한다. |
| DataStack | DB, private S3, Secrets Manager를 만든다. | CloudFormation event를 확인한다. |
| migration | Aurora에 테이블 변경을 적용한다. | ApplicationStack 배포를 멈추고 migration을 조사한다. |
| TTS preset bootstrap | 운영 변수가 지정한 활성 음성 preset을 Data API로 멱등 생성한다. | ApplicationStack 배포를 멈추고 변수와 기존 preset 충돌을 확인한다. |
| ApplicationStack | Cognito, Lambda, API, SQS, Step Functions, 알람을 만든다. | DataStack과 기존 DB는 유지된다. |
| EdgeStack | CloudFront, 인증서, DNS, private web S3를 만든다. | API와 DB는 유지되고 웹 주소만 미완성일 수 있다. |

## 왜 migration을 애플리케이션 시작과 분리하는가

Lambda가 켜질 때마다 migration을 자동 실행하면 여러 Lambda가 동시에
DB 구조를 바꾸거나, 잘못된 migration이 모든 요청을 막을 수 있다.

이 workflow는 DataStack이 존재하는 것을 확인한 뒤 한 번만 Data API
migration을 실행한다. migration 뒤 운영 TTS 음성 preset bootstrap까지
성공한 경우에만 새 API를 배포한다.

현재 migration은 기존 테이블을 파괴하지 않는지 사람이 검토해야 한다.
column 삭제, type 축소, 대규모 rewrite가 보이면 자동으로 진행하지 않는다.

## 최초 배포 전에 로컬에서 확인

계정 연결 없이도 다음 검사는 실행할 수 있다.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm infra:synth
node scripts/build-production-web.mjs example.com
```

`infra:synth`는 fixture account와 domain으로 template만 만든다. 실제
AWS에는 아무것도 생성하지 않는다. production web build runner는
`frontend/web/dist`에 실제 Vite application을 만들고, `index.html`, assets,
API subdomain과 500KB 이하 JavaScript chunk를 확인한다. 이 artifact 뒤에는
default web build를 다시 실행하지 않아 EdgeStack이 같은 dist를 배포한다.

실제 계정으로 변경 내용만 확인하려면 전용 로컬 환경 파일을 한 번 만든다.

```bash
cp .env.infrastructure.example .env.infrastructure.local
```

`.env.infrastructure.local`에서 예시 값을 실제 GitHub production Variables와
같게 채운다. `MEDIA_PUBLIC_KEY_PATH`에는 private key가 아니라 공개 키 파일
경로를 적는다.

AWS SSO 로그인 후 전용 명령을 실행한다.

```bash
aws sso login --profile flex-thia-admin
pnpm infra:diff:prod
```

이 명령은 환경 파일과 공개 키를 검증하고, 로그인한 AWS account가 설정값과
같은지 확인한 뒤 `cdk diff --all --no-change-set`을 실행한다. AWS API를
읽고 synth하지만 deploy하거나 임시 CloudFormation change set을 만들지
않는다.

## `cdk diff` 읽는 법

다음 표식을 먼저 찾는다.

| 표시 | 의미 | 판단 |
| --- | --- | --- |
| `+` | 새 자원을 만든다. | 이름, 리전, 공개 접근 여부를 확인한다. |
| `~` | 기존 자원의 설정을 바꾼다. | 중단 시간과 권한 확대를 확인한다. |
| `-` | 자원을 삭제한다. | 의도하지 않았다면 배포를 중단한다. |
| replacement | 기존 자원을 지우고 새로 만든다. | DB·bucket이면 원칙적으로 중단한다. |
| IAM statement change | role 권한이 바뀐다. | action과 resource 범위가 넓어지지 않았는지 확인한다. |

특히 다음 변경이 보이면 승인하지 않는다.

- `FlexThiaDataProd` Aurora replacement 또는 deletion
- S3 bucket deletion
- `DeletionProtection: false`
- public DB, public bucket, NAT Gateway 추가
- OIDC trust 범위를 다른 저장소나 모든 branch로 확대
- 예상하지 않은 월 예산 증가

GitHub workflow 안의 `cdk diff`는 기록을 남기기 위한 마지막 확인이다.
GitHub environment 승인은 job 시작 전에 이루어지므로, 위험한 변경은
가능하면 로컬 diff에서 먼저 발견한다.

## GitHub에서 최초 배포

1. [AWS 계정 준비 가이드](aws-account-setup.md)의 체크리스트를 완료한다.
2. GitHub의 `Actions`에서 `deploy-production`을 선택한다.
3. `Run workflow`에서 `main`을 선택해 수동 실행한다.
4. `production` environment 승인 화면에서 이번 commit을 확인하고 승인한다.
5. 각 단계 로그와 `AWS 변경 내용 확인`의 diff를 읽는다.

workflow의 `--require-approval never`는 무승인 배포라는 뜻이 아니다.
GitHub `production` required reviewer가 이미 수동 승인 경계이므로 CDK
터미널 질문만 끈 것이다.

## 최초 배포 직후 필수 작업

### 1. media private key 등록

DataStack 출력에서 `MediaPrivateKeySecretArn`을 복사한다. private key
파일 내용을 Secrets Manager에 넣는다.

```bash
export AWS_PROFILE=flex-thia-admin
export MEDIA_PRIVATE_KEY_SECRET_ARN='arn:aws:secretsmanager:...'

AWS_PROFILE="$AWS_PROFILE" aws secretsmanager put-secret-value \
  --region ap-northeast-2 \
  --secret-id "$MEDIA_PRIVATE_KEY_SECRET_ARN" \
  --secret-string file://media-private-key.pem
```

`media-private-key.pem`을 GitHub 변수나 secret에 복사하지 않는다. 이
Secret은 signed media URL을 구현한 API만 읽도록 한다.

### 2. 이메일 구독 확인

배포 중 CloudWatch alarm topic이 `ALERT_EMAIL`로 확인 이메일을 보낸다.
메일의 `Confirm subscription`을 눌러야 장애 알람을 실제로 받는다.

AWS Budget 알림 이메일도 수신되는지 확인한다. Budget은 비용을 알려줄
뿐 자원을 자동으로 끄지 않는다.

### 3. DNS와 인증서 확인

CloudFront 인증서 검증과 배포에는 시간이 걸릴 수 있다. 다음 주소를
확인한다.

```text
https://www.<ROOT_DOMAIN>
```

`https://<ROOT_DOMAIN>`으로 접속하면 path와 query를 유지한 채 위 `www`
주소로 이동해야 한다.

`www` 주소에는 infrastructure probe가 아니라 실제 Vite application이
열려야 한다. browser network에서 API 요청이
`https://api.<ROOT_DOMAIN>/api/v1`로 향하는지 함께 확인한다.

### 4. SES와 SNS 확인

- SES domain identity와 DKIM이 `Verified`인지 확인한다.
- SES sandbox 상태라면 production access를 신청한다.
- SNS sandbox에 자기 전화번호를 등록하고 검증 문자를 테스트한다.
- 실제 한국 SMS 운영 조건과 지출 한도를 확인한다.

### 5. API와 DB 확인

CloudFormation 출력의 API URL에서 `/health`를 호출한다.

```bash
curl https://api.<ROOT_DOMAIN>/health
```

`/ready`는 Aurora가 0 ACU에서 깨어나는 동안 잠시 `503 DB_RESUMING`을
반환할 수 있다. `Retry-After` 뒤 다시 확인한다.

## 배포 실패를 나누어 보는 법

### OIDC 전에 실패

증상:

- GitHub 변수가 비었다는 오류
- `Not authorized to perform sts:AssumeRoleWithWebIdentity`
- `allowed-account-ids` 불일치

확인 순서:

1. GitHub environment 이름이 정확히 `production`인지 확인한다.
2. `AWS_DEPLOY_ROLE_ARN`이 같은 AWS 계정의 role인지 확인한다.
3. trust policy의 `aud`가 `sts.amazonaws.com`인지 확인한다.
4. `sub`가 현재 저장소의 legacy 또는 immutable 형식과 정확히 같은지 확인한다.
5. wildcard로 우회하지 말고 정확한 subject를 수정한다.

### CDK diff 또는 deploy에서 실패

증상:

- bootstrap stack을 찾지 못함
- `AccessDenied`
- CloudFormation stack이 `ROLLBACK_*` 상태

확인 순서:

1. 서울과 버지니아 리전을 모두 bootstrap했는지 확인한다.
2. GitHub deploy role이 CDK bootstrap role을 assume할 수 있는지 확인한다.
3. CloudFormation 콘솔의 해당 stack `Events`에서 최초 실패 resource를 찾는다.
4. 뒤따라 발생한 취소 오류보다 가장 처음 나온 권한·quota·DNS 오류를 고친다.
5. stack이 rollback을 마치기 전 같은 배포를 다시 실행하지 않는다.

CloudFormation이 생성 도중 실패하면 보통 그 stack이 만든 새 자원만
rollback한다. `RETAIN`, snapshot, deletion protection이 걸린 DB와
bucket은 별도로 남을 수 있으므로 콘솔에서 확인하고 임의 삭제하지 않는다.

### migration에서 실패

ApplicationStack과 EdgeStack 배포 전에 workflow가 중단되는 것이 정상이다.

1. `RDS_RESOURCE_ARN`, `RDS_SECRET_ARN`, `DATABASE_NAME`, `AWS_REGION`이
   DataStack 출력에서 제대로 읽혔는지 확인한다.
2. deploy role에 Data API transaction 권한과 DB Secret 읽기 권한이
   있는지 확인한다.
3. migration SQL에서 destructive 변경이나 이미 존재하는 object 오류를 찾는다.
4. migration 파일을 수정하기 전에 운영 DB에 일부 변경이 적용되었는지 확인한다.
5. 원인을 해결한 뒤 같은 workflow를 다시 실행한다.

DB를 수동으로 초기화하거나 migration 기록을 삭제하지 않는다.

## 이전 버전으로 복구

### Lambda·API 코드 문제

1. 문제가 없던 commit을 확인한다.
2. 그 commit의 인프라 diff에서 DB와 S3 변경이 없는지 확인한다.
3. 동일한 수동 production workflow로 이전 Lambda artifact를 재배포한다.

코드 rollback과 DB rollback은 같은 일이 아니다. 새 코드가 이미 새로운
column에 데이터를 썼다면 이전 코드가 그 데이터를 읽을 수 있는지 먼저
확인한다.

### web artifact 또는 API origin 문제

1. 문제가 없던 commit을 확인하고 해당 commit의 production workflow를 다시 실행한다.
2. workflow가 다시 만든 검증 완료 Vite dist만 EdgeStack에 배포되는지 확인한다.
3. `https://www.<ROOT_DOMAIN>`과
   `https://api.<ROOT_DOMAIN>/health`를 확인해 web과 API origin이 함께
   정상인지 검증한다.

probe HTML을 임시 fallback으로 배포하거나 CloudFront bucket을 수동으로
수정하지 않는다. production artifact verifier가 실패하면 원인을 수정한
commit을 새로 배포한다.

### migration 문제

운영 migration은 무조건 아래 호환 순서를 따른다.

1. 새 구조를 추가한다.
2. 새·구 구조를 함께 읽을 수 있는 코드를 배포한다.
3. 데이터를 옮긴다.
4. 충분히 확인한 뒤 별도 배포에서 구 구조를 제거한다.

이미 실행한 destructive migration을 즉석에서 역으로 되돌리지 않는다.
필요하면 Aurora snapshot 복구를 새 cluster에 수행하고 데이터를 확인한
뒤 전환한다.

### CloudFormation 문제

- `UPDATE_ROLLBACK_COMPLETE`: 원인이 해결되면 다시 diff 후 배포 가능
- `UPDATE_ROLLBACK_FAILED`: 콘솔에서 실패 resource를 확인하고 rollback
  계속하기 전에 원인을 해결
- DataStack deletion 또는 replacement 요구: 배포 중단

`git reset --hard`, stack 강제 삭제, bucket 비우기 같은 명령은 복구
절차가 아니다. 장기 데이터 자원은 별도의 백업·검증 계획 없이 삭제하지
않는다.

## 배포 완료 체크리스트

- [ ] GitHub workflow의 모든 단계가 성공했다.
- [ ] 세 CloudFormation stack이 `CREATE_COMPLETE` 또는 `UPDATE_COMPLETE`다.
- [ ] `MediaPrivateKeySecretArn`에 private key를 등록했다.
- [ ] alarm SNS 구독 이메일을 확인했다.
- [ ] Budget 알림 수신 주소를 확인했다.
- [ ] SES identity와 DKIM 상태가 `Verified`다.
- [ ] SMS sandbox 또는 운영 승인을 확인했다.
- [ ] `https://www.<ROOT_DOMAIN>`이 HTTPS로 열린다.
- [ ] `https://<ROOT_DOMAIN>`이 같은 path·query의 `www` 주소로 이동한다.
- [ ] `https://api.<ROOT_DOMAIN>/health`와 재시도 후 `/ready`가 정상이다.
- [ ] browser API 요청이 `https://api.<ROOT_DOMAIN>/api/v1`로 향하고 Vite 화면이 정상이다.
- [ ] 예상하지 않은 상시 비용 자원이 없는지 Billing과 Cost Explorer를 확인했다.

## 현재 의도적으로 하지 않는 것

- push만으로 production 자동 배포
- AWS 장기 access key를 GitHub나 `.env`에 저장
- Lambda 시작 시 자동 migration
- 브라우저/API E2E test 추가
- 유료 AI·TTS provider API key 연결 — 미구성 production 호출은 fail-closed를 유지

이 항목들은 계정 연결 준비와 기초 인프라 구현의 범위를 넘으므로 각각
기능과 운영 조건이 확정될 때 별도로 진행한다.
