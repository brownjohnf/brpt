import { useEffect, useRef, type ReactNode } from "react";
import type { BrptNotification } from "../types";

interface NotificationDrawerProps {
  notifications: BrptNotification[];
  open: boolean;
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

const DRAWER_WIDTH = 360;

export function NotificationDrawer({ notifications, open }: NotificationDrawerProps): ReactNode {
  const reversed = [...notifications].reverse();

  return (
    <div
      className="shrink-0 overflow-hidden transition-[width] duration-100 ease-in-out"
      style={{ width: open ? DRAWER_WIDTH : 0 }}
    >
      <div
        className="flex flex-col border-l h-full overflow-hidden"
        style={{
          width: DRAWER_WIDTH,
          background: "var(--sidebar-bg)",
          borderColor: "var(--sidebar-border)",
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
