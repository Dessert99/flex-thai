/** production web artifact가 배포에 필요한 실행 경계를 지키는지 검증한다 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const apiBaseUrl = 'https://api.example.com/api/v1';
const maximumJavaScriptBytes = 500_000;
const artifactDirectories = [];

const loadVerifier = () => import('./verify-production-web-artifact.mjs');

const createArtifact = async ({
  applicationSource = apiBaseUrl,
  hasAssets = true,
  hasIndex = true,
  indexSource = '<main>FLEX THIA</main>',
} = {}) => {
  const directory = await mkdtemp(join(tmpdir(), 'flex-thia-artifact-'));
  artifactDirectories.push(directory);
  if (hasIndex) {
    await writeFile(join(directory, 'index.html'), indexSource);
  }
  if (hasAssets) {
    await mkdir(join(directory, 'assets'));
    await writeFile(
      join(directory, 'assets', 'application.js'),
      applicationSource,
    );
  }
  return directory;
};

afterEach(async () => {
  await Promise.all(
    artifactDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('production web artifact 검증', () => {
  it('index와 assets에 API subdomain이 있는 artifact를 통과시킨다', async () => {
    const directory = await createArtifact();
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).resolves.toMatchObject({ indexFile: 'index.html' });
  });

  it('infrastructure probe 문구가 남은 artifact를 거부한다', async () => {
    const directory = await createArtifact({
      indexSource: '<main>FLEX THIA infrastructure ready</main>',
    });
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow('Production web artifact contains infrastructure probe.');
  });

  it('API subdomain이 없는 artifact를 거부한다', async () => {
    const directory = await createArtifact({
      applicationSource: 'console.log(1);',
    });
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow(
      'Production web artifact does not contain the configured API URL.',
    );
  });

  it('500KB를 넘는 application JavaScript artifact를 거부한다', async () => {
    const directory = await createArtifact({
      applicationSource: `${apiBaseUrl}${'x'.repeat(maximumJavaScriptBytes)}`,
    });
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow(
      'Production web artifact exceeds the maximum JavaScript size.',
    );
  });

  it('index.html이 없는 artifact를 거부한다', async () => {
    const directory = await createArtifact({ hasIndex: false });
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow('Production web artifact is missing index.html.');
  });

  it('assets directory가 없는 artifact를 거부한다', async () => {
    const directory = await createArtifact({ hasAssets: false });
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow('Production web artifact is missing assets directory.');
  });
});
