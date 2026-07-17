/** DB와 무관하게 API 프로세스의 생존 여부를 노출하는 Controller */
import { Controller, Get } from '@nestjs/common';

/** 배포와 알람에서 API 프로세스 생존을 확인한다 */
@Controller('health')
export class HealthController {
  /** 외부 의존성을 호출하지 않는 liveness 응답을 반환한다 */
  @Get()
  getHealth(): { status: 'ok'; service: 'api' } {
    return { status: 'ok', service: 'api' };
  }
}
