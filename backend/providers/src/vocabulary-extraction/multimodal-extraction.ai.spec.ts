/* eslint-disable @typescript-eslint/require-await -- 비동기 HTTP 응답 fixture를 반환한다. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MultimodalExtractionAi,
  extractionConfig,
} from './multimodal-extraction.ai.js';
const config = {
  provider: 'gemini' as const,
  model: 'test',
  promptVersion: '1' as const,
};
afterEach(() => vi.unstubAllGlobals());
describe('multimodal vocabulary response validation', () => {
  it('fails closed without provider credentials', () =>
    expect(() => extractionConfig({})).toThrow('AI_NOT_CONFIGURED'));
  it('rejects truncated responses even when JSON looks valid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              candidates: [
                {
                  finishReason: 'MAX_TOKENS',
                  content: { parts: [{ text: '{"words":[]}' }] },
                },
              ],
            }),
          ),
      ),
    );
    await expect(
      new MultimodalExtractionAi({ GEMINI_API_KEY: 'test' }).extract({
        config,
        prompt: 'extract',
        document: { text: 'source' },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow();
  });
  it('sends PDF bytes and validates extracted Thai', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: 'STOP',
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        words: [
                          {
                            thai: 'กิน',
                            meaningKo: '먹다',
                            partOfSpeech: '동사',
                            context: 'กินข้าว',
                          },
                        ],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const words = await new MultimodalExtractionAi({
      GEMINI_API_KEY: 'test',
    }).extract({
      config,
      prompt: 'extract',
      document: { pdf: new Uint8Array([1, 2]) },
      signal: new AbortController().signal,
    });
    expect(words[0]?.thai).toBe('กิน');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('generateContent'),
      expect.objectContaining({
        body: expect.stringContaining('application/pdf') as unknown,
      }),
    );
  });
});

it('uses Claude by default and sends PDF documents through the Messages API', async () => {
  const selected = extractionConfig({
    EXTRACTION_AI_MODEL: 'test-claude',
    ANTHROPIC_API_KEY: 'test-key',
  });
  expect(selected.provider).toBe('claude');
  const request = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: '{"words":[]}' }],
      }),
    ),
  );
  vi.stubGlobal('fetch', request);
  await new MultimodalExtractionAi({ ANTHROPIC_API_KEY: 'test-key' }).extract({
    config: selected,
    prompt: 'extract',
    document: { pdf: new Uint8Array([1, 2]) },
    signal: new AbortController().signal,
  });
  expect(request.mock.calls[0]?.[0]).toBe(
    'https://api.anthropic.com/v1/messages',
  );
  const options = request.mock.calls[0]?.[1];
  expect(options?.headers).toMatchObject({ 'x-api-key': 'test-key' });
  expect(options?.body).toContain('"type":"document"');
  expect(options?.body).toContain('"media_type":"application/pdf"');
  expect(options?.body).toContain('"model":"test-claude"');
});

it.each(['claude', 'gemini'] as const)(
  'sends an image with its MIME type to %s',
  async (provider) => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify(
            provider === 'claude'
              ? {
                  stop_reason: 'end_turn',
                  content: [{ type: 'text', text: '{"words":[]}' }],
                }
              : {
                  candidates: [
                    {
                      finishReason: 'STOP',
                      content: { parts: [{ text: '{"words":[]}' }] },
                    },
                  ],
                },
          ),
        ),
      );
    vi.stubGlobal('fetch', fetch);
    await new MultimodalExtractionAi({
      ANTHROPIC_API_KEY: 'test',
      GEMINI_API_KEY: 'test',
    }).extract({
      config: { ...config, provider },
      prompt: 'extract',
      document: { image: new Uint8Array([137, 80]), mimeType: 'image/png' },
      signal: new AbortController().signal,
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('image/png') as unknown,
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('iVA=') as unknown,
      }),
    );
    if (provider === 'claude')
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"type":"image"') as unknown,
        }),
      );
  },
);
