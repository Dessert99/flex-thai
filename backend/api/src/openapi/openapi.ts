/** 활성 HTTP metadata에서 FLEX THIA OpenAPI document를 생성한다 */
import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { REFRESH_COOKIE_NAME } from '../identity/refresh-cookie.js';

const OPEN_API_CONFIG = new DocumentBuilder()
  .setTitle('FLEX THIA API')
  .setDescription('FLEX 태국어 학습 서비스 공개 API')
  .setVersion('1.0')
  .addBearerAuth(
    { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    'accessToken',
  )
  .addCookieAuth(REFRESH_COOKIE_NAME, undefined, 'refreshCookie')
  .build();

/** 비운영 Swagger UI와 JSON의 고정 경로 */
export interface OpenApiPaths {
  ui: 'api/docs';
  json: 'api/openapi.json';
}

/** 현재 Nest Controller metadata에서 정리된 OpenAPI document를 만든다 */
export const createOpenApiDocument = (app: INestApplication): OpenAPIObject =>
  cleanupOpenApiDoc(SwaggerModule.createDocument(app, OPEN_API_CONFIG));

/** production에서 문서 route 자체를 만들지 않게 경로를 판정한다 */
export const resolveOpenApiPaths = (
  nodeEnv: string | undefined,
): OpenApiPaths | null =>
  nodeEnv === 'production'
    ? null
    : { ui: 'api/docs', json: 'api/openapi.json' };

/** 비운영 환경에만 Swagger UI와 OpenAPI JSON을 등록한다 */
export const configureOpenApi = (
  app: INestApplication,
  nodeEnv: string | undefined,
): void => {
  const paths = resolveOpenApiPaths(nodeEnv);

  if (!paths) {
    return;
  }

  SwaggerModule.setup(paths.ui, app, () => createOpenApiDocument(app), {
    jsonDocumentUrl: paths.json,
  });
};
