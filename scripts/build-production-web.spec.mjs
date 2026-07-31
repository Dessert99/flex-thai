/** production web build runner가 검증된 artifact만 다음 배포 단계에 넘기는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';

const apiBaseUrl = 'https://api.example.com/api/v1';
const loadBuildRunner = () => import('./build-production-web.mjs');

describe('production web 빌드 실행기', () => {
  it('API subdomain으로 web을 build한 뒤 같은 dist를 검증한다', async () => {
    const events = [];
    const run = vi.fn(async (invocation) => {
      events.push('build');
      return { exitCode: 0, invocation, stderr: '', stdout: '' };
    });
    const verifyArtifact = vi.fn(async (options) => {
      events.push('verify');
      return options;
    });
    const { buildProductionWeb } = await loadBuildRunner();

    await expect(
      buildProductionWeb({ rootDomain: 'example.com', run, verifyArtifact }),
    ).resolves.toMatchObject({ apiBaseUrl, directory: 'frontend/web/dist' });

    expect(run).toHaveBeenCalledWith({
      command: 'pnpm',
      args: ['--filter', '@flex-thia/web', 'build'],
      env: { VITE_API_BASE_URL: apiBaseUrl },
    });
    expect(verifyArtifact).toHaveBeenCalledWith({
      apiBaseUrl,
      directory: 'frontend/web/dist',
      maximumJavaScriptBytes: 500_000,
    });
    expect(events).toEqual(['build', 'verify']);
  });

  it('유효하지 않은 root domain은 build 전에 거부한다', async () => {
    const run = vi.fn();
    const { buildProductionWeb } = await loadBuildRunner();

    await expect(
      buildProductionWeb({
        rootDomain: 'https://example.com',
        run,
        verifyArtifact: vi.fn(),
      }),
    ).rejects.toThrow('Production web build requires a valid root domain.');
    expect(run).not.toHaveBeenCalled();
  });

  it('web build가 실패하면 artifact 검증을 실행하지 않는다', async () => {
    const verifyArtifact = vi.fn();
    const { buildProductionWeb } = await loadBuildRunner();

    await expect(
      buildProductionWeb({
        rootDomain: 'example.com',
        run: async () => ({ exitCode: 1, stderr: 'build failed', stdout: '' }),
        verifyArtifact,
      }),
    ).rejects.toThrow('Production web build failed.');
    expect(verifyArtifact).not.toHaveBeenCalled();
  });

  it('route scan warning이 있으면 artifact 검증 전에 build를 실패시킨다', async () => {
    const verifyArtifact = vi.fn();
    const { buildProductionWeb } = await loadBuildRunner();

    await expect(
      buildProductionWeb({
        rootDomain: 'example.com',
        run: async () => ({
          exitCode: 0,
          stderr: '',
          stdout: 'Route file does not export a Route.',
        }),
        verifyArtifact,
      }),
    ).rejects.toThrow('Production web build emitted forbidden warnings.');
    expect(verifyArtifact).not.toHaveBeenCalled();
  });

  it('500KB chunk warning이 있으면 artifact 검증 전에 build를 실패시킨다', async () => {
    const verifyArtifact = vi.fn();
    const { buildProductionWeb } = await loadBuildRunner();

    await expect(
      buildProductionWeb({
        rootDomain: 'example.com',
        run: async () => ({
          exitCode: 0,
          stderr: 'Some chunks are larger than 500 kB after minification.',
          stdout: '',
        }),
        verifyArtifact,
      }),
    ).rejects.toThrow('Production web build emitted forbidden warnings.');
    expect(verifyArtifact).not.toHaveBeenCalled();
  });
});
