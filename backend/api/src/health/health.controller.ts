/** DB와 무관하게 API 프로세스의 생존 여부를 노출하는 Controller */
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@flex-thia/contracts';
import { HealthResponseDto } from '../openapi/openapi.dto.js';

/** 배포와 알람에서 API 프로세스 생존을 확인한다 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  /** 외부 의존성을 호출하지 않는 liveness 응답을 반환한다 */
  @ApiOperation({ summary: 'API 프로세스 생존 상태를 확인한다' })
  @ApiOkResponse({ type: HealthResponseDto })
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'api' };
  }
}
