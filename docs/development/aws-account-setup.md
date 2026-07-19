# AWS 계정 연결 준비 가이드

이 문서는 AWS가 처음인 개발자가 FLEX THIA 운영 인프라를 실제 계정에
연결하기 직전까지 준비할 내용을 설명한다. 여기 적힌 값을 등록하기
전까지 저장소 코드는 AWS 계정이나 유료 API를 호출하지 않는다.

## 지금 코드가 준비한 것과 사람이 준비할 것

CDK 코드는 어떤 AWS 자원을 어떤 설정으로 만들지 이미 정의한다. 하지만
CDK가 남의 계정에 마음대로 들어갈 수는 없으므로 아래 네 가지는 사람이
소유권을 확인해야 한다.

| 사람이 준비하는 것 | 왜 코드가 대신할 수 없는가 |
| --- | --- |
| AWS 계정과 로그인 수단 | 결제와 계정 소유권이 걸려 있다. |
| 사용할 도메인 | 도메인의 실제 소유자만 DNS를 위임할 수 있다. |
| GitHub의 배포 승인과 OIDC role | 어떤 저장소에 AWS 권한을 줄지 계정 소유자가 결정해야 한다. |
| SMS·이메일 운영 승인 | AWS가 스팸과 오용 방지를 위해 사용 목적을 심사한다. |

AWS의 access key를 `.env`에 넣는 방식은 사용하지 않는다. 사람은
IAM Identity Center 등의 임시 자격 증명으로 작업하고, GitHub Actions는
OIDC로 배포할 때만 짧게 유효한 자격 증명을 받는다.

## 준비할 값

실제 값을 아직 만들지 않았다면 다음 표만 채워두면 된다. 비밀 값은
문서나 Git에 복사하지 않는다.

