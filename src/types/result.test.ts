import { describe, expect, it } from 'vitest';

import {
  err,
  isErr,
  isOk,
  map,
  mapAsync,
  ok,
  type Result,
  tryAsync,
  trySync,
  unwrap,
  unwrapOr,
} from './result';

describe('Result', () => {
  it('ok() and err() construct the right shape', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
    expect(err('boom')).toEqual({ ok: false, error: 'boom' });
  });

  it('isOk / isErr narrow correctly', () => {
    const a = ok(1);
    const b = err('x');
    if (isOk(a)) expect(a.value).toBe(1);
    if (isErr(b)) expect(b.error).toBe('x');
  });

  it('unwrap returns the value or throws the error', () => {
    expect(unwrap(ok(7))).toBe(7);
    expect(() => unwrap(err(new Error('nope')))).toThrow('nope');
  });

  it('unwrapOr returns the fallback on err', () => {
    expect(unwrapOr(ok(7), 0)).toBe(7);
    expect(unwrapOr(err(new Error('x')), 0)).toBe(0);
  });

  it('map transforms the value but preserves the error', () => {
    expect(map(ok(2), (n) => n * 10)).toEqual({ ok: true, value: 20 });
    const e = err('x') as Result<number, string>;
    expect(map(e, (n) => n * 10)).toEqual({ ok: false, error: 'x' });
  });

  it('mapAsync awaits the transform', async () => {
    const r = await mapAsync(ok(2), async (n) => n * 10);
    expect(r).toEqual({ ok: true, value: 20 });
  });

  it('trySync catches thrown errors', () => {
    const r = trySync(() => {
      throw new Error('sync-fail');
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(Error);
  });

  it('tryAsync catches rejected promises', async () => {
    const r = await tryAsync(async () => {
      throw new Error('async-fail');
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe('async-fail');
  });

  it('tryAsync wraps non-Error rejections', async () => {
    const r = await tryAsync(async () => {
      throw 'plain string';
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(Error);
  });
});
