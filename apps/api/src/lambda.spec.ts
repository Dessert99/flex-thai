/** warm Lambda invocation이 NestJS server를 재부팅하지 않게 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import { createCachedLambdaHandler } from './lambda.js';

describe('createCachedLambdaHandler', () => {
  it('첫 invocation에서만 server를 만들고 이후 같은 handler를 재사용한다', async () => {
    const server = vi.fn().mockResolvedValue({ statusCode: 200 });
    const createServer = vi.fn().mockResolvedValue(server);
    const handler = createCachedLambdaHandler(createServer);

    await handler({ requestContext: {} } as never, {} as never);
    await handler({ requestContext: {} } as never, {} as never);

    expect(createServer).toHaveBeenCalledTimes(1);
    expect(server).toHaveBeenCalledTimes(2);
  });
});