| 이름 | 예시 | 보관 위치 | 비밀인가 |
| --- | --- | --- | --- |
| `AWS_ACCOUNT_ID` | `123456789012` | GitHub production 변수 | 아니오 |
| `ROOT_DOMAIN` | `example.com` | GitHub production 변수 | 아니오 |
| `HOSTED_ZONE_ID` | `Z0123...` | GitHub production 변수 | 아니오 |
| `ALERT_EMAIL` | `owner@example.com` | GitHub production 변수 | 아니오 |
| `ALLOWED_EMAIL_DOMAINS` | `school.ac.kr` | GitHub production 변수 | 아니오 |
| `MONTHLY_BUDGET_USD` | `30` | GitHub production 변수 | 아니오 |
| `MEDIA_PUBLIC_KEY_PEM` | PEM 공개 키 전체 | GitHub production 변수 | 아니오 |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::...:role/...` | GitHub production secret | role ARN 자체는 비밀이 아니지만 workflow와 같은 경계에서 관리 |
| media private key | PEM 비밀 키 전체 | AWS Secrets Manager | 예 |

`OPENAI_API_KEY`나 TTS provider 키는 아직 provider를 선택하지 않았으므로
이름과 저장 위치만 억지로 확정하지 않는다. 나중에 provider가 정해지면
로컬에서는 `.env`, 운영에서는 AWS Secrets Manager에 넣는다.

## 1. AWS 계정과 사람 로그인 보호

### root user가 무엇인가

AWS 가입 이메일로 로그인하는 사용자는 계정의 모든 권한을 가진
`root user`다. 결제 수단 변경이나 계정 복구처럼 root만 가능한 일에만
사용한다.

계정을 만든 직후 다음을 완료한다.

1. root user에 passkey 또는 하드웨어 MFA를 등록한다.
2. 복구 이메일과 전화번호를 확인한다.
3. root access key가 있다면 삭제한다.
4. 일상 작업용 로그인은 IAM Identity Center에서 별도로 만든다.

MFA는 비밀번호가 유출되어도 두 번째 장치가 없으면 로그인하지 못하게
한다. root access key는 만료되지 않는 계정 전체 열쇠가 될 수 있으므로
만들지 않는다.

### 일상 작업용 권한

혼자 쓰는 계정이어도 `IAM Identity Center`에서 자기 사용자를 만들고,
최초 인프라 준비 동안만 관리자 권한이 있는 permission set을 사용한다.
준비가 끝나면 일상용 권한과 배포 권한을 분리한다.

이 구분은 다음과 같다.

- root user: 계정 자체를 복구하거나 닫을 때만 사용
- 사람용 임시 자격 증명: bootstrap과 IAM 최초 설정에 사용
- GitHub OIDC role: 승인된 production workflow 배포에만 사용
- Lambda 실행 role: 배포된 각 프로그램이 필요한 AWS 서비스만 호출

## 2. AWS CLI 연결 확인

AWS CLI는 터미널에서 AWS 계정에 명령을 보내는 프로그램이다. 설치 후
IAM Identity Center 로그인을 구성한다.

```bash
aws configure sso
aws sso login --profile flex-thia-admin
AWS_PROFILE=flex-thia-admin aws sts get-caller-identity
```

마지막 명령의 `Account`가 준비한 12자리 `AWS_ACCOUNT_ID`와 같아야 한다.
다르면 즉시 멈춘다. 다른 계정에 배포하는 실수를 막는 가장 간단한
확인이다.

`aws sts get-caller-identity`는 자원을 만들지 않는다. 현재 터미널이
누구로 어느 계정에 연결되었는지만 읽는다.

## 3. 도메인과 Route 53 준비

`ROOT_DOMAIN`은 `example.com`처럼 사용자가 소유한 루트 도메인이다.
현재 인프라는 이 도메인 아래에 다음 주소를 만든다.

- `www.<ROOT_DOMAIN>`: CloudFront가 제공하는 정식 웹 주소
- `<ROOT_DOMAIN>`: 정식 `www` 주소로 이동시키는 보조 주소
- `api.<ROOT_DOMAIN>`: API Gateway가 제공하는 API 주소
- `no-reply@<ROOT_DOMAIN>`: passwordless 로그인 이메일 발신 주소

AWS Route 53의 public hosted zone은 이 도메인의 DNS 주소록이다. 이미
hosted zone이 있다면 새로 만들지 않고 해당 `HOSTED_ZONE_ID`를 사용한다.

도메인을 Route 53이 아닌 업체에서 구매했다면 그 업체의 관리 화면에서
도메인의 name server를 Route 53 hosted zone에 표시된 네 개의 NS 값으로
바꿔야 한다. 이 위임이 없으면 CDK가 DNS 레코드를 만들어도 인터넷에서
찾지 못한다.

확인할 내용은 세 가지다.

1. hosted zone 이름이 `ROOT_DOMAIN`과 정확히 같은가
2. 도메인 등록 업체의 NS가 hosted zone의 NS와 같은가
3. 같은 도메인의 public hosted zone이 중복으로 존재하지 않는가

## 4. 이메일과 SMS 운영 조건 확인

### SES 이메일

ApplicationStack을 처음 배포하면 CDK가 `ROOT_DOMAIN`의 SES domain
identity와 DKIM DNS 레코드를 만든다. 따라서 SES identity를 콘솔에서
중복 생성하지 않는다.

새 AWS 계정의 SES는 리전별 sandbox 상태다. sandbox에서는 검증한
수신자에게만 이메일을 보낼 수 있으므로 실제 학교 이메일 로그인을
사용하려면 서울 리전 `ap-northeast-2`에서 production access를
신청해야 한다.

최초 배포 후 다음을 확인한다.

1. SES 콘솔의 리전을 서울로 선택한다.
2. domain identity 상태와 DKIM 상태가 `Verified`인지 확인한다.
3. 사용 목적, 예상 발송량, 반송·수신 거부 처리 방식을 적어 production
   access를 신청한다.
4. 승인 전 테스트는 검증한 수신 주소로만 한다.

### SNS SMS

관리자 전화번호 검증과 step-up OTP는 SMS를 사용한다. 인프라는 Cognito가
전화번호 검증 문자를 보낼 전용 IAM role과 API Lambda의 SNS 발송 권한을
만든다.

새 계정은 SMS sandbox이므로 검증한 전화번호로만 보낼 수 있다. 한국
번호는 `+8210...` 형태의 E.164 형식을 사용한다. 실제 운영 전에 서울
리전에서 다음을 확인한다.

1. sandbox 테스트용 전화번호를 등록하고 검증한다.
2. 월 SMS 지출 한도를 낮게 설정한다.
3. 한국 발송에 필요한 발신자·회사 등록 조건을 AWS Support와 확인한다.
4. 운영 전환 승인을 받은 뒤 자기 번호로 수신 테스트를 한다.

SMS 가능 여부는 국가와 통신사 규정에 따라 바뀔 수 있다. 코드 배포가
성공했다는 사실과 실제 문자가 도착한다는 사실은 별도로 확인해야 한다.

## 5. CloudFront media 키 쌍 준비

private 음성 파일은 URL만 안다고 다운로드할 수 없게 CloudFront signed
URL을 사용한다. 공개 키는 CloudFront에 넣고, 비밀 키는 URL을 서명하는
API만 읽는다.

로컬 터미널에서 RSA 2048비트 키 쌍을 한 번 만든다.

```bash
openssl genpkey \
  -algorithm RSA \
  -pkeyopt rsa_keygen_bits:2048 \
  -out media-private-key.pem

