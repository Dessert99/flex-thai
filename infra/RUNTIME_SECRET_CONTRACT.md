# Production Lambda secret contract

Infrastructure passes secret identifiers only. Neither the API Lambda nor Cognito Create Auth Challenge receives plaintext secret values in CloudFormation environment variables.

| Environment variable | Consumer | Runtime output |
| --- | --- | --- |
| `CUSTOM_AUTH_SECRET_ARN` | API, Create Auth Challenge | `CUSTOM_AUTH_SECRET` |
| `CHALLENGE_HMAC_PEPPER_SECRET_ARN` | API | `CHALLENGE_HMAC_PEPPER` |
| `MEDIA_PRIVATE_KEY_SECRET_ARN` | API | CloudFront signing private key |

The runtime integration branch must fetch each ARN with Secrets Manager during cold start, cache the resolved value for the execution environment, and finish resolution before `readApiEnv()` constructs the Nest application or the Cognito trigger handles an event. IAM grants are limited to `GetSecretValue` and `DescribeSecret` for the referenced secret resources.

The API also receives the non-secret production settings `EMAIL_LINK_CONFIRMATION_URL`, `MEDIA_CDN_BASE_URL`, `MEDIA_BUCKET_NAME`, and `MEDIA_KEY_PAIR_ID`.
