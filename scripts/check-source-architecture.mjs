/** 계층 의존성, 페이지 조립 경계와 배럴 금지를 검사한다. */
import console from 'node:console';
import process from 'node:process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontendPrefix = 'frontend/web/src/';
const layerRank = { app: 3, pages: 2, features: 1, shared: 0 };

/** 파일 내용을 입력받아 실제 파일을 변경하지 않고 구조 위반을 반환한다. */
export function checkSourceArchitecture(files) {
  const violations = [];
  const paths = new Set(Object.keys(files));
  for (const [file, content] of Object.entries(files)) {
    // CSS는 import 경로 존재 여부만 검사하고 TypeScript로 해석하지 않는다.
    if (file.endsWith('.css')) continue;
    const source = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
    );
    const parts = file.startsWith(frontendPrefix)
      ? file.slice(frontendPrefix.length).split('/')
      : [];
    const [layer, feature] = parts;
    const isTest = /\.test\.tsx?$/.test(file);
    if (
      layer === 'pages' &&
      parts
        .slice(1, -1)
        .some((part) =>
          ['components', 'hooks', 'apis', 'libs', 'ui', 'model'].includes(part),
        )
    ) {
      violations.push(`${file}: pages에는 조립용 페이지 파일만 둡니다.`);
    }
    if (
      (layer === 'features' &&
        ['ui', 'model', 'api', 'lib'].includes(parts[2])) ||
      (layer === 'shared' && ['ui', 'model', 'api', 'lib'].includes(parts[1]))
    ) {
      violations.push(
        `${file}: components/hooks/apis/libs 역할 폴더를 사용하세요.`,
      );
    }
    const importedNames = new Set();
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement)) {
        const clause = statement.importClause;
        if (clause?.name) importedNames.add(clause.name.text);
        if (clause?.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings)) {
            importedNames.add(clause.namedBindings.name.text);
          } else {
            for (const item of clause.namedBindings.elements)
              importedNames.add(item.name.text);
          }
        }
      }
    }
    function visit(node) {
      if (ts.isExportDeclaration(node)) {
        const reexportsImported =
          node.exportClause &&
          ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.some((item) =>
            importedNames.has((item.propertyName ?? item.name).text),
          );
        if (node.moduleSpecifier || reexportsImported) {
          violations.push(
            `${file}: 배럴 재수출 대신 정의 파일에서 직접 import하세요.`,
          );
        }
      }
      if (layer === 'pages' && !isTest && ts.isCallExpression(node)) {
        violations.push(
          `${file}: 페이지의 상태·조회·이벤트 처리 로직은 features로 옮기세요.`,
        );
      }
      const specifier =
        ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
          ? node.moduleSpecifier
          : ts.isCallExpression(node) &&
              node.expression.kind === ts.SyntaxKind.ImportKeyword
            ? node.arguments[0]
            : undefined;
      if (specifier && ts.isStringLiteral(specifier) && parts.length) {
        const spec = specifier.text;
        const target = spec.startsWith('@/')
          ? frontendPrefix + spec.slice(2)
          : spec.startsWith('.')
            ? relative(root, resolve(root, dirname(file), spec))
            : undefined;
        if (target?.startsWith(frontendPrefix)) {
          const [targetLayer, targetFeature, targetFolder] = target
            .slice(frontendPrefix.length)
            .split('/');
          if (layerRank[targetLayer] > layerRank[layer]) {
            violations.push(
              `${file}: ${layer}에서 상위 계층 ${targetLayer}를 import할 수 없습니다.`,
            );
          }
          if (
            layer === 'features' &&
            targetLayer === 'features' &&
            feature !== targetFeature
          ) {
            violations.push(
              `${file}: 다른 feature와의 조립은 pages에서 담당합니다 (${spec}).`,
            );
          }
          if (
            layer === 'pages' &&
            !isTest &&
            targetLayer === 'features' &&
            targetFolder !== 'components'
          ) {
            violations.push(
              `${file}: pages는 feature 컴포넌트만 조립합니다 (${spec}).`,
            );
          }
          if (
            !['', '.ts', '.tsx', '.css'].some((extension) =>
              paths.has(target + extension),
            )
          ) {
            violations.push(
              `${file}: 실제 파일 경로로 import하세요 (${spec}).`,
            );
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return violations;
}

function readSources(directory, files) {
  for (const item of readdirSync(resolve(root, directory), {
    withFileTypes: true,
  })) {
    if (
      [
        'node_modules',
        'dist',
        'coverage',
        'storybook-static',
        'cdk.out',
        'drizzle',
      ].includes(item.name)
    )
      continue;
    const file = `${directory}/${item.name}`;
    if (item.isDirectory()) readSources(file, files);
    else if (
      /\.(?:tsx?|css)$/.test(item.name) &&
      !item.name.endsWith('.d.ts')
    ) {
      if (item.name !== 'routeTree.gen.ts')
        files[file] = readFileSync(resolve(root, file), 'utf8');
      else files[file] = '';
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const files = {};
  for (const directory of ['backend', 'frontend', 'shared', 'infra'])
    readSources(directory, files);
  const violations = checkSourceArchitecture(files);
  if (violations.length) {
    console.error(violations.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(
      '소스 구조 검사 통과: 페이지 조립, 계층 의존성, 직접 import, 배럴 금지',
    );
  }
}
