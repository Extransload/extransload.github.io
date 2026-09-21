import { generateKeyPairSync } from 'node:crypto';
import { expect, it } from 'vitest';
import { pemToDer } from '../worker/github';

it('accepts GitHub PKCS1 and PKCS8 keys and produces verifiable signatures', async () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicKey = await crypto.subtle.importKey(
    'spki',
    pair.publicKey.export({ type: 'spki', format: 'der' }),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  for (const type of ['pkcs1', 'pkcs8'] as const) {
    const pem = pair.privateKey.export({ type, format: 'pem' }).toString();
    for (const input of [pem, pem.replaceAll('\n', '\\n')]) {
      const key = await crypto.subtle.importKey(
        'pkcs8',
        pemToDer(input),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const message = new TextEncoder().encode('test-only');
      const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, message);
      expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature, message)).toBe(true);
    }
  }
});