openssl rsa \
  -pubout \
  -in media-private-key.pem \
  -out media-public-key.pem
```

두 파일은 `.gitignore`의 `*.pem` 규칙으로 Git에서 제외된다. 그래도
메신저나 문서에 private key를 붙여 넣지 않는다.

- `media-public-key.pem` 전체: GitHub 변수 `MEDIA_PUBLIC_KEY_PEM`
- `media-private-key.pem` 전체: 첫 DataStack 배포 후 Secrets Manager에
  한 번 등록

DataStack 출력의 `MediaPrivateKeySecretArn`이 private key를 넣을 정확한
Secret 위치다. 실제 입력 명령은
[AWS 배포와 복구 가이드](aws-deployment.md)에 있다.

## 6. 두 리전을 CDK bootstrap

CDK bootstrap은 CDK가 Lambda 묶음과 CloudFormation template을 업로드할
전용 S3 bucket과 배포 role을 계정에 한 번 만드는 작업이다. 애플리케이션
배포가 아니라 배포 도구의 작업장을 준비하는 것이다.

FLEX THIA는 두 리전을 사용하므로 각각 bootstrap해야 한다.

- `ap-northeast-2`: Aurora, Lambda, API Gateway, Cognito, SQS
- `us-east-1`: CloudFront용 ACM 인증서와 edge stack

사람용 임시 관리자 profile로 다음을 실행한다.

```bash
export AWS_ACCOUNT_ID=123456789012
export AWS_PROFILE=flex-thia-admin

./infra/node_modules/.bin/cdk bootstrap \
  "aws://$AWS_ACCOUNT_ID/ap-northeast-2" \
  --profile "$AWS_PROFILE" \
  --termination-protection

./infra/node_modules/.bin/cdk bootstrap \
  "aws://$AWS_ACCOUNT_ID/us-east-1" \
  --profile "$AWS_PROFILE" \
  --termination-protection
```

`pnpm --filter`는 `infra/cdk.json`을 읽어 production context 검증을 먼저
실행하므로 context가 없는 bootstrap에는 사용하지 않는다.

`--termination-protection`은 실수로 bootstrap stack을 삭제하지 못하게
한다. 같은 계정과 리전에는 보통 한 번만 실행한다.

## 7. GitHub OIDC deploy role 만들기

### OIDC가 해결하는 문제

예전 방식은 AWS access key를 GitHub secret에 오래 보관했다. OIDC는
GitHub가 “이 실행은 이 저장소의 production 환경에서 왔다”는 서명된
토큰을 AWS에 보내고, AWS가 조건을 확인한 뒤 한 번의 실행 동안만 임시
자격 증명을 발급한다.

먼저 AWS IAM에 다음 OIDC provider를 한 번 등록한다.

- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`

