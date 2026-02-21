/**
 * Overlay deprecation warnings on the Date constructor.
 * Use Temporal from @js-temporal/polyfill instead.
 */

interface DateConstructor {
  /** @deprecated Use `Temporal.Now.instant()` instead of `new Date()`. */
  new (): globalThis.Date;

  /** @deprecated Use `Temporal.Now.instant()` instead of `new Date()`. */
  new (value: number | string): globalThis.Date;

  /** @deprecated Use `Temporal.Now.instant()` instead of `Date.now()`. */
  now(): number;

  /** @deprecated Use `Temporal.Instant.from()` or `Temporal.PlainDate.from()` instead. */
  parse(s: string): number;
}
