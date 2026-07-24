/** 로컬 실행 진입점들이 같은 NestJS 서버 설정을 공유하게 한다 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createApplicationModule } from './app.module.js';
import { configureApp } from './app.setup.js';

/** 로컬 서버 진입점이 환경과 포트만 선택하게 한다 */
export interface LocalApiServerOptions {
  nodeEnv?: string;
  port?: number;
}

/** 로컬 NestJS 서버를 공통 설정으로 시작한다 */
export const startLocalApiServer = async ({
  nodeEnv = process.env.NODE_ENV,
  port = Number(process.env.PORT ?? 3000),
}: LocalApiServerOptions = {}): Promise<void> => {
  const app = await NestFactory.create(createApplicationModule());
  configureApp(app, undefined, nodeEnv);
  await app.listen(port);
};
