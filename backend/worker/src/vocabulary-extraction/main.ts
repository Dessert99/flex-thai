/** 컨테이너·상시 프로세스에서 별도로 실행할 추출 worker 진입점 */
import { runExtractionLoop } from './extraction-runtime.js';
const controller = new AbortController();
process.once('SIGTERM', () => controller.abort());
process.once('SIGINT', () => controller.abort());
void runExtractionLoop(controller.signal).catch(() => {
  console.error('Extraction worker startup failed');
  process.exitCode = 1;
});
