/** 로컬 production CDK diff의 설정 검증과 CLI 인수 생성을 담당한다 */
import { z } from 'zod';
import {
  type InfrastructureConfig,
  readInfrastructureConfig,
} from './config.js';

const localProductionDiffEnvironmentSchema = z.object({
  AWS_PROFILE: z.string().trim().min(1),
  AWS_ACCOUNT_ID: z.string().regex(/^\d{12}$/u),
  ROOT_DOMAIN: z.string().trim().min(3),
  HOSTED_ZONE_ID: z.string().trim().min(2),
  ALERT_EMAIL: z.email(),
  ALLOWED_EMAIL_DOMAINS: z.string().trim().min(1),
  GITHUB_REPOSITORY_CONTEXT: z.string().regex(/^[^/]+\/[^/]+$/u),
  MONTHLY_BUDGET_USD: z.coerce.number().positive(),
  MEDIA_PUBLIC_KEY_PATH: z.string().trim().min(1),
});

/** 로컬 실행기가 사용하는 production 설정 */
export type LocalProductionDiffEnvironment = {
  awsProfile: string;
  account: string;
  rootDomain: string;
  hostedZoneId: string;
  alertEmail: string;
  allowedEmailDomains: string;
  githubRepository: string;
  monthlyBudgetUsd: number;
  mediaPublicKeyPath: string;
};

/** 전용 환경 파일의 문자열을 검증된 로컬 production 설정으로 변환한다 */
export const readLocalProductionDiffEnvironment = (
  source: Record<string, string | undefined>,
): LocalProductionDiffEnvironment => {
  const parsed = localProductionDiffEnvironmentSchema.parse(source);

  return {
    awsProfile: parsed.AWS_PROFILE,
    account: parsed.AWS_ACCOUNT_ID,
    rootDomain: parsed.ROOT_DOMAIN,
    hostedZoneId: parsed.HOSTED_ZONE_ID,
    alertEmail: parsed.ALERT_EMAIL,
    allowedEmailDomains: parsed.ALLOWED_EMAIL_DOMAINS,
    githubRepository: parsed.GITHUB_REPOSITORY_CONTEXT,
    monthlyBudgetUsd: parsed.MONTHLY_BUDGET_USD,
    mediaPublicKeyPath: parsed.MEDIA_PUBLIC_KEY_PATH,
  };
};

/** 공개 키를 합쳐 기존 production 인프라 설정 계약을 재사용한다 */
export const createProductionInfrastructureConfig = (
  environment: LocalProductionDiffEnvironment,
  mediaPublicKeyPem: string,
): InfrastructureConfig =>
  readInfrastructureConfig({
    account: environment.account,
    rootDomain: environment.rootDomain,
    hostedZoneId: environment.hostedZoneId,
    alertEmail: environment.alertEmail,
    githubRepository: environment.githubRepository,
    mediaPublicKeyPem,
    allowedEmailDomains: environment.allowedEmailDomains,
    monthlyBudgetUsd: environment.monthlyBudgetUsd,
  });

/** 잘못 로그인한 계정에 대한 diff 실행을 시작 전에 차단한다 */
export const assertExpectedAwsAccount = (
  actualAccount: string,
  expectedAccount: string,
): void => {
  if (actualAccount !== expectedAccount) {
    throw new Error(
      `AWS 계정이 일치하지 않습니다: expected ${expectedAccount}, received ${actualAccount}`,
    );
  }
};

/** 검증된 production 설정을 기존 CDK context 인수로 변환한다 */
export const createProductionDiffArguments = (
  config: InfrastructureConfig,
  awsProfile: string,
): readonly string[] => [
  'diff',
  '--all',
  '--profile',
  awsProfile,
  '--no-change-set',
  '-c',
  `account=${config.account}`,
  '-c',
  `rootDomain=${config.rootDomain}`,
  '-c',
  `hostedZoneId=${config.hostedZoneId}`,
  '-c',
  `alertEmail=${config.alertEmail}`,
  '-c',
  `githubRepository=${config.githubRepository}`,
  '-c',
  `mediaPublicKeyPem=${config.mediaPublicKeyPem}`,
  '-c',
  `allowedEmailDomains=${config.allowedEmailDomains}`,
  '-c',
  `monthlyBudgetUsd=${config.monthlyBudgetUsd}`,
];
