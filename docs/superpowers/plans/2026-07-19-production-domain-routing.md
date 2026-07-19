# Production Domain Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영 주소를 `www.pleasegraduate.me`로 통일하고, 루트 도메인은 `www`로 리다이렉트하며, HTTP API는 `api.pleasegraduate.me`로 제공한다.

**Architecture:** 기존 CloudFront 배포 하나가 루트와 `www`를 모두 받고, viewer-request CloudFront Function이 루트 요청만 `www`로 영구 리다이렉트한다. 서울 리전의 기존 HTTP API에는 Regional 사용자 지정 도메인과 빈 경로 API mapping을 붙이고 Route 53 alias로 연결한다.

**Tech Stack:** TypeScript 7, AWS CDK 2.260.0, CloudFront Functions JavaScript 2.0, Route 53, ACM, API Gateway HTTP API, Vitest 4

## Global Constraints

- 현재 `main` 브랜치를 유지하고 새 브랜치·worktree·PR을 만들지 않는다.
- 실제 AWS 자원을 만드는 `cdk deploy`와 GitHub production workflow 실행은 이 계획의 범위에 포함하지 않는다.
- `https://www.pleasegraduate.me`를 유일한 정식 웹 origin으로 사용한다.
- `https://pleasegraduate.me`는 path와 query string을 유지하며 `www`로 HTTP 308 리다이렉트한다.
- `https://api.pleasegraduate.me`는 기존 HTTP API 기본 stage에 연결한다.
- 기존 S3·CloudFront·API route·JWT·미디어 key group 동작은 변경하지 않는다.
- 새 패키지를 추가하지 않는다.
- 새 코드와 변경되는 export는 `conventions/comment-convention.md`를 따른다.
- 변경하는 Vitest 파일의 `describe`, `it`, `test` 설명은 한국어로 쓴다.
- E2E 테스트를 추가하지 않는다.

---

## File Map

- `infra/src/edge-stack.ts`: 루트·`www` 인증서, CloudFront aliases, 리다이렉트 Function, 웹 DNS를 소유한다.
- `infra/test/edge-stack.spec.ts`: 합성 template과 리다이렉트 함수의 path·query 보존을 검증한다.
- `infra/src/application-stack.ts`: 정식 웹 origin과 API 도메인을 계산해 하위 construct에 전달한다.
- `infra/src/constructs/http-api.ts`: API 인증서, Regional custom domain, API mapping, Route 53 alias를 소유한다.
- `infra/test/http-api.spec.ts`: API custom domain·DNS·CORS·output을 검증한다.
- `infra/test/identity.spec.ts`: passwordless 링크가 정식 `www` 주소를 사용하는지 검증한다.
- `docs/development/aws-account-setup.md`: 운영 주소와 실제로 성공한 bootstrap 명령을 설명한다.
- `docs/development/aws-deployment.md`: 배포 후 확인 주소와 health 명령을 새 주소로 바꾼다.
- `docs/superpowers/specs/2026-07-17-aws-serverless-infrastructure-design.md`: 기존 전체 설계의 도메인 표기를 승인된 구조로 맞춘다.

---

### Task 1: CloudFront 웹 도메인과 루트 리다이렉트

**Files:**

- Modify: `infra/test/edge-stack.spec.ts`
- Modify: `infra/src/edge-stack.ts`

**Interfaces:**

- Consumes: `InfrastructureConfig.rootDomain: string`
- Produces: CloudFront aliases `rootDomain`·`www.${rootDomain}`, Route 53 A·AAAA records 4개, CloudFront Function viewer-request association
- Preserves: `EdgeStackProps`, 기존 S3 web/media origins, `/media/*` trusted key group

- [ ] **Step 1: 도메인과 리다이렉트 동작의 실패 테스트 작성**

`infra/test/edge-stack.spec.ts`의 Vitest import에 `expect`를 추가하고
`describe`를 한국어로 바꾼다.

```ts
import { describe, expect, it } from 'vitest';

describe('EdgeStack 웹 전송 경계', () => {
```

기존 `app DNS와 private media key group을 만든다` 테스트를 다음 두
테스트로 교체한다.

