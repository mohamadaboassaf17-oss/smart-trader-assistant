/**
 * Result<T, E> — a minimal, type-safe replacement for throwing exceptions
 * across non-UI boundaries (services, composables, sync queue, repos).
 *
 * Discriminated union: `ok === true` carries `value: T`; `ok === false`
 * carries `error: E`. Use `ok()` / `err()` to construct, `unwrap` for the
 * success case, `unwrapOr` for the fallback case.
 *
 * Rules of use:
 *   - Never throw from service-layer functions; return a Result.
 *   - The UI may `unwrapOr` and surface a toast — that is the only place
 *     a user-facing message is built.
 *   - Sync queue, IDB, and Supabase clients all return Result.
 */

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return !r.ok;
}

export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw r.error instanceof Error ? r.error : new Error(String(r.error));
}

export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

export function map<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

export async function mapAsync<T, U, E>(
  r: Result<T, E>,
  fn: (v: T) => Promise<U>,
): Promise<Result<U, E>> {
  return r.ok ? ok(await fn(r.value)) : r;
}

export async function tryAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export function trySync<T>(fn: () => T): Result<T, Error> {
  try {
    return ok(fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
