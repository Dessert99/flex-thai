/** HTTP 기능 모듈을 하나의 NestJS 애플리케이션으로 조립한다 */
import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';

/** 기초 API의 root module */
@Module({
  controllers: [HealthController],
})
export class AppModule {}
