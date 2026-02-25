import { useCallback, useEffect, useState, type ReactNode } from "react";

interface StatusBarProps {
  path: string | null;
  lastModifiedAt: Temporal.Instant | null;
  draggablePath?: string;
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

function ClipboardIcon(): ReactNode {
  return (
    <svg
      width="10"
      height="12"
      viewBox="0 0 10 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="2.5" width="6.5" height="8.5" rx="1" />
      <path d="M7 2.5V2a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h.5" />
    </svg>
  );
}

function FileIcon(): ReactNode {
  return (
    <svg
      width="12"
      height="14"
      viewBox="0 0 12 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 1H2.5A1.5 1.5 0 0 0 1 2.5v9A1.5 1.5 0 0 0 2.5 13h7a1.5 1.5 0 0 0 1.5-1.5V5L7 1Z" />
      <polyline points="7 1 7 5 11 5" />
    </svg>
  );
}

export function StatusBar({
  path,
  lastModifiedAt,
  draggablePath,
}: StatusBarProps): ReactNode {
  const isRecent = useIsRecent(lastModifiedAt);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (draggablePath) {
        e.preventDefault();
        window.mdview.startFileDrag(draggablePath);
      }
    },
    [draggablePath],
  );

  return (
    <div
      className="
        h-7 flex items-center px-3 text-xs gap-2
        bg-[var(--status-bg)] border-t border-[var(--status-border)]
        text-[var(--status-text)]
      "
    >
      {draggablePath && (
        <span
          draggable="true"
          onDragStart={handleDragStart}
          className="shrink-0 cursor-grab opacity-60 hover:opacity-100 transition-opacity"
          title="Drag to share file"
        >
          <FileIcon />
        </span>
      )}
      {path && (
        <span
          className="group/copy flex items-center gap-1.5 overflow-hidden cursor-pointer hover:text-[var(--tab-active-text)] transition-colors"
          onClick={() => navigator.clipboard.writeText(path)}
          title="Copy path"
        >
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
            Watching: {path}
          </span>
          <span className="shrink-0 opacity-40 group-hover/copy:opacity-100 group-hover/copy:text-[var(--status-glow)] transition-all">
            <ClipboardIcon />
          </span>
        </span>
      )}
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
