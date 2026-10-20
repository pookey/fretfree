import { describe, expect, it } from 'vitest';
import { errorName } from './aws';
import { json, jsonBody } from './http';

describe('jsonBody', () => {
  it('parses plain and base64 bodies', () => {
    expect(jsonBody({ body: '{"a":1}' })).toEqual({ a: 1 });
    const b64 = Buffer.from('{"a":2}').toString('base64');
    expect(jsonBody({ body: b64, isBase64Encoded: true })).toEqual({ a: 2 });
  });

  it('is undefined for no body or bad JSON', () => {
    expect(jsonBody({})).toBeUndefined();
    expect(jsonBody({ body: null })).toBeUndefined();
    expect(jsonBody({ body: '{' })).toBeUndefined();
  });
});

describe('json', () => {
  it('is uncached JSON unless headers say otherwise', () => {
    expect(json(200, { ok: true })).toEqual({
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: '{"ok":true}',
    });
    expect(json(200, 1, { 'cache-control': 'max-age=5' }).headers['cache-control']).toBe(
      'max-age=5',
    );
  });
});

describe('errorName', () => {
  it('names SDK errors and stringifies anything else', () => {
    const e = new Error('x');
    e.name = 'UsernameExistsException';
    expect(errorName(e)).toBe('UsernameExistsException');
    expect(errorName('boom')).toBe('boom');
  });
});
