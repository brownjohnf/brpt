import { useEffect, useState, type ReactNode } from "react";

interface StatusBarProps {
  path: string | null;
  lastModifiedAt: Temporal.Instant | null;
}

const RECENCY_THRESHOLD_MS = 30_000;

function formatTime(instant: Temporal.Instant): string {
  const zoned = instant.toZonedDateTimeISO(Temporal.Now.timeZoneId());
  const hour = zoned.hour;
  const minute = zoned.minute;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  const displayMinute = String(minute).padStart(2, "0");
  return `Modified at ${displayHour}:${displayMinute} ${period}`;
}

function computeRemaining(instant: Temporal.Instant | null): number {
  if (!instant) {
    return 0;
  }
  const elapsed = Temporal.Now.instant()
    .since(instant)
    .total({ unit: "milliseconds" });
  return Math.max(0, RECENCY_THRESHOLD_MS - elapsed);
}

function useIsRecent(instant: Temporal.Instant | null): boolean {
  const remaining = computeRemaining(instant);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const r = computeRemaining(instant);
    if (r <= 0) {
      return;
    }
    const timer = setTimeout(() => setExpired(true), r);
    return () => {
      clearTimeout(timer);
      setExpired(false);
    };
  }, [instant]);

  return remaining > 0 && !expired;
}

export function StatusBar({
  path,
  lastModifiedAt,
}: StatusBarProps): ReactNode {
  const isRecent = useIsRecent(lastModifiedAt);

  return (
    <div
      className="
        h-7 flex items-center px-3 text-xs
        bg-[var(--status-bg)] border-t border-[var(--status-border)]
        text-[var(--status-text)]
      "
    >
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
        {path ? `Watching: ${path}` : ""}
      </span>
      {lastModifiedAt && (
        <span
          className="ml-auto shrink-0 transition-colors duration-500"
          style={{
            color: isRecent ? "var(--status-glow)" : undefined,
          }}
        >
          {formatTime(lastModifiedAt)}
        </span>
      )}
    </div>
  );
}