```ts
it('루트와 www DNS를 같은 CloudFront 배포에 연결한다', () => {
  const app = new App();
  const dataStack = new DataStack(app, 'EdgeDnsData');
  const applicationStack = new ApplicationStack(app, 'EdgeDnsApplication', {
    config,
    dataStack,
  });
  const stack = new EdgeStack(app, 'EdgeDns', {
    config,
    dataStack,
    applicationStack,
  });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::CertificateManager::Certificate', {
    DomainName: 'www.example.com',
    SubjectAlternativeNames: ['example.com'],
  });
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      Aliases: Match.arrayWith(['example.com', 'www.example.com']),
      CacheBehaviors: Match.arrayWith([
        Match.objectLike({
          PathPattern: '/media/*',
          TrustedKeyGroups: Match.anyValue(),
          FunctionAssociations: Match.anyValue(),
        }),
      ]),
      DefaultCacheBehavior: Match.objectLike({
        FunctionAssociations: Match.anyValue(),
      }),
    }),
  });
  template.resourceCountIs('AWS::CloudFront::PublicKey', 1);
  template.resourceCountIs('AWS::CloudFront::KeyGroup', 1);
  template.resourceCountIs('AWS::Route53::RecordSet', 4);
  for (const [name, type] of [
    ['example.com.', 'A'],
    ['example.com.', 'AAAA'],
    ['www.example.com.', 'A'],
    ['www.example.com.', 'AAAA'],
  ]) {
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: name,
      Type: type,
    });
  }
  expect(JSON.stringify(template.toJSON())).not.toContain('app.example.com');
});

it('루트 요청의 path와 query를 보존해 www로 리다이렉트한다', () => {
  const app = new App();
  const dataStack = new DataStack(app, 'EdgeRedirectData');
  const applicationStack = new ApplicationStack(
    app,
    'EdgeRedirectApplication',
    { config, dataStack },
  );
  const stack = new EdgeStack(app, 'EdgeRedirect', {
    config,
    dataStack,
    applicationStack,
  });
  const template = Template.fromStack(stack);
  const functions = template.findResources('AWS::CloudFront::Function');
  const [redirectFunction] = Object.values(functions);
  const code = redirectFunction.Properties.FunctionCode as string;
  const handler = new Function(`${code}; return handler;`)() as (
    event: unknown,
  ) => unknown;
  const request = {
    headers: { host: { value: 'example.com' } },
    uri: '/lessons',
    querystring: {
      level: { value: '1' },
      tag: { multiValue: [{ value: 'reading' }, { value: 'listening' }] },
    },
  };

  expect(handler({ request })).toEqual({
    statusCode: 308,
    statusDescription: 'Permanent Redirect',
    headers: {
      location: {
        value:
          'https://www.example.com/lessons?level=1&tag=reading&tag=listening',
      },
    },
  });
  expect(
    handler({
      request: {
        ...request,
        headers: { host: { value: 'www.example.com' } },
      },
    }),
  ).toEqual({
    ...request,
    headers: { host: { value: 'www.example.com' } },
  });
});
```

- [ ] **Step 2: 새 테스트가 현재 `app` 구현에서 실패하는지 확인**

Run:

```bash
pnpm --filter @flex-thia/infra test -- edge-stack.spec.ts
```

Expected: `AWS::Route53::RecordSet` 수량, 인증서 도메인 또는
`AWS::CloudFront::Function` 검증이 실패한다.

- [ ] **Step 3: CloudFront 인증서·Function·aliases를 최소 구현**

`infra/src/edge-stack.ts`의 클래스 설명과 도메인 계산을 다음과 같이
바꾼다.

```ts
/** CloudFront와 정식 Web domain을 배치할 글로벌 경계 Stack */
export class EdgeStack extends Stack {
  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);

    // Media bucket policy는 순환 참조를 피하려고 DataStack에서 계정 단위로 추가한다.
    Annotations.of(this).acknowledgeWarning(
      '@aws-cdk/aws-cloudfront-origins:updateImportedBucketPolicyOac',
      'DataStack이 같은 계정의 CloudFront OAC 읽기 정책을 소유한다.',
    );

    const rootDomain = props.config.rootDomain;
    const webDomain = `www.${rootDomain}`;
```

인증서는 `www`를 주 도메인, 루트를 SAN으로 만든다.

