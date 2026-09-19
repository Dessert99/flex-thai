import { describe, expect, it } from 'vitest';
import { isPublicAddress } from './public-web.reader.js';
describe('public source addresses', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
  ])('rejects %s', (value) => expect(isPublicAddress(value)).toBe(false));
  it('accepts public IPv4', () =>
    expect(isPublicAddress('8.8.8.8')).toBe(true));
});
