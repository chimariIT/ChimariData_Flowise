/**
 * Utility Types
 */

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

export type Nullable<T> = T | null;

export type Maybe<T> = T | null | undefined;

export type AsyncResult<T> = Promise<T>;

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type Awaited<T> = T extends Promise<infer U> ? U : T;
