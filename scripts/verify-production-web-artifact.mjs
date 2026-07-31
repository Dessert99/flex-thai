/** production Vite artifact가 배포 가능한 web application인지 검증한다 */
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const infrastructureProbe = 'FLEX THIA infrastructure ready';
const manifestFile = '.vite/manifest.json';

const isDirectory = async (path) => {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
};

const isFile = async (path) => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};

const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isInside = (parent, child) => {
  const childPath = relative(parent, child);
  return (
    childPath === '' || (!childPath.startsWith('..') && !isAbsolute(childPath))
  );
};

const readIndexJavaScriptReferences = (source) =>
  [
    ...source.matchAll(/\b(?:src|href)=["']([^"']+\.js(?:[?#][^"']*)?)["']/gu),
  ].map((match) => match[1]);

const normalizeLocalReference = (reference) => {
  if (
    typeof reference !== 'string' ||
    reference.startsWith('http://') ||
    reference.startsWith('https://') ||
    reference.startsWith('//')
  ) {
    return undefined;
  }
  return reference.split(/[?#]/u, 1)[0].replace(/^\/+/u, '');
};

const readManifest = async (directory) => {
  const path = join(directory, manifestFile);
  if (!(await isFile(path))) {
    throw new Error('Production web artifact is missing Vite manifest.');
  }
  try {
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    if (!isRecord(manifest)) {
      throw new Error();
    }
    return manifest;
  } catch {
    throw new Error('Production web artifact has an invalid Vite manifest.');
  }
};

const readReachableJavaScript = async ({
  assetsPath,
  directory,
  indexSource,
}) => {
  // Minified source 문법 대신 Vite가 생성한 manifest를 module graph의 단일 기준으로 사용한다.
  const manifest = await readManifest(directory);
  const canonicalDirectory = await realpath(directory);
  const canonicalAssetsPath = await realpath(assetsPath);
  if (!isInside(canonicalDirectory, canonicalAssetsPath)) {
    throw new Error(
      'Production web artifact JavaScript must stay inside assets.',
    );
  }

  const entryFiles = readIndexJavaScriptReferences(indexSource)
    .map(normalizeLocalReference)
    .filter((reference) => reference !== undefined);
  const pending = Object.entries(manifest)
    .filter(
      ([, record]) =>
        isRecord(record) &&
        typeof record.file === 'string' &&
        entryFiles.includes(normalizeLocalReference(record.file)),
    )
    .map(([key]) => key);
  if (entryFiles.length === 0 || pending.length !== entryFiles.length) {
    throw new Error(
      'Production web artifact manifest does not describe entry JavaScript.',
    );
  }

  const sources = [];
  const visited = new Set();

  while (pending.length > 0) {
    const key = pending.shift();
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);
    const record = manifest[key];
    if (
      !isRecord(record) ||
      typeof record.file !== 'string' ||
      (record.imports !== undefined &&
        (!Array.isArray(record.imports) ||
          record.imports.some((child) => typeof child !== 'string'))) ||
      (record.dynamicImports !== undefined &&
        (!Array.isArray(record.dynamicImports) ||
          record.dynamicImports.some((child) => typeof child !== 'string')))
    ) {
      throw new Error('Production web artifact has an invalid Vite manifest.');
    }

    const reference = normalizeLocalReference(record.file);
    if (reference === undefined) {
      throw new Error(
        'Production web artifact JavaScript must stay inside assets.',
      );
    }
    const unresolvedPath = resolve(directory, reference);
    // Lexical traversal과 symlink traversal을 각각 차단한다.
    if (!isInside(resolve(assetsPath), unresolvedPath)) {
      throw new Error(
        'Production web artifact JavaScript must stay inside assets.',
      );
    }
    let path;
    try {
      path = await realpath(unresolvedPath);
    } catch {
      throw new Error('Production web artifact references missing JavaScript.');
    }
    if (
      !isInside(canonicalDirectory, path) ||
      !isInside(canonicalAssetsPath, path) ||
      !(await isFile(path))
    ) {
      throw new Error(
        'Production web artifact JavaScript must stay inside assets.',
      );
    }

    const source = await readFile(path, 'utf8');
    sources.push({ file: reference, source });
    pending.push(...(record.imports ?? []), ...(record.dynamicImports ?? []));
  }

  return sources;
};

/** deployment 전에 production web bundle의 필수 파일·API URL·chunk 크기를 확인한다 */
export const verifyProductionWebArtifact = async ({
  directory,
  apiBaseUrl,
  maximumJavaScriptBytes = 500_000,
}) => {
  const indexPath = join(directory, 'index.html');
  const assetsPath = join(directory, 'assets');
  if (!(await isFile(indexPath))) {
    throw new Error('Production web artifact is missing index.html.');
  }
  if (!(await isDirectory(assetsPath))) {
    throw new Error('Production web artifact is missing assets directory.');
  }

  const indexSource = await readFile(indexPath, 'utf8');
  if (indexSource.includes(infrastructureProbe)) {
    throw new Error('Production web artifact contains infrastructure probe.');
  }

  const reachableJavaScriptSources = await readReachableJavaScript({
    assetsPath,
    directory,
    indexSource,
  });
  if (
    !reachableJavaScriptSources.some(({ source }) =>
      source.includes(apiBaseUrl),
    )
  ) {
    throw new Error(
      'Production web artifact does not contain the configured API URL.',
    );
  }
  if (
    reachableJavaScriptSources.some(
      ({ source }) => Buffer.byteLength(source) > maximumJavaScriptBytes,
    )
  ) {
    throw new Error(
      'Production web artifact exceeds the maximum JavaScript size.',
    );
  }

  return {
    indexFile: relative(directory, indexPath),
    javaScriptFiles: reachableJavaScriptSources.map(({ file }) => file),
  };
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [directory, apiBaseUrl] = process.argv.slice(2);
  await verifyProductionWebArtifact({ directory, apiBaseUrl });
}
