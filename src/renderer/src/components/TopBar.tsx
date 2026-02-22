import type { ReactNode } from "react";

interface TopBarProps {
  children?: ReactNode;
}

export function TopBar({ children }: TopBarProps): JSX.Element {
  return (
    <div
      className="flex items-center justify-between gap-2 px-4 py-1 shrink-0 border-b border-[var(--sidebar-border)]"
      style={{ background: "var(--sidebar-bg)" }}
    >
      {children}
    </div>
  );
}
