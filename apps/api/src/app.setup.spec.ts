/** 공개 health 경로만 API version prefix에서 제외하는지 검증한다 */
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { configureApp } from './app.setup.js';

describe('configureApp', () => {
  it('/health와 /ready만 api/v1 prefix에서 제외한다', () => {
    const app = {
      setGlobalPrefix: vi.fn(),
      useLogger: vi.fn(),
      useGlobalFilters: vi.fn(),
      enableCors: vi.fn(),
    };

    configureApp(app as never, ['http://localhost:5173']);

    expect(app.setGlobalPrefix).toHaveBeenCalledWith('api/v1', {
      exclude: [
        { path: 'health', method: RequestMethod.GET },
        { path: 'ready', method: RequestMethod.GET },
      ],
    });
  });
});
