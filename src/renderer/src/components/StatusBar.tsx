import { useCallback, useEffect, useState, type ReactNode } from "react";

interface StatusBarProps {
  path: string | null;
  lastModifiedAt: Temporal.Instant | null;
  draggablePath?: string;
  hasUnreadNotifications?: boolean;
}

const RECENCY_THRESHOLD_MS = 30_000;

type TimeDisplayMode = "ago" | "absolute";

function formatAbsolute(instant: Temporal.Instant): string {
  const tz = Temporal.Now.timeZoneId();
  const zoned = instant.toZonedDateTimeISO(tz);
  const today = Temporal.Now.plainDateISO();
  const hour = zoned.hour;
  const minute = zoned.minute;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  const displayMinute = String(minute).padStart(2, "0");
  const time = `${displayHour}:${displayMinute} ${period}`;

  if (Temporal.PlainDate.compare(zoned.toPlainDate(), today) === 0) {
    return time;
  }
  const month = zoned.toPlainDate().toLocaleString("en-US", { month: "short" });
  return `${month} ${zoned.day}, ${zoned.year} at ${time}`;
}

function formatAgo(instant: Temporal.Instant): string {
  const totalSeconds = Math.max(
    0,
    Math.floor(Temporal.Now.instant().since(instant).total({ unit: "seconds" })),
  );
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days} days, ${hours} hours ago`;
  }
  if (hours > 0) {
    return `${hours} hours, ${minutes} min ago`;
  }
  if (minutes > 0) {
    return `${minutes} min, ${seconds} sec ago`;
  }
  return `${seconds} sec ago`;
}

function ModifiedTime({ instant }: { instant: Temporal.Instant }): ReactNode {
  const [mode, setMode] = useState<TimeDisplayMode>("ago");
  const [, setTick] = useState(0);

  const elapsedMs = Temporal.Now.instant().since(instant).total({ unit: "milliseconds" });
  const isRecent = elapsedMs < RECENCY_THRESHOLD_MS;

  useEffect(() => {
    if (mode !== "ago") {
      return;
    }
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [mode, instant]);

  const text = mode === "ago" ? formatAgo(instant) : formatAbsolute(instant);

  return (
    <span
      className="ml-auto shrink-0 flex items-center gap-1 transition-colors duration-500"
      style={{ color: isRecent ? "var(--status-glow)" : undefined }}
    >
      <span className="select-text">{text}</span>
      <button
        className="opacity-40 hover:opacity-100 hover:text-[var(--status-glow)] transition-all cursor-pointer"
        onClick={() => setMode((m) => (m === "ago" ? "absolute" : "ago"))}
        title={mode === "ago" ? "Show time" : "Show elapsed"}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 1L0.5 3L3 5" />
          <line x1="0.5" y1="3" x2="9.5" y2="3" />
          <path d="M7 5L9.5 7L7 9" />
          <line x1="9.5" y1="7" x2="0.5" y2="7" />
        </svg>
      </button>
    </span>
  );
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
  hasUnreadNotifications,
}: StatusBarProps): ReactNode {
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
      className={`
        h-7 flex items-center px-3 text-xs gap-2
        border-t transition-colors duration-300
        ${hasUnreadNotifications
          ? "bg-[var(--status-glow)]/15 border-[var(--status-glow)]/30 text-[var(--status-glow)]"
          : "bg-[var(--status-bg)] border-[var(--status-border)] text-[var(--status-text)]"
        }
      `}
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
      {lastModifiedAt && <ModifiedTime instant={lastModifiedAt} />}
      <span className="shrink-0 opacity-20 ml-1">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M2 10L10 2" />
          <path d="M6 10L10 6" />
        </svg>
      </span>
    </div>
  );
}
