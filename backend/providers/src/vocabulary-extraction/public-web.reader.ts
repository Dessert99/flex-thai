import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIPv4 } from 'node:net';
import { load } from 'cheerio';

/** IPv4 public unicast만 허용하고 검증한 주소로 접속하여 DNS rebinding을 막는다. */
export function isPublicAddress(address: string) {
  if (!isIPv4(address)) return false;
  const [a = 0, b = 0, c = 0] = address.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export async function readPublicWeb(
  urlString: string,
  signal: AbortSignal,
  redirects = 0,
): Promise<string> {
  const url = new URL(urlString);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  )
    throw new Error('SOURCE_URL_INVALID');
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  if (
    !addresses.length ||
    addresses.some((item) => !isPublicAddress(item.address))
  )
    throw new Error('SOURCE_URL_PRIVATE');
  const address = addresses[0];
  if (!address) throw new Error('SOURCE_URL_INVALID');
  const response = await new Promise<{
    status: number;
    location: string | undefined;
    type: string;
    body: string;
  }>((resolve, reject) => {
    const req = request(
      url,
      {
        signal,
        family: 4,
        lookup: (_host, _options, callback) =>
          callback(null, address.address, 4),
        headers: {
          'User-Agent': 'FlexThaiVocabulary/1.0',
          Accept: 'text/html,text/plain',
          'Accept-Encoding': 'identity',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 2_000_000) {
            req.destroy(new Error('SOURCE_TOO_LARGE'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 500,
            location: res.headers.location,
            type: res.headers['content-type'] ?? '',
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
  if (
    [301, 302, 303, 307, 308].includes(response.status) &&
    response.location
  ) {
    if (redirects >= 3) throw new Error('SOURCE_REDIRECT_LIMIT');
    return readPublicWeb(
      new URL(response.location, url).href,
      signal,
      redirects + 1,
    );
  }
  if (response.status !== 200) throw new Error('SOURCE_FETCH_FAILED');
  if (response.type.includes('text/plain')) return response.body;
  if (!response.type.includes('text/html'))
    throw new Error('SOURCE_CONTENT_UNSUPPORTED');
  const $ = load(response.body);
  $('script,style,noscript,nav,footer,header,iframe,svg').remove();
  const main = $('main,article').first();
  return (main.length ? main : $('body')).text().replace(/\s+/gu, ' ').trim();
}