```ts
const certificate = new acm.Certificate(this, 'Certificate', {
  domainName: webDomain,
  subjectAlternativeNames: [rootDomain],
  validation: acm.CertificateValidation.fromDns(hostedZone),
});
```

`distribution` 생성 전 리다이렉트 Function과 association을 만든다.

```ts
const redirectFunction = new cloudfront.Function(this, 'RootRedirect', {
  runtime: cloudfront.FunctionRuntime.JS_2_0,
  comment: 'Redirect the root FLEX THIA domain to the canonical www domain',
  code: cloudfront.FunctionCode.fromInline(`
function serializeQueryString(querystring) {
  var pairs = [];
  Object.keys(querystring).forEach(function (key) {
    var entry = querystring[key];
    var values = entry.multiValue || [entry];
    values.forEach(function (item) {
      var pair = encodeURIComponent(key);
      if (item.value !== '') {
        pair += '=' + encodeURIComponent(item.value);
      }
      pairs.push(pair);
    });
  });
  return pairs.length === 0 ? '' : '?' + pairs.join('&');
}

function handler(event) {
  var request = event.request;
  if (request.headers.host.value !== '${rootDomain}') {
    return request;
  }
  return {
    statusCode: 308,
    statusDescription: 'Permanent Redirect',
    headers: {
      location: {
        value: 'https://${webDomain}' + request.uri + serializeQueryString(request.querystring)
      }
    }
  };
}
`),
});
const redirectFunctionAssociations: cloudfront.FunctionAssociation[] = [
  {
    function: redirectFunction,
    eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
  },
];
```

기존 `Distribution`의 aliases와 각 behavior에 같은 association을 붙인다.
CloudFront Function은 behavior 단위로 실행되므로 `assets/*`와
`/media/*`에도 명시한다.

```ts
const distribution = new cloudfront.Distribution(this, 'Distribution', {
  domainNames: [rootDomain, webDomain],
  certificate,
  defaultRootObject: 'index.html',
  defaultBehavior: {
    origin: webOrigin,
    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
    cachePolicy: htmlCachePolicy,
    compress: true,
    functionAssociations: redirectFunctionAssociations,
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
  },
  additionalBehaviors: {
    'assets/*': {
      origin: webOrigin,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      compress: true,
      functionAssociations: redirectFunctionAssociations,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    },
    '/media/*': {
      origin: mediaOrigin,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      compress: true,
      functionAssociations: redirectFunctionAssociations,
      trustedKeyGroups: [mediaKeyGroup],
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    },
  },
  errorResponses: [
    {
      httpStatus: 403,
      responseHttpStatus: 200,
      responsePagePath: '/index.html',
      ttl: Duration.minutes(1),
    },
    {
      httpStatus: 404,
      responseHttpStatus: 200,
      responsePagePath: '/index.html',
      ttl: Duration.minutes(1),
    },
  ],
  priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
});
```

- [ ] **Step 4: 루트·`www` Route 53 aliases와 output 구현**

기존 `AliasA`, `AliasAaaa` 레코드와 `WebUrl` output을 다음으로 교체한다.

```ts
const cloudFrontTarget = route53.RecordTarget.fromAlias(
  new route53Targets.CloudFrontTarget(distribution),
);
new route53.ARecord(this, 'RootAliasA', {
  zone: hostedZone,
  target: cloudFrontTarget,
});
new route53.AaaaRecord(this, 'RootAliasAaaa', {
  zone: hostedZone,
  target: cloudFrontTarget,
});
new route53.ARecord(this, 'WwwAliasA', {
  zone: hostedZone,
  recordName: 'www',
  target: cloudFrontTarget,
});
new route53.AaaaRecord(this, 'WwwAliasAaaa', {
  zone: hostedZone,
  recordName: 'www',
  target: cloudFrontTarget,
});
new CfnOutput(this, 'WebUrl', {
  value: `https://${webDomain}`,
});
```

- [ ] **Step 5: EdgeStack 테스트와 typecheck 통과 확인**

Run:

```bash
pnpm --filter @flex-thia/infra test -- edge-stack.spec.ts
pnpm --filter @flex-thia/infra typecheck
```

Expected: 두 명령 모두 exit code `0`.

- [ ] **Step 6: 웹 도메인 변경 커밋**

```bash
git add infra/src/edge-stack.ts infra/test/edge-stack.spec.ts
git commit -m "feat: route production web domains"
```

---

### Task 2: API 사용자 지정 도메인과 정식 웹 origin

**Files:**

- Modify: `infra/test/http-api.spec.ts`
- Modify: `infra/test/identity.spec.ts`
- Modify: `infra/src/application-stack.ts`
- Modify: `infra/src/constructs/http-api.ts`

**Interfaces:**

- Consumes: `HttpApiProps.domainName: string`, `HttpApiProps.hostedZone: route53.IHostedZone`
- Produces: `api.${rootDomain}` certificate, API Gateway V2 DomainName, root ApiMapping, Route 53 A alias, custom `ApiUrl` output
- Preserves: 기존 API route·authorizer·Lambda·throttling·access logs

- [ ] **Step 1: API custom domain·CORS 실패 테스트 작성**

`infra/test/http-api.spec.ts`의 `vitest` import와 `describe`를 바꾼다.

```ts
import { describe, expect, it } from 'vitest';

