# Production Lambda secret contract

Infrastructure passes secret identifiers only. Neither the API Lambda nor Cognito Create Auth Challenge receives plaintext secret values in CloudFormation environment variables.

| Environment variable | Consumer | Runtime output |
| --- | --- | --- |
| `CUSTOM_AUTH_SECRET_ARN` | API, Create Auth Challenge | HMAC proof 생성용 secret |
| `CHALLENGE_HMAC_PEPPER_SECRET_ARN` | API passwordless challenge | 인증 코드·링크 HMAC pepper |
| `MEDIA_PRIVATE_KEY_SECRET_ARN` | API media provider | CloudFront signing private key |

Each consumer resolves its ARN at runtime and caches the in-flight or resolved promise for the warm execution environment. A failed fetch is evicted so the next invocation can retry. The plaintext is never written back to an environment variable. IAM grants are limited to the referenced secret resource.

The API also receives the non-secret production settings `EMAIL_LINK_CONFIRMATION_URL`, `MEDIA_CDN_BASE_URL`, `MEDIA_BUCKET_NAME`, and `MEDIA_KEY_PAIR_ID`.
