import type { Env } from './types';
import { repoParts } from './config';

async function githubAppToken(env: Env) {
  if (!env.GITHUB_APP_ID || !env.GITHUB_INSTALLATION_ID || !env.GITHUB_PRIVATE_KEY)
    throw new Error('GitHub App settings are missing');
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: Math.floor(Date.now() / 1000) - 60,
    exp: Math.floor(Date.now() / 1000) + 540,
    iss: env.GITHUB_APP_ID,
  };
  const enc = (value: unknown) =>
    btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const data = `${enc(header)}.${enc(payload)}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(env.GITHUB_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data));
  const jwt = `${data}.${btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')}`;
  const response = await fetch(`https://api.github.com/app/installations/${env.GITHUB_INSTALLATION_ID}/access_tokens`, {
    method: 'POST',
    headers: ghHeaders(jwt),
  });
  const result = (await response.json()) as { token?: string };
  if (!result.token) throw new Error('GitHub installation token failed');
  return result.token;
}
export function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const normalized = pem.replaceAll('\\n', '\n').replaceAll('\\r', '\r').trim();
  const match = normalized.match(
    /^-----BEGIN (RSA PRIVATE KEY|PRIVATE KEY)-----\s*([A-Za-z0-9+/=\s]+)-----END \1-----$/,
  );
  if (!match) throw new Error('Unsupported GitHub private key format');
  const bytes = Uint8Array.from(atob(match[2].replace(/\s/g, '')), (char) => char.charCodeAt(0));
  if (match[1] === 'PRIVATE KEY') return bytes;
  // Wrap PKCS#1 RSAPrivateKey in a PKCS#8 PrivateKeyInfo for Web Crypto.
  const der = (tag: number, body: Uint8Array): Uint8Array<ArrayBuffer> => {
    const length: number[] = [];
    for (let n = body.length; n > 0; n >>>= 8) length.unshift(n & 255);
    return new Uint8Array([tag, ...(body.length < 128 ? [body.length] : [0x80 | length.length, ...length]), ...body]);
  };
  return der(
    0x30,
    new Uint8Array([
      0x02,
      0x01,
      0x00,
      0x30,
      0x0d,
      0x06,
      0x09,
      0x2a,
      0x86,
      0x48,
      0x86,
      0xf7,
      0x0d,
      0x01,
      0x01,
      0x01,
      0x05,
      0x00,
      ...der(0x04, bytes),
    ]),
  );
}
const ghHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'extransload-admin',
});
export async function githubRequest(env: Env, path: string, init: RequestInit = {}) {
  const token = await githubAppToken(env);
  return fetch(`https://api.github.com${path}`, { ...init, headers: { ...ghHeaders(token), ...(init.headers ?? {}) } });
}
export async function getRepoFile(env: Env, path: string) {
  const { owner, repo } = repoParts(env);
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const response = await githubRequest(env, `/repos/${owner}/${repo}/contents/${encodedPath}?ref=main`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub read failed: ${response.status}`);
  return response.json() as Promise<{ sha: string; content: string; path: string; encoding: string }>;
}
export async function putRepoFile(env: Env, path: string, content: string, sha: string | undefined, message: string) {
  const { owner, repo } = repoParts(env);
  const body: Record<string, string> = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch: 'main',
  };
  if (sha) body.sha = sha;
  const response = await githubRequest(env, `/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`GitHub write failed: ${response.status}`);
  return response.json() as Promise<{ commit: { sha: string } }>;
}
