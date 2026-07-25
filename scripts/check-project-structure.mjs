/** 저장소 최상위 workspace가 승인된 제품 영역에만 존재하는지 검사한다 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const forbiddenDirectories = ['apps', 'packages'];
const requiredFiles = [
  'backend/api/package.json',
  'backend/worker/package.json',
  'backend/domain/package.json',
  'backend/database/package.json',
  'backend/providers/package.json',
  'backend/config/package.json',
  'frontend/web/package.json',
  'frontend/web/tsconfig.json',
  'frontend/web/src/main.tsx',
  'shared/contracts/package.json',
  'conventions/structure-convention.md',
];

const violations = [
  ...forbiddenDirectories
    .filter((path) => existsSync(resolve(root, path)))
    .map((path) => `금지된 과거 최상위 폴더가 존재합니다: ${path}`),
  ...requiredFiles
    .filter((path) => !existsSync(resolve(root, path)))
    .map((path) => `필수 구조 파일을 찾을 수 없습니다: ${path}`),
];

if (violations.length > 0) {
  throw new Error(violations.join('\n'));
}
