/** 로컬 API 준비 후 Swagger UI를 기본 브라우저로 연다 */
import open from 'open';
import {
  type LocalApiServerOptions,
  startLocalApiServer,
} from './local-server.js';
import { SWAGGER_UI_PATH } from './openapi/openapi.js';

type StartServer = (options?: LocalApiServerOptions) => Promise<void>;
type OpenPage = (url: string) => Promise<unknown>;
type ReportError = (message: string) => void;

/** 테스트가 실행 부수효과를 대신 주입할 수 있게 한다 */
export interface SwaggerLauncherOptions {
  port?: number;
  startServer?: StartServer;
  openPage?: OpenPage;
  reportError?: ReportError;
}

/** 지정 포트의 Swagger UI 절대 URL을 만든다 */
export const createSwaggerUrl = (port: number): string =>
  `http://localhost:${port}/${SWAGGER_UI_PATH}`;

/** 로컬 API를 준비한 뒤 Swagger UI를 열고 브라우저 실패만 복구한다 */
export const launchSwagger = async ({
  port = Number(process.env.PORT ?? 3000),
  startServer = startLocalApiServer,
  openPage = open,
  reportError = console.error,
}: SwaggerLauncherOptions = {}): Promise<void> => {
  await startServer({ nodeEnv: 'development', port });
  const url = createSwaggerUrl(port);

  try {
    await openPage(url);
  } catch {
    reportError(`브라우저를 열지 못했습니다. 직접 접속하세요: ${url}`);
  }
};
