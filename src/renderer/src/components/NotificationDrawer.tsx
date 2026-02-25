import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { classNames } from "../classNames";
import type { BrptNotification } from "../types";

const MIN_WIDTH = 200;
const DEFAULT_WIDTH = 360;

interface NotificationDrawerProps {
  notifications: BrptNotification[];
  open: boolean;
  width: number;
  onResize: (width: number) => void;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;

  const today = new Date();
  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  ) {
    return `${displayHour}:${minutes} ${period}`;
  }

  const month = date.toLocaleString("en-US", { month: "short" });
  return `${month} ${date.getDate()}, ${date.getFullYear()} at ${displayHour}:${minutes} ${period}`;
}

function NotificationItem({ notification }: { notification: BrptNotification }): ReactNode {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.innerHTML = window.mdview.renderMarkdown(notification.content);
    }
  }, [notification.content]);

  return (
    <div className="border-b border-[var(--sidebar-border)] px-3 py-2.5">
      <div className="text-[10px] opacity-50 mb-1.5">
        {formatTimestamp(notification.receivedAt)}
      </div>
      <div className="rounded p-2 notification-content" style={{ background: "var(--bg)" }}>
        <div
          ref={bodyRef}
          className="markdown-body text-xs"
        />
      </div>
    </div>
  );
}

export { DEFAULT_WIDTH as DEFAULT_DRAWER_WIDTH };

const VIEWER_MIN_WIDTH = 400;

export function NotificationDrawer({ notifications, open, width, onResize }: NotificationDrawerProps): ReactNode {
  const reversed = [...notifications].reverse();
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      if (containerRef.current) {
        containerRef.current.style.transition = "none";
      }
      const startX = e.clientX;
      const startWidth = width;
      const containerWidth = containerRef.current?.parentElement?.clientWidth ?? Infinity;
      const maxWidth = containerWidth - VIEWER_MIN_WIDTH;

      function onMouseMove(e: MouseEvent): void {
        if (!dragging.current) {
          return;
        }
        const newWidth = Math.min(
          maxWidth,
          Math.max(MIN_WIDTH, startWidth - (e.clientX - startX))
        );
        onResize(newWidth);
      }

      function onMouseUp(): void {
        dragging.current = false;
        if (containerRef.current) {
          containerRef.current.style.transition = "";
        }
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [width, onResize]
  );

  return (
    <div ref={containerRef} className="flex shrink-0 overflow-hidden" style={{ width: open ? width : 0, transition: "width 150ms ease" }}>
      <div
        className={classNames(
          "w-1 cursor-col-resize shrink-0 bg-[var(--sidebar-bg)]",
          "border-x border-[var(--sidebar-border)]",
          "hover:bg-[var(--tab-hover-bg)]",
          "active:bg-[var(--tab-hover-bg)]"
        )}
        onMouseDown={handleResizeStart}
      />
      <div
        className="flex-1 flex flex-col h-full overflow-hidden"
        style={{
          minWidth: MIN_WIDTH,
          background: "var(--sidebar-bg)",
        }}
      >
        <div
          className="h-8 flex items-center px-3 text-xs font-medium shrink-0 border-b"
          style={{ borderColor: "var(--sidebar-border)" }}
        >
          Notifications ({notifications.length})
        </div>
        <div className="flex-1 overflow-y-auto">
          {reversed.length === 0 && (
            <div className="px-3 py-4 text-xs opacity-40 text-center">
              No notifications
            </div>
          )}
          {reversed.map((n) => (
            <NotificationItem key={n.id} notification={n} />
          ))}
        </div>
      </div>
    </div>
  );
}
