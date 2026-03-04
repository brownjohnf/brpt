import type { ReactNode } from "react";

interface TopBarProps {
  children?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  hasUnreadNotifications?: boolean;
  animations?: "normal" | "jack";
}

export function TopBar({ children, left, right, hasUnreadNotifications, animations = "normal" }: TopBarProps): ReactNode {
  const breathing = hasUnreadNotifications
    ? (animations === "normal" ? "true" : "static")
    : undefined;
  return (
    <div
      data-breathing={breathing}
      className={`flex items-center justify-between gap-2 px-4 shrink-0 border-b transition-colors duration-300 ${
        hasUnreadNotifications
          ? "border-[var(--status-glow)]/30"
          : "border-[var(--sidebar-border)]"
      }`}
      style={{
        height: "var(--top-bar-height)",
        ...(!hasUnreadNotifications ? { background: "var(--sidebar-bg)" } : {}),
      }}
    >
      {left}
      <div className="flex items-center justify-between gap-2 flex-1 min-w-0">
        {children}
      </div>
      {right}
    </div>
  );
}

function SidebarIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="12"
      viewBox="0 0 14 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="1" width="12" height="10" rx="1.5" />
      <line x1="5" y1="1" x2="5" y2="11" />
    </svg>
  );
}

interface SidebarToggleProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function SidebarToggle({ sidebarOpen, onToggleSidebar }: SidebarToggleProps): ReactNode {
  return (
    <button
      className={`shrink-0 cursor-pointer transition-opacity ${sidebarOpen ? "opacity-100" : "opacity-40 hover:opacity-100"}`}
      onClick={onToggleSidebar}
      title="Toggle sidebar"
    >
      <SidebarIcon />
    </button>
  );
}

function BellIcon(): ReactNode {
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
      <path d="M9 5a3 3 0 1 0-6 0c0 3.5-1.5 4.5-1.5 4.5h9S9 8.5 9 5Z" />
      <path d="M4.5 9.5v.5a1.5 1.5 0 0 0 3 0v-.5" />
    </svg>
  );
}

function HamburgerIcon(): ReactNode {
  return (
    <svg
      width="12"
      height="10"
      viewBox="0 0 12 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <line x1="1" y1="1.5" x2="11" y2="1.5" />
      <line x1="1" y1="5" x2="11" y2="5" />
      <line x1="1" y1="8.5" x2="11" y2="8.5" />
    </svg>
  );
}

interface DrawerToggleProps {
  drawerOpen: boolean;
  unreadNotificationCount: number;
  onToggleDrawer: () => void;
  shaking?: boolean;
}

export function DrawerToggle({ drawerOpen, unreadNotificationCount, onToggleDrawer, shaking }: DrawerToggleProps): ReactNode {
  return (
    <>
      {unreadNotificationCount > 0 && (
        <button
          data-shaking={shaking ? "true" : undefined}
          className="shrink-0 relative cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
          onClick={onToggleDrawer}
          title={`${unreadNotificationCount} unread notification${unreadNotificationCount === 1 ? "" : "s"}`}
        >
          <BellIcon />
          <span
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
            style={{ background: "var(--tab-changed-dot)" }}
          />
        </button>
      )}
      <button
        className={`shrink-0 cursor-pointer transition-opacity ${drawerOpen ? "opacity-100" : "opacity-40 hover:opacity-100"}`}
        onClick={onToggleDrawer}
        title="Toggle drawer"
      >
        <HamburgerIcon />
      </button>
    </>
  );
}
