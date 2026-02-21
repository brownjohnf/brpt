/// <reference types="vite/client" />

import type { Temporal as TemporalType } from "@js-temporal/polyfill";

declare global {
  const Temporal: typeof TemporalType;
  namespace Temporal {
    export type Instant = TemporalType.Instant;
    export type ZonedDateTime = TemporalType.ZonedDateTime;
    export type PlainDate = TemporalType.PlainDate;
    export type PlainTime = TemporalType.PlainTime;
    export type PlainDateTime = TemporalType.PlainDateTime;
    export type Duration = TemporalType.Duration;
    export type Now = typeof TemporalType.Now;
  }
}