그다음 `flex-thia-github-deploy` 같은 이름으로 Web identity role을 만들고
trust policy를 아래 형태로 제한한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "<GITHUB_OIDC_SUBJECT>"
        }
      }
    }
  ]
}
```

`<GITHUB_OIDC_SUBJECT>`에는 현재 저장소가 실제로 발급하는 값을 정확히
넣는다.

- 기존 형식:
  `repo:Dessert99/flex-thai:environment:production`
- 2026년 7월 15일 이후 생성되었거나 immutable subject를 사용한 형식:
  `repo:Dessert99@<OWNER_ID>/flex-thai@<REPOSITORY_ID>:environment:production`

GitHub의 OIDC 설정과 저장소 생성·이전 시점을 확인하고 둘 중 실제 형식
하나만 허용한다. `repo:Dessert99/*` 같은 wildcard로 넓히지 않는다.
저장소를 rename하거나 transfer하면 trust policy도 다시 확인한다.

### deploy role의 권한

trust policy는 “누가 role을 빌릴 수 있는가”를 정하고, permission
policy는 “빌린 뒤 무엇을 할 수 있는가”를 정한다. 둘 다 필요하다.

이 저장소의 deploy role에는 다음 경계가 필요하다.

1. 같은 계정의 `cdk-*` bootstrap role을 assume할 권한
2. migration 동안 서울 Aurora Data API를 호출할 권한
3. migration용 Aurora credential secret을 읽을 권한

CDK stack은 IAM, Cognito, RDS, CloudFront 등 여러 서비스를 생성하므로
최초 권한 정책을 계정 정보 없이 저장소에 자동 생성하지 않는다. 실제
계정에서 `cdk diff`와 CloudTrail을 확인해 permission policy를 만들고,
최초 배포 후 Aurora cluster ARN과 Secret ARN으로 migration 권한을 더
좁힌다.

편의를 위해 GitHub deploy role 자체에 `AdministratorAccess`를 계속
붙여두는 것은 권장하지 않는다. CDK bootstrap의 CloudFormation 실행
role이 자원 생성 권한을 갖고, GitHub role은 그 role을 assume하는
방식으로 경계를 나눈다.

## 8. GitHub production environment 만들기

GitHub 저장소의 `Settings → Environments`에서 이름이 정확히
`production`인 environment를 만든다.

다음 보호 규칙을 켠다.

- Required reviewers: 자기 GitHub 계정
- Prevent self-review가 혼자 쓰는 저장소에서 배포를 막는다면 끈다.
- Deployment branches: `main`만 허용

Environment variables에 다음을 등록한다.

```text
AWS_ACCOUNT_ID
ROOT_DOMAIN
HOSTED_ZONE_ID
ALERT_EMAIL
ALLOWED_EMAIL_DOMAINS
MONTHLY_BUDGET_USD
MEDIA_PUBLIC_KEY_PEM
```

Environment secret에는 다음 하나를 등록한다.

```text
AWS_DEPLOY_ROLE_ARN
```

workflow는 값이 비어 있거나 account ID 형식이 잘못되면 AWS 자격 증명을
받기 전에 중단된다. `allowed-account-ids`도 사용하므로 OIDC role이
예상과 다른 계정으로 연결되면 배포하지 않는다.

## 실제 연결 직전 체크리스트

- [ ] root MFA를 설정했고 root access key가 없다.
- [ ] 사람용 임시 로그인으로 `aws sts get-caller-identity`를 확인했다.
- [ ] `ROOT_DOMAIN`과 Route 53 `HOSTED_ZONE_ID`가 같은 도메인이다.
- [ ] 도메인 등록 업체의 NS가 Route 53으로 위임되었다.
- [ ] 서울·버지니아 리전을 각각 CDK bootstrap했다.
- [ ] CloudFront public/private key 쌍을 만들고 private key를 안전하게 보관했다.
- [ ] GitHub OIDC provider와 정확한 subject의 deploy role을 만들었다.
- [ ] GitHub `production` environment에 reviewer와 main branch 제한을 걸었다.
- [ ] production 변수 일곱 개와 secret 하나를 등록했다.
- [ ] SES와 SNS의 sandbox·운영 승인 절차를 이해했다.

여기까지가 “계정과 키 연결 직전” 준비다. 다음 단계에서만 GitHub
`deploy-production` workflow를 수동 실행한다.

## 공식 문서

- [AWS root user 보안 권장 사항](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html)
- [AWS CDK bootstrap](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-env.html)
- [GitHub Actions에서 AWS OIDC 구성](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)
- [GitHub OIDC subject 형식](https://docs.github.com/en/actions/reference/security/oidc)
- [SES production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)
- [SNS SMS sandbox](https://docs.aws.amazon.com/sns/latest/dg/sns-sms-sandbox.html)
- [Route 53 DNS 위임](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-configuring-new-domain.html)
