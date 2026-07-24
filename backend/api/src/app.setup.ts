/** local HTTP와 Lambda가 같은 CORS·전역 설정을 사용하게 한다 */
import { type INestApplication, RequestMethod } from '@nestjs/common';
import { DomainExceptionFilter } from './common/errors/domain-exception.filter.js';
import { StructuredLogger } from './common/logging/structured-logger.js';
import { configureOpenApi } from './openapi/openapi.js';

/** credentials CORS를 exact allowlist origin에만 허용한다 */
export const configureApp = (
  app: INestApplication,
  allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  nodeEnv = process.env.NODE_ENV,
): void => {
  const logger = new StructuredLogger('api');
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'ready', method: RequestMethod.GET },
    ],
  });
  app.useLogger(logger);
  app.useGlobalFilters(new DomainExceptionFilter(logger));
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  configureOpenApi(app, nodeEnv);
};
