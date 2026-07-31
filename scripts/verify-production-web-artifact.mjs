/** production Vite artifact가 배포 가능한 web application인지 검증한다 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const infrastructureProbe = 'FLEX THIA infrastructure ready';

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

const readJavaScriptFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return readJavaScriptFiles(path);
      }
      return entry.isFile() && path.endsWith('.js') ? [path] : [];
    }),
  );
  return paths.flat();
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

  const javaScriptPaths = await readJavaScriptFiles(assetsPath);
  const javaScriptSources = await Promise.all(
    javaScriptPaths.map(async (path) => ({
      path,
      source: await readFile(path, 'utf8'),
    })),
  );
  if (!javaScriptSources.some(({ source }) => source.includes(apiBaseUrl))) {
    throw new Error(
      'Production web artifact does not contain the configured API URL.',
    );
  }
  if (
    javaScriptSources.some(
      ({ source }) => Buffer.byteLength(source) > maximumJavaScriptBytes,
    )
  ) {
    throw new Error(
      'Production web artifact exceeds the maximum JavaScript size.',
    );
  }

  return {
    indexFile: relative(directory, indexPath),
    javaScriptFiles: javaScriptPaths.map((path) => relative(directory, path)),
  };
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [directory, apiBaseUrl] = process.argv.slice(2);
  await verifyProductionWebArtifact({ directory, apiBaseUrl });
}
