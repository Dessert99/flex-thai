/** production web artifact가 배포에 필요한 실행 경계를 지키는지 검증한다 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const apiBaseUrl = 'https://api.example.com/api/v1';
const maximumJavaScriptBytes = 500_000;
const artifactDirectories = [];

const loadVerifier = () => import('./verify-production-web-artifact.mjs');

const createArtifact = async ({
  applicationSource = apiBaseUrl,
  additionalJavaScript = {},
  manifest = {
    application: {
      file: 'assets/application.js',
      isEntry: true,
    },
  },
  hasAssets = true,
  hasIndex = true,
  indexSource = '<main>FLEX THIA</main><script type="module" src="/assets/application.js"></script>',
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
    await Promise.all(
      Object.entries(additionalJavaScript).map(([name, source]) =>
        writeFile(join(directory, 'assets', name), source),
      ),
    );
    await mkdir(join(directory, '.vite'));
    await writeFile(
      join(directory, '.vite', 'manifest.json'),
      JSON.stringify(manifest),
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

  it('classic external script는 거부한다', async () => {
    const directory = await createArtifact({
      indexSource: '<script src="/assets/application.js"></script>',
    });
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow(
      'Production web artifact must contain exactly one tracked module script.',
    );
  });

  it('nomodule 속성이 있는 module script는 거부한다', async () => {
    const directory = await createArtifact({
      indexSource:
        '<script type="module" nomodule src="/assets/application.js"></script>',
    });
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow(
      'Production web artifact must contain exactly one tracked module script.',
    );
  });

  it('inline module script는 거부한다', async () => {
    const directory = await createArtifact({
      indexSource: '<script type="module">console.log("inline")</script>',
    });
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow(
      'Production web artifact must contain exactly one tracked module script.',
    );
  });

  it('inline classic script는 거부한다', async () => {
    const directory = await createArtifact({
      indexSource: '<script>console.log("inline")</script>',
    });
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow(
      'Production web artifact must contain exactly one tracked module script.',
    );
  });

  it('.mjs module script는 거부한다', async () => {
    const directory = await createArtifact({
      indexSource:
        '<script type="module" src="/assets/application.mjs"></script>',
    });
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow(
      'Production web artifact must contain exactly one tracked module script.',
    );
  });

  it('추적하지 않는 600KB classic script가 두 번째로 있으면 거부한다', async () => {
    const directory = await createArtifact({
      additionalJavaScript: {
        'unverified.js': 'x'.repeat(600_000),
      },
      indexSource:
        '<script type="module" src="/assets/application.js"></script><script src="/assets/unverified.js"></script>',
    });
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow(
      'Production web artifact must contain exactly one tracked module script.',
    );
  });

  it.each([
    ['빈 값', ''],
    ['HTTP URL', 'http://api.example.com/api/v1'],
    ['잘못된 URL', 'not-a-url'],
    ['API subdomain이 아닌 URL', 'https://example.com/api/v1'],
    ['잘못된 pathname', 'https://api.example.com/v1'],
    ['trailing slash URL', 'https://api.example.com/api/v1/'],
    ['query 포함 URL', 'https://api.example.com/api/v1?mode=prod'],
    ['hash 포함 URL', 'https://api.example.com/api/v1#prod'],
  ])('유효하지 않은 API base URL(%s)은 즉시 거부한다', async (_case, value) => {
    const directory = await createArtifact();
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl: value,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow(
      'Production web artifact requires a valid HTTPS API base URL.',
    );
  });

  it.each([
    ['0', 0],
    ['음수', -1],
    ['소수', 1.5],
    ['safe integer 초과', Number.MAX_SAFE_INTEGER + 1],
  ])(
    '유효하지 않은 JavaScript 크기 제한(%s)은 즉시 거부한다',
    async (_case, value) => {
      const directory = await createArtifact();
      const { verifyProductionWebArtifact } = await loadVerifier();

      await expect(
        verifyProductionWebArtifact({
          directory,
          apiBaseUrl,
          maximumJavaScriptBytes: value,
        }),
      ).rejects.toThrow(
        'Production web artifact requires a positive JavaScript size limit.',
      );
    },
  );

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

  it('index에서 참조하지 않은 decoy JavaScript의 API URL은 인정하지 않는다', async () => {
    const directory = await createArtifact({
      additionalJavaScript: { 'decoy.js': apiBaseUrl },
      applicationSource: 'console.log("entry");',
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

  it('index entry가 import한 module graph의 API URL은 인정한다', async () => {
    const directory = await createArtifact({
      additionalJavaScript: { 'api.js': apiBaseUrl },
      applicationSource: 'import "./api.js";',
      manifest: {
        api: { file: 'assets/api.js' },
        application: {
          file: 'assets/application.js',
          imports: ['api'],
          isEntry: true,
        },
      },
    });
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).resolves.toMatchObject({
      indexFile: 'index.html',
      javaScriptFiles: ['assets/application.js', 'assets/api.js'],
    });
  });

  it('공백 없는 Rollup import·export도 manifest module graph로 추적한다', async () => {
    const directory = await createArtifact({
      additionalJavaScript: {
        'api.js': 'export const api=1;',
        'endpoint.js': apiBaseUrl,
      },
      applicationSource:
        'import{api as value}from"./api.js";export*from"./endpoint.js";',
      manifest: {
        api: { file: 'assets/api.js' },
        application: {
          file: 'assets/application.js',
          imports: ['api', 'endpoint'],
          isEntry: true,
        },
        endpoint: { file: 'assets/endpoint.js' },
      },
    });
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).resolves.toMatchObject({
      javaScriptFiles: [
        'assets/application.js',
        'assets/api.js',
        'assets/endpoint.js',
      ],
    });
  });

  it('외부 directory를 가리키는 .vite symlink는 거부한다', async () => {
    const directory = await createArtifact();
    const externalDirectory = await mkdtemp(
      join(tmpdir(), 'flex-thia-manifest-directory-'),
    );
    artifactDirectories.push(externalDirectory);
    await writeFile(
      join(externalDirectory, 'manifest.json'),
      JSON.stringify({
        application: {
          file: 'assets/application.js',
          isEntry: true,
        },
      }),
    );
    await rm(join(directory, '.vite'), { force: true, recursive: true });
    await symlink(externalDirectory, join(directory, '.vite'));
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow(
      'Production web artifact manifest must stay inside .vite.',
    );
  });

  it('외부 file을 가리키는 manifest symlink는 거부한다', async () => {
    const directory = await createArtifact();
    const externalDirectory = await mkdtemp(
      join(tmpdir(), 'flex-thia-manifest-file-'),
    );
    artifactDirectories.push(externalDirectory);
    const externalManifestPath = join(externalDirectory, 'manifest.json');
    await writeFile(
      externalManifestPath,
      JSON.stringify({
        application: {
          file: 'assets/application.js',
          isEntry: true,
        },
      }),
    );
    await rm(join(directory, '.vite', 'manifest.json'));
    await symlink(
      externalManifestPath,
      join(directory, '.vite', 'manifest.json'),
    );
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow(
      'Production web artifact manifest must stay inside .vite.',
    );
  });

  it('module script와 일치해도 isEntry가 아니면 거부한다', async () => {
    const directory = await createArtifact({
      manifest: {
        application: {
          file: 'assets/application.js',
          isEntry: false,
        },
      },
    });
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow(
      'Production web artifact manifest must describe exactly one entry JavaScript.',
    );
  });

  it('같은 module script와 일치하는 entry record가 중복되면 거부한다', async () => {
    const directory = await createArtifact({
      manifest: {
        duplicate: {
          file: 'assets/application.js',
          isEntry: true,
        },
        application: {
          file: 'assets/application.js',
          isEntry: true,
        },
      },
    });
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow(
      'Production web artifact manifest must describe exactly one entry JavaScript.',
    );
  });

  it('module script와 일치하는 entry record가 없으면 거부한다', async () => {
    const directory = await createArtifact({
      manifest: {
        other: {
          file: 'assets/other.js',
          isEntry: true,
        },
      },
    });
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow(
      'Production web artifact manifest must describe exactly one entry JavaScript.',
    );
  });

  it('modulepreload가 entry의 reachable graph에 있으면 통과시킨다', async () => {
    const directory = await createArtifact({
      additionalJavaScript: { 'api.js': 'export const api=1;' },
      indexSource:
        '<link rel="modulepreload" href="/assets/api.js"><script crossorigin type="module" src="/assets/application.js"></script>',
      manifest: {
        api: { file: 'assets/api.js' },
        application: {
          file: 'assets/application.js',
          imports: ['api'],
          isEntry: true,
        },
      },
    });
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).resolves.toMatchObject({
      javaScriptFiles: ['assets/application.js', 'assets/api.js'],
    });
  });

  it('entry graph 밖의 modulepreload는 거부한다', async () => {
    const directory = await createArtifact({
      additionalJavaScript: { 'decoy.js': 'export const decoy=1;' },
      indexSource:
        '<link rel="modulepreload" href="/assets/decoy.js"><script type="module" src="/assets/application.js"></script>',
      manifest: {
        application: {
          file: 'assets/application.js',
          isEntry: true,
        },
        decoy: { file: 'assets/decoy.js' },
      },
    });
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow(
      'Production web artifact modulepreload must belong to the entry graph.',
    );
  });

  it('../../ reference로 artifact root를 벗어나면 거부한다', async () => {
    const directory = await createArtifact({
      applicationSource: 'import "../../escape.js";',
      manifest: {
        application: {
          file: 'assets/application.js',
          imports: ['escape'],
          isEntry: true,
        },
        escape: { file: '../../escape.js' },
      },
    });
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow(
      'Production web artifact JavaScript must stay inside assets.',
    );
  });

  it('artifact root 안이어도 assets 밖의 JavaScript는 거부한다', async () => {
    const directory = await createArtifact({
      applicationSource: 'import "../root.js";',
      manifest: {
        application: {
          file: 'assets/application.js',
          imports: ['root'],
          isEntry: true,
        },
        root: { file: 'root.js' },
      },
    });
    await writeFile(join(directory, 'root.js'), apiBaseUrl);
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow(
      'Production web artifact JavaScript must stay inside assets.',
    );
  });

  it('assets symlink가 외부 JavaScript를 가리키면 거부한다', async () => {
    const directory = await createArtifact({
      applicationSource: 'import "./external.js";',
      manifest: {
        application: {
          file: 'assets/application.js',
          imports: ['external'],
          isEntry: true,
        },
        external: { file: 'assets/external.js' },
      },
    });
    const externalDirectory = await mkdtemp(
      join(tmpdir(), 'flex-thia-external-'),
    );
    artifactDirectories.push(externalDirectory);
    const externalPath = join(externalDirectory, 'external.js');
    await writeFile(externalPath, apiBaseUrl);
    await symlink(externalPath, join(directory, 'assets', 'external.js'));
    const { verifyProductionWebArtifact } = await loadVerifier();

    await expect(
      verifyProductionWebArtifact({
        directory,
        apiBaseUrl,
        maximumJavaScriptBytes,
      }),
    ).rejects.toThrow(
      'Production web artifact JavaScript must stay inside assets.',
    );
  });

  it('scan에서 빠지는 symlink module도 reachable 크기 제한을 적용한다', async () => {
    const directory = await createArtifact({
      applicationSource: `${apiBaseUrl};import "./large.js";`,
      manifest: {
        application: {
          file: 'assets/application.js',
          imports: ['large'],
          isEntry: true,
        },
        large: { file: 'assets/large.js' },
      },
    });
    const payloadPath = join(directory, 'assets', 'large.payload');
    await writeFile(payloadPath, 'x'.repeat(maximumJavaScriptBytes + 1));
    await symlink(payloadPath, join(directory, 'assets', 'large.js'));
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
