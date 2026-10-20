import { describe, expect, it } from 'vitest';
import { SIGN_IN } from './config';
import {
  answerMatches,
  cryptoSecrets,
  emailKey,
  hashSecret,
  issue,
  normaliseEmail,
  rateKey,
} from './secrets';

const fixed = { code: () => '042137', token: () => 'link-token', salt: () => 'salt' };

describe('issue', () => {
  it('keeps only salted hashes, expiring after the TTL', () => {
    const { code, token, record } = issue(1000, fixed);
    expect({ code, token }).toEqual({ code: '042137', token: 'link-token' });
    expect(record).toEqual({
      codeHash: hashSecret('salt', '042137'),
      linkHash: hashSecret('salt', 'link-token'),
      salt: 'salt',
      expiresAt: 1000 + SIGN_IN.ttlSeconds,
      sentAt: 1000,
      attempts: 0,
    });
    expect(JSON.stringify(record)).not.toMatch(/042137|link-token/);
  });

  it('makes 6-digit codes and long random tokens', () => {
    for (let i = 0; i < 200; i++) expect(cryptoSecrets.code()).toMatch(/^\d{6}$/);
    expect(cryptoSecrets.token()).toMatch(/^[\w-]{43}$/);
    expect(cryptoSecrets.token()).not.toBe(cryptoSecrets.token());
    expect(cryptoSecrets.salt()).not.toBe(cryptoSecrets.salt());
  });
});

describe('answerMatches', () => {
  const { record } = issue(0, fixed);

  it('accepts the code, with stray spaces, or the link token', () => {
    expect(answerMatches(record, '042137')).toBe(true);
    expect(answerMatches(record, ' 042 137 ')).toBe(true);
    expect(answerMatches(record, 'link-token')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const wrong of ['042138', '42137', '', 'link-token2', '0421370']) {
      expect(answerMatches(record, wrong)).toBe(false);
    }
  });

  it("doesn't accept the code as a link or the hash itself", () => {
    expect(answerMatches(record, record.codeHash)).toBe(false);
    expect(answerMatches(record, record.linkHash)).toBe(false);
  });
});

describe('normaliseEmail', () => {
  it('trims and lower-cases', () => {
    expect(normaliseEmail('  Ada@Example.COM ')).toBe('ada@example.com');
  });

  it('rejects non-addresses', () => {
    for (const bad of [
      undefined,
      42,
      '',
      'ada',
      'ada@',
      '@example.com',
      'a b@c.d',
      'ada@example',
    ]) {
      expect(normaliseEmail(bad)).toBeNull();
    }
    expect(normaliseEmail(`${'a'.repeat(250)}@b.cd`)).toBeNull();
  });
});

describe('store keys', () => {
  it('never hold the address or IP in the clear', () => {
    expect(emailKey('ada@example.com')).toMatch(/^signin#[0-9a-f]{64}$/);
    expect(rateKey('ip', '203.0.113.9', 7)).toMatch(/^rate#ip#[0-9a-f]{64}#7$/);
    expect(rateKey('email', 'ada@example.com', 7)).not.toBe(rateKey('email', 'ada@example.com', 8));
  });
});