describe('HttpApi 운영 API 경계', () => {
```

다음 테스트를 `describe` 마지막에 추가한다.

```ts
it('api custom domain과 www CORS origin을 사용한다', () => {
  const app = new App();
  const dataStack = new DataStack(app, 'HttpDomainData');
  const stack = new ApplicationStack(app, 'HttpDomainApplication', {
    config,
    dataStack,
  });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::CertificateManager::Certificate', {
    DomainName: 'api.example.com',
  });
  template.hasResourceProperties('AWS::ApiGatewayV2::DomainName', {
    DomainName: 'api.example.com',
    DomainNameConfigurations: Match.arrayWith([
      Match.objectLike({
        EndpointType: 'REGIONAL',
        SecurityPolicy: 'TLS_1_2',
      }),
    ]),
  });
  template.resourceCountIs('AWS::ApiGatewayV2::ApiMapping', 1);
  template.hasResourceProperties('AWS::Route53::RecordSet', {
    Name: 'api.example.com.',
    Type: 'A',
  });
  template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
    CorsConfiguration: Match.objectLike({
      AllowOrigins: [
        'https://www.example.com',
        'http://localhost:5173',
      ],
    }),
  });
  template.hasResourceProperties('AWS::Lambda::Function', {
    Environment: {
      Variables: Match.objectLike({
        ALLOWED_ORIGINS:
          'https://www.example.com,http://localhost:5173',
      }),
    },
  });
  expect(Object.values(template.toJSON().Outputs ?? {})).toContainEqual({
    Value: 'https://api.example.com',
  });
  expect(JSON.stringify(template.toJSON())).not.toContain('app.example.com');
});
```

- [ ] **Step 2: passwordless 링크의 정식 주소 실패 테스트 작성**

`infra/test/identity.spec.ts`의 `describe`를 한국어로 바꾼다.

```ts
describe('Identity 학교 이메일 인증 경계', () => {
```

다음 테스트를 `describe` 마지막에 추가한다.

```ts
it('passwordless 로그인 링크가 www 운영 주소를 사용한다', () => {
  const app = new App();
  const dataStack = new DataStack(app, 'IdentityUrlData');
  const stack = new ApplicationStack(app, 'IdentityUrlApplication', {
    config,
    dataStack,
  });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::Lambda::Function', {
    Environment: {
      Variables: Match.objectLike({
        APP_URL: 'https://www.example.com',
      }),
    },
  });
});
```

- [ ] **Step 3: 새 테스트가 기본 API 주소와 `app` origin에서 실패하는지 확인**

Run:

```bash
pnpm --filter @flex-thia/infra test -- http-api.spec.ts identity.spec.ts
```

Expected: API custom domain resource, `www` CORS 또는 `APP_URL` 검증이
실패한다.

- [ ] **Step 4: `HttpApiProps`에 도메인 경계를 추가**

`infra/src/constructs/http-api.ts` import에 ACM, Route 53과 target을 추가한다.

```ts
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
```

`HttpApiProps`에 다음 두 필드를 추가한다.

```ts
/** API bundle과 AWS 자원별 최소 권한을 연결하는 설정 */
export interface HttpApiProps {
  apiAssetPath: string;
  allowedOrigins: string[];
  allowedEmailDomains: string;
  domainName: string;
  hostedZone: route53.IHostedZone;
  cluster: rds.DatabaseCluster;
```

- [ ] **Step 5: API 인증서·custom domain·mapping·DNS 구현**

`this.api = new apigwv2.HttpApi(...)` 이후에 인증서와 domain을 만든다.

```ts
const certificate = new acm.Certificate(this, 'Certificate', {
  domainName: props.domainName,
  validation: acm.CertificateValidation.fromDns(props.hostedZone),
});
const domainName = new apigwv2.DomainName(this, 'DomainName', {
  domainName: props.domainName,
  certificate,
  endpointType: apigwv2.EndpointType.REGIONAL,
  securityPolicy: apigwv2.SecurityPolicy.TLS_1_2,
});
new apigwv2.ApiMapping(this, 'ApiMapping', {
  api: this.api,
  domainName,
});
new route53.ARecord(this, 'DomainAliasA', {
  zone: props.hostedZone,
  recordName: props.domainName,
  target: route53.RecordTarget.fromAlias(
    new route53Targets.ApiGatewayv2DomainProperties(
      domainName.regionalDomainName,
      domainName.regionalHostedZoneId,
    ),
  ),
});
```

기존 output을 custom domain 주소로 바꾼다.

```ts
new CfnOutput(this, 'ApiUrl', {
  value: `https://${props.domainName}`,
});
```

- [ ] **Step 6: `ApplicationStack`에서 `www`와 `api` 주소를 한 번만 계산**

`infra/src/application-stack.ts`에서 hosted zone 생성 직후 다음 값을 만든다.

```ts
const webDomain = `www.${props.config.rootDomain}`;
const apiDomain = `api.${props.config.rootDomain}`;
```

`Identity`의 `appUrl`과 `HttpApi` 설정을 다음과 같이 바꾼다.

```ts
this.identity = new Identity(this, 'Identity', {
  defineChallengeEntry: `${workerSource}define-auth-challenge.ts`,
  createChallengeEntry: `${workerSource}create-auth-challenge.ts`,
  verifyChallengeEntry: `${workerSource}verify-auth-challenge.ts`,
  cluster: props.dataStack.cluster,
  clusterSecret: props.dataStack.clusterSecret,
  challengeHmacPepper: props.dataStack.challengeHmacPepper,
  challengeSessionKey: props.dataStack.challengeSessionKey,
  emailIdentity,
  fromEmail: `no-reply@${props.config.rootDomain}`,
  appUrl: `https://${webDomain}`,
});
```

```ts
this.httpApi = new HttpApi(this, 'HttpApi', {
  apiAssetPath,
  allowedOrigins: [
    `https://${webDomain}`,
    'http://localhost:5173',
  ],
  allowedEmailDomains: props.config.allowedEmailDomains,
  domainName: apiDomain,
  hostedZone,
  cluster: props.dataStack.cluster,
  clusterSecret: props.dataStack.clusterSecret,
  challengeHmacPepper: props.dataStack.challengeHmacPepper,
  challengeSessionKey: props.dataStack.challengeSessionKey,
  inputBucket: props.dataStack.inputBucket,
  jobQueue: this.asyncJobs.queue,
  userPool: this.identity.userPool,
  userPoolClient: this.identity.userPoolClient,
});
```

- [ ] **Step 7: API와 Identity 테스트·typecheck 통과 확인**

Run:

```bash
pnpm --filter @flex-thia/infra test -- http-api.spec.ts identity.spec.ts
pnpm --filter @flex-thia/infra typecheck
```

Expected: 두 명령 모두 exit code `0`.

- [ ] **Step 8: API 도메인 변경 커밋**

```bash
git add infra/src/application-stack.ts infra/src/constructs/http-api.ts infra/test/http-api.spec.ts infra/test/identity.spec.ts
git commit -m "feat: add production api domain"
```

---

### Task 3: AWS 준비·배포 문서를 실제 주소와 명령에 맞춤

**Files:**

- Modify: `docs/development/aws-account-setup.md`
- Modify: `docs/development/aws-deployment.md`
- Modify: `docs/superpowers/specs/2026-07-17-aws-serverless-infrastructure-design.md`

**Interfaces:**

- Consumes: Task 1·2의 확정 주소와 현재 로컬 SSO profile `flex-thia-admin`
- Produces: 초보 개발자가 그대로 따라도 `app` 주소나 실패한 bootstrap 명령을 사용하지 않는 운영 문서

- [ ] **Step 1: 계정 설정 문서의 운영 주소 수정**

`docs/development/aws-account-setup.md`의 도메인 목록을 다음으로 바꾼다.

```md
현재 인프라는 이 도메인 아래에 다음 주소를 만든다.

- `www.<ROOT_DOMAIN>`: CloudFront가 제공하는 정식 웹 주소
- `<ROOT_DOMAIN>`: 정식 `www` 주소로 이동시키는 보조 주소
- `api.<ROOT_DOMAIN>`: API Gateway가 제공하는 API 주소
- `no-reply@<ROOT_DOMAIN>`: passwordless 로그인 이메일 발신 주소
```

- [ ] **Step 2: 이미 검증한 bootstrap 명령으로 문서 수정**

`docs/development/aws-account-setup.md`의 두 bootstrap 명령을 다음으로
교체한다. `pnpm --filter`는 `infra/cdk.json`을 읽어 production context
검증을 먼저 실행하므로 context가 없는 bootstrap에는 사용하지 않는다.

```bash
./infra/node_modules/.bin/cdk bootstrap \
  "aws://$AWS_ACCOUNT_ID/ap-northeast-2" \
  --profile "$AWS_PROFILE" \
  --termination-protection

./infra/node_modules/.bin/cdk bootstrap \
  "aws://$AWS_ACCOUNT_ID/us-east-1" \
  --profile "$AWS_PROFILE" \
  --termination-protection
```

- [ ] **Step 3: 배포 후 확인 주소와 명령 수정**

`docs/development/aws-deployment.md`의 웹 주소 안내를 다음으로 바꾼다.

```text
https://www.<ROOT_DOMAIN>
```

바로 아래에 다음 설명을 추가한다.

```md
`https://<ROOT_DOMAIN>`으로 접속하면 path와 query를 유지한 채 위 `www`
주소로 이동해야 한다.
```

API health 명령을 다음으로 바꾼다.

```bash
curl https://api.<ROOT_DOMAIN>/health
```

배포 완료 체크리스트의 웹·API 항목을 다음으로 바꾼다.

```md
- [ ] `https://www.<ROOT_DOMAIN>`이 HTTPS로 열린다.
- [ ] `https://<ROOT_DOMAIN>`이 같은 path·query의 `www` 주소로 이동한다.
- [ ] `https://api.<ROOT_DOMAIN>/health`와 재시도 후 `/ready`가 정상이다.
```

- [ ] **Step 4: 기존 전체 설계 문서의 도메인 경계 수정**

`docs/superpowers/specs/2026-07-17-aws-serverless-infrastructure-design.md`의
Web·API 도메인 목록을 다음으로 맞춘다.

```md
- Canonical Web: `www.<root-domain>`
- Web redirect: `<root-domain>` → `www.<root-domain>`
- API: `api.<root-domain>`
```

- [ ] **Step 5: 현재 운영 문서에 폐기한 `app` 주소가 없는지 확인**

Run:

```bash
rg -n "app\\.<ROOT_DOMAIN>|https://app\\.|app\\.<root-domain>" \
  docs/development/aws-account-setup.md \
  docs/development/aws-deployment.md \
  docs/superpowers/specs/2026-07-17-aws-serverless-infrastructure-design.md
```

Expected: 출력 없음, exit code `1`.

- [ ] **Step 6: 문서 변경 커밋**

```bash
git add docs/development/aws-account-setup.md docs/development/aws-deployment.md docs/superpowers/specs/2026-07-17-aws-serverless-infrastructure-design.md
git commit -m "docs: align aws production domains"
```

---

### Task 4: 전체 회귀 검증과 production diff 준비

**Files:**

- Verify: `infra/src/**/*.ts`
- Verify: `infra/test/**/*.spec.ts`
- Verify: `docs/development/*.md`
- Verify: `.github/workflows/deploy-production.yml`

**Interfaces:**

- Consumes: Task 1~3의 구현과 이미 등록된 GitHub production environment 값
- Produces: AWS 배포 전에 검토 가능한 CloudFormation template과 실제 계정 변경점

- [ ] **Step 1: 인프라 전체 테스트 실행**

Run:

```bash
pnpm --filter @flex-thia/infra test
```

Expected: 모든 `infra/test` 테스트 PASS, exit code `0`.

- [ ] **Step 2: 정적 검증 실행**

Run:

```bash
pnpm --filter @flex-thia/infra typecheck
pnpm format:check
pnpm lint
git diff --check
```

Expected: 네 명령 모두 exit code `0`.

- [ ] **Step 3: 테스트 fixture로 CDK template 합성**

Run:

```bash
pnpm infra:synth
```

Expected: `FlexThiaDataProd`, `FlexThiaApplicationProd`,
`FlexThiaEdgeProd`가 모두 합성되고 exit code `0`.

- [ ] **Step 4: 합성 결과에서 운영 주소 확인**

Run:

```bash
rg -n "www\\.example\\.com|api\\.example\\.com|app\\.example\\.com" infra/cdk.out
```

Expected: `www.example.com`과 `api.example.com`은 출력되고
`app.example.com`은 출력되지 않는다.

- [ ] **Step 5: production context의 필수 로컬 값을 확인**

다음 명령은 값을 출력하지 않고 누락 여부만 확인한다.

```bash
test -n "$ALERT_EMAIL"
test -n "$ALLOWED_EMAIL_DOMAINS"
test -f media-public-key.pem
aws sso login --profile flex-thia-admin
aws sts get-caller-identity \
  --profile flex-thia-admin \
  --query Account \
  --output text
```

Expected: 앞의 세 명령은 출력 없이 성공하고, 마지막 명령은
`330422589765`를 출력한다.

- [ ] **Step 6: production context를 구성하고 read-only diff 실행**

```bash
export AWS_PROFILE=flex-thia-admin
export AWS_ACCOUNT_ID=330422589765
export ROOT_DOMAIN=pleasegraduate.me
export HOSTED_ZONE_ID="$(
  aws route53 list-hosted-zones-by-name \
    --profile "$AWS_PROFILE" \
    --dns-name "$ROOT_DOMAIN" \
    --query "HostedZones[?Name=='${ROOT_DOMAIN}.'].Id | [0]" \
    --output text |
    sed 's|/hostedzone/||'
)"
export GITHUB_REPOSITORY_CONTEXT=Dessert99/flex-thai
export MEDIA_PUBLIC_KEY_PEM="$(<media-public-key.pem)"
export MONTHLY_BUDGET_USD=30

pnpm --filter @flex-thia/infra exec cdk diff --all \
  --profile "$AWS_PROFILE" \
  -c "account=$AWS_ACCOUNT_ID" \
  -c "rootDomain=$ROOT_DOMAIN" \
  -c "hostedZoneId=$HOSTED_ZONE_ID" \
  -c "alertEmail=$ALERT_EMAIL" \
  -c "githubRepository=$GITHUB_REPOSITORY_CONTEXT" \
  -c "mediaPublicKeyPem=$MEDIA_PUBLIC_KEY_PEM" \
  -c "allowedEmailDomains=$ALLOWED_EMAIL_DOMAINS" \
  -c "monthlyBudgetUsd=$MONTHLY_BUDGET_USD"
```

Expected:

- 세 stack의 생성 예정 자원이 표시된다.
- Edge stack에 루트·`www` 인증서, CloudFront Function, A·AAAA records가 보인다.
- Application stack에 `api` 인증서, custom domain, API mapping, A record가 보인다.
- `app.pleasegraduate.me` 레코드나 인증서가 보이지 않는다.
- `cdk deploy`는 실행되지 않고 AWS 자원도 생성되지 않는다.

- [ ] **Step 7: diff 결과를 사용자와 함께 검토하고 멈춤**

다음 항목이 하나라도 보이면 배포하지 않는다.

- Aurora cluster 또는 S3 bucket의 replacement·deletion
- Cognito User Pool replacement
- 기존 미디어 key group 또는 CloudFront 배포의 의도하지 않은 삭제
- `pleasegraduate.me` 이외의 Route 53 hosted zone 변경
- `app.pleasegraduate.me` 신규 생성

문제가 없더라도 이 계획에서는 GitHub `deploy-production`을 실행하지 않는다.
첫 배포는 별도 승인 후 진행한다.

