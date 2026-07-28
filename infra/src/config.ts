/** CDK synth와 deploy가 같은 production 설정을 사용하게 검증한다 */
import { z } from 'zod';

const infrastructureConfigSchema = z.object({
  account: z.string().regex(/^\d{12}$/u),
  rootDomain: z.string().min(3),
  hostedZoneId: z.string().min(2),
  alertEmail: z.email(),
  githubRepository: z.string().regex(/^[^/]+\/[^/]+$/u),
  ttsVoicePresetId: z.uuid(),
  mediaPublicKeyPem: z
    .string()
    .trim()
    .regex(
      /^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----$/u,
      'CloudFront media public key는 PEM 형식이어야 한다',
    ),
  allowedEmailDomains: z.string().default('hufs.ac.kr'),
  appRegion: z.literal('ap-northeast-2').default('ap-northeast-2'),
  edgeRegion: z.literal('us-east-1').default('us-east-1'),
  monthlyBudgetUsd: z.coerce.number().positive().default(30),
});

/** CDK Stack이 공유하는 검증된 production 설정 */
export type InfrastructureConfig = z.infer<typeof infrastructureConfigSchema>;

/** CDK context 문자열을 안전한 설정으로 변환한다 */
export const readInfrastructureConfig = (
  context: Record<string, unknown>,
): InfrastructureConfig => infrastructureConfigSchema.parse(context);

/** CDK context와 실행 환경을 합쳐 production 설정을 검증한다 */
export const readInfrastructureConfigFromSources = (
  context: Record<string, unknown>,
  environment: Record<string, string | undefined>,
): InfrastructureConfig =>
  readInfrastructureConfig({
    ...context,
    mediaPublicKeyPem:
      context.mediaPublicKeyPem ?? environment.MEDIA_PUBLIC_KEY_PEM,
    ttsVoicePresetId:
      context.ttsVoicePresetId ?? environment.TTS_VOICE_PRESET_ID,
  });
