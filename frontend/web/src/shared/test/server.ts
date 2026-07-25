/** 단위·컴포넌트 테스트의 HTTP 요청을 제어하는 MSW 서버를 제공한다 */
import { setupServer } from 'msw/node';

/** 테스트별 HTTP 핸들러를 등록하는 공유 MSW 서버 */
export const server = setupServer();
