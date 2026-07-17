/** local HTTP와 Lambda가 같은 CORS·전역 설정을 사용하게 한다 */
import type { INestApplication } from '@nestjs/common';

/** credentials CORS를 exact allowlist origin에만 허용한다 */
export const configureApp = (
  app: INestApplication,
  allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
): void => {
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
};
