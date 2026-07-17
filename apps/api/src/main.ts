/** 로컬 개발용 NestJS HTTP 서버를 시작한다 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

/** 로컬에서만 사용하는 HTTP 서버 bootstrap */
export const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule);
  await app.listen(Number(process.env.PORT ?? 3000));
};

void bootstrap();
